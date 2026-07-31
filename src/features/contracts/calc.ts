/**
 * Rechnen rund um die Verträge — Preise, Fristen, Verwendungszweck.
 * Reine Funktionen ohne React und ohne Datenbank.
 *
 * Geld immer in Cent als Ganzzahl. Datum immer über src/lib/date.ts.
 */

import { addDays, addMonths, daysBetween, todayISO } from '../../lib/date';
import { joinAnd } from '../../lib/format';
import type { ContractAnimal, ContractParty, ISODate } from '../../types';
import { LUECKE } from './grammar';

/* ------------------------------------------------------------------ */
/*  Preise                                                             */
/* ------------------------------------------------------------------ */

/**
 * Restsumme = Gesamtpreis minus Anzahlung. Ohne Gesamtpreis gibt es keine
 * Restsumme (null), ohne Anzahlung ist sie gleich dem Gesamtpreis.
 * Negative Ergebnisse werden auf 0 geklemmt — eine Anzahlung über dem
 * Kaufpreis ist ein Tippfehler, kein Guthaben.
 */
export function restsummeCents(
  gesamtCents?: number | null,
  anzahlungCents?: number | null,
): number | null {
  if (gesamtCents == null || !Number.isFinite(gesamtCents)) return null;
  const anzahlung = anzahlungCents != null && Number.isFinite(anzahlungCents) ? anzahlungCents : 0;
  return Math.max(0, Math.round(gesamtCents) - Math.round(anzahlung));
}

/**
 * Ermäßigter Kaufpreis = regulärer Preis minus Preisnachlass.
 * Ohne regulären Preis gibt es kein Ergebnis.
 */
export function ermaessigterPreisCents(
  regulaerCents?: number | null,
  nachlassCents?: number | null,
): number | null {
  if (regulaerCents == null || !Number.isFinite(regulaerCents)) return null;
  const nachlass = nachlassCents != null && Number.isFinite(nachlassCents) ? nachlassCents : 0;
  return Math.max(0, Math.round(regulaerCents) - Math.round(nachlass));
}

/** Prüft, ob eine Anzahlung eingetragen ist (0 zählt als „keine"). */
export function hatAnzahlung(anzahlungCents?: number | null): boolean {
  return anzahlungCents != null && Number.isFinite(anzahlungCents) && anzahlungCents > 0;
}

/* ------------------------------------------------------------------ */
/*  Verwendungszweck                                                   */
/* ------------------------------------------------------------------ */

/** Banken kürzen längere Verwendungszwecke ab. */
export const VERWENDUNGSZWECK_MAX = 140;

/**
 * "Kaufvertrag Mia und Nala / Anna Muster und Ben Muster".
 * Fehlende Namen werden als Lücke gedruckt, damit man sie von Hand
 * ergänzen kann.
 */
export function verwendungszweck(
  animals: Pick<ContractAnimal, 'name'>[],
  buyers: Pick<ContractParty, 'name'>[],
): string {
  const tiere = animals.map((a) => a.name?.trim()).filter(Boolean) as string[];
  const kaeufer = buyers.map((b) => b.name?.trim()).filter(Boolean) as string[];
  const links = tiere.length ? joinAnd(tiere) : LUECKE;
  const rechts = kaeufer.length ? joinAnd(kaeufer) : LUECKE;
  const text = `Kaufvertrag ${links} / ${rechts}`.replace(/\s+/g, ' ').trim();
  return text.length > VERWENDUNGSZWECK_MAX
    ? `${text.slice(0, VERWENDUNGSZWECK_MAX - 1).trimEnd()}…`
    : text;
}

/* ------------------------------------------------------------------ */
/*  Fristen der Zuchtnutzung                                           */
/* ------------------------------------------------------------------ */

export const VORGABE_NUTZUNGSMONATE = 18;
export const VORGABE_VERLAENGERUNGSMONATE = 6;
export const VORGABE_HERAUSGABETAGE = 3;
export const VORGABE_DECKVERSUCHE = 2;
export const VORGABE_NACHZAHLUNGSTAGE = 14;

/**
 * Fristende: Überlassungsdatum plus Nutzungsmonate, bei Verlängerung
 * zusätzlich die Verlängerungsmonate. `addMonths` behandelt Monatsende
 * und Schaltjahr korrekt (31.08. + 18 Monate = 28./29.02.).
 */
export function fristende(
  startDate: ISODate,
  monate: number,
  verlaengerungsmonate = 0,
  verlaengert = false,
): ISODate {
  const basis = addMonths(startDate, Math.max(0, Math.round(monate)));
  if (!verlaengert) return basis;
  return addMonths(basis, Math.max(0, Math.round(verlaengerungsmonate)));
}

/**
 * Volle Monate bis zum Fristende. Zählt kalendarisch, nicht in 30-Tage-
 * Schritten: vom 15.01. bis zum 15.03. sind es genau 2 Monate.
 * Nach Fristablauf 0.
 */
export function monateBisFrist(deadline: ISODate, ref: ISODate = todayISO()): number {
  if (daysBetween(ref, deadline) <= 0) return 0;
  let monate = 0;
  // 600 Monate = 50 Jahre; sichere Obergrenze gegen Endlosschleifen.
  while (monate < 600 && daysBetween(addMonths(ref, monate + 1), deadline) >= 0) {
    monate += 1;
  }
  return monate;
}

/** Verbleibende Tage bis zum Fristende; negativ nach Ablauf. */
export function tageBisFrist(deadline: ISODate, ref: ISODate = todayISO()): number {
  return daysBetween(ref, deadline);
}

export type Erinnerungsstufe = 'keine' | 'sechs_monate' | 'drei_monate' | 'ein_monat' | 'abgelaufen';

export const ERINNERUNGSSTUFE_LABEL: Record<Erinnerungsstufe, string> = {
  keine: 'Frist läuft',
  sechs_monate: 'Noch etwa ein halbes Jahr',
  drei_monate: 'Noch etwa drei Monate',
  ein_monat: 'Weniger als ein Monat',
  abgelaufen: 'Frist abgelaufen',
};

/**
 * Erinnerungsstufe bei 6, 3 und 1 Monat vor Fristablauf.
 * Am Fristtag selbst gilt die Frist noch als laufend.
 */
export function erinnerungsstufe(
  deadline: ISODate,
  ref: ISODate = todayISO(),
): Erinnerungsstufe {
  if (daysBetween(ref, deadline) < 0) return 'abgelaufen';
  const monate = monateBisFrist(deadline, ref);
  if (monate < 1) return 'ein_monat';
  if (monate < 3) return 'drei_monate';
  if (monate < 6) return 'sechs_monate';
  return 'keine';
}

/** Letzter Tag für die Nachzahlung nach Fristablauf. */
export function nachzahlungBis(deadline: ISODate, tage: number): ISODate {
  return addDays(deadline, Math.max(0, Math.round(tage)));
}
