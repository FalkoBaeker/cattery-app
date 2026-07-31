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
 * Legt einen Entwurf an und übernimmt, was aus Kitten und Interessent
 * schon bekannt ist. Alles bleibt änderbar — nichts wird erzwungen.
 */
export function neuerEntwurf(
  type: ContractType,
  settings: Settings,
  quellen: EntwurfQuellen = {},
): ContractData {
  const { kitten, litter, interest } = quellen;

  const basis: ContractData = {
    type,
    breed: settings.breed,
    buyers: interest
      ? [{ name: interest.name, address: interest.city ?? '', sex: undefined }]
      : [{ name: '', address: '' }],
    animals: kitten
      ? [
          {
            kittenId: kitten.id,
            name: kittenLabel(kitten),
            // Bei noch unbekanntem Geschlecht wird „Katze" vorgeschlagen;
            // im Formular ist es mit einem Tippen geändert.
            sex: kitten.sex === 'male' ? 'male' : 'female',
            birthDate: litter?.birthDate,
            chipNo: kitten.chipNo,
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

  return {
    ...basis,
    regularPriceCents: preis,
    discountCents: undefined,
    breedingUseStartDate: todayISO(),
    breedingUseMonths: VORGABE_NUTZUNGSMONATE,
    breedingUseExtensionMonths: VORGABE_VERLAENGERUNGSMONATE,
    handoverDeadlineDays: VORGABE_HERAUSGABETAGE,
    matingAttempts: VORGABE_DECKVERSUCHE,
    backPaymentDays: VORGABE_NACHZAHLUNGSTAGE,
  };
}

/**
 * Wechsel der Vertragsart, ohne bereits Eingetragenes zu verlieren.
 * Die Felder der jeweils anderen Art bleiben stehen — sie werden nur
 * nicht gedruckt.
 */
export function artWechseln(data: ContractData, type: ContractType, settings: Settings): ContractData {
  const vorlage = neuerEntwurf(type, settings);
  return {
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
  };
}
