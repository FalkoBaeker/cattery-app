/**
 * Kleine Helfer, die sich die drei Vertragsbildschirme teilen.
 * Bewusst ohne React, damit sie prüfbar bleiben.
 */

import { joinAnd } from '../../lib/format';
import { todayISO } from '../../lib/date';
import type {
  Contract,
  ContractData,
  ContractType,
  Interest,
  Kitten,
  Litter,
  Settings,
} from '../../types';
import {
  VORGABE_DECKVERSUCHE,
  VORGABE_HERAUSGABETAGE,
  VORGABE_NACHZAHLUNGSTAGE,
  VORGABE_NUTZUNGSMONATE,
  VORGABE_VERLAENGERUNGSMONATE,
} from './calc';
import { kittenLabel } from '../../types';

/** "Mia und Nala" — für Listen und Dateinamen. */
export function tierNamen(data: ContractData): string {
  const namen = data.animals.map((a) => a.name?.trim()).filter(Boolean) as string[];
  return namen.length ? joinAnd(namen) : 'ohne Tier';
}

/** "Anna Muster und Ben Muster" */
export function kaeuferNamen(data: ContractData): string {
  const namen = data.buyers.map((b) => b.name?.trim()).filter(Boolean) as string[];
  return namen.length ? joinAnd(namen) : 'ohne Käufer';
}

/** Zweizeiliger Eintrag in der Vertragsliste. */
export function vertragUntertitel(c: Contract): string {
  return `${kaeuferNamen(c.data)} · ${tierNamen(c.data)}`;
}

/** Sind die Verkäuferdaten vollständig genug für einen Vertrag? */
export function verkaeuferdatenFehlen(settings: Settings): boolean {
  return !settings.seller.name?.trim() || !settings.seller.address?.trim();
}

/* ------------------------------------------------------------------ */
/*  Neuer Entwurf                                                      */
/* ------------------------------------------------------------------ */

export interface EntwurfQuellen {
  kitten?: Kitten;
  litter?: Litter;
  interest?: Interest;
}

/**
 * Erzwingt die unverhandelbaren Grenzen von Vertrag B auch für alte oder
 * manuell veränderte Daten: ein bis zwei Tiere, ausschließlich weiblich.
 * Männliche Tiere werden nicht stillschweigend zu Katzen umetikettiert,
 * sondern aus diesem Vertragsentwurf entfernt.
 */
export function vertragsregelnAnwenden(data: ContractData): ContractData {
  const positive = (value: number | undefined, fallback: number) =>
    Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;
  const nonNegative = (value: number | undefined, fallback: number) =>
    Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : fallback;

  const normalized: ContractData = {
    ...data,
    breedingUseMonths:
      data.breedingUseMonths === undefined && data.type !== 'breeding_reserved'
        ? undefined
        : positive(data.breedingUseMonths, VORGABE_NUTZUNGSMONATE),
    breedingUseExtensionMonths:
      data.breedingUseExtensionMonths === undefined && data.type !== 'breeding_reserved'
        ? undefined
        : nonNegative(
            data.breedingUseExtensionMonths,
            VORGABE_VERLAENGERUNGSMONATE,
          ),
    handoverDeadlineDays:
      data.handoverDeadlineDays === undefined && data.type !== 'breeding_reserved'
        ? undefined
        : nonNegative(data.handoverDeadlineDays, VORGABE_HERAUSGABETAGE),
    matingAttempts:
      data.matingAttempts === undefined && data.type !== 'breeding_reserved'
        ? undefined
        : positive(data.matingAttempts, VORGABE_DECKVERSUCHE),
    backPaymentDays:
      data.backPaymentDays === undefined && data.type !== 'breeding_reserved'
        ? undefined
        : nonNegative(data.backPaymentDays, VORGABE_NACHZAHLUNGSTAGE),
  };

  if (normalized.type !== 'breeding_reserved') return normalized;
  const animals = normalized.animals.filter((animal) => animal.sex !== 'male').slice(0, 2);
  return {
    ...normalized,
    animals: animals.length > 0 ? animals : [{ name: '', sex: 'female' }],
  };
}

/**
 * Legt einen Entwurf an und übernimmt, was aus Kitten und Interessent
 * schon bekannt ist. Normale Angaben bleiben änderbar; die fachlichen
 * Grenzen von Vertrag B werden dabei immer eingehalten.
 */
export function neuerEntwurf(
  type: ContractType,
  settings: Settings,
  quellen: EntwurfQuellen = {},
): ContractData {
  const { kitten, litter, interest } = quellen;
  const passendesKitten =
    type === 'breeding_reserved' && kitten?.sex === 'male' ? undefined : kitten;

  const basis: ContractData = {
    type,
    breed: settings.breed,
    buyers: interest
      ? [{ name: interest.name, address: interest.city ?? '', sex: undefined }]
      : [{ name: '', address: '' }],
    animals: passendesKitten
      ? [
          {
            kittenId: passendesKitten.id,
            name: kittenLabel(passendesKitten),
            // Bei noch unbekanntem Geschlecht wird „Katze" vorgeschlagen;
            // im Formular ist es mit einem Tippen geändert.
            sex: passendesKitten.sex === 'male' ? 'male' : 'female',
            birthDate: litter?.birthDate,
            chipNo: passendesKitten.chipNo,
          },
        ]
      : [{ name: '', sex: 'female' }],
    additionalAgreement: '',
  };

  const preis =
    kitten?.priceCents ?? interest?.offeredPriceCents ?? settings.defaultKittenPriceCents;

  if (type === 'standard') {
    return {
      ...basis,
      totalPriceCents: preis,
      handoverText: '',
      handoverPlace: settings.seller.place ?? '',
    };
  }

  return vertragsregelnAnwenden({
    ...basis,
    regularPriceCents: preis,
    discountCents: undefined,
    breedingUseStartDate: todayISO(),
    breedingUseMonths: VORGABE_NUTZUNGSMONATE,
    breedingUseExtensionMonths: VORGABE_VERLAENGERUNGSMONATE,
    handoverDeadlineDays: VORGABE_HERAUSGABETAGE,
    matingAttempts: VORGABE_DECKVERSUCHE,
    backPaymentDays: VORGABE_NACHZAHLUNGSTAGE,
  });
}

/**
 * Wechsel der Vertragsart, ohne bereits Eingetragenes zu verlieren.
 * Die Felder der jeweils anderen Art bleiben stehen — sie werden nur
 * nicht gedruckt.
 */
export function artWechseln(data: ContractData, type: ContractType, settings: Settings): ContractData {
  const vorlage = neuerEntwurf(type, settings);
  return vertragsregelnAnwenden({
    ...vorlage,
    ...data,
    type,
    // Der schon eingetippte Preis wandert mit, statt verloren zu gehen.
    totalPriceCents: data.totalPriceCents ?? data.regularPriceCents,
    regularPriceCents: data.regularPriceCents ?? data.totalPriceCents,
    // Fristfelder der Zuchtnutzung dürfen nicht leer bleiben.
    breedingUseMonths: data.breedingUseMonths ?? vorlage.breedingUseMonths,
    breedingUseExtensionMonths:
      data.breedingUseExtensionMonths ?? vorlage.breedingUseExtensionMonths,
    handoverDeadlineDays: data.handoverDeadlineDays ?? vorlage.handoverDeadlineDays,
    matingAttempts: data.matingAttempts ?? vorlage.matingAttempts,
    backPaymentDays: data.backPaymentDays ?? vorlage.backPaymentDays,
    breedingUseStartDate: data.breedingUseStartDate ?? vorlage.breedingUseStartDate,
  });
}
