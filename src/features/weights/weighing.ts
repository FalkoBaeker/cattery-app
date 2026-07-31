/**
 * Reine Fachlogik der Schnellerfassung.
 *
 * Alles, was rechnet oder entscheidet, steht hier ohne React:
 * Eingabeprüfung, Fokuskette, Unterschied zur letzten Messung, Tagesfortschritt
 * und die Bewertung eines Kittens (Aufsatz auf `analyzeWeights`).
 */

import type { ID, ISODate, ISODateTime, WeightThresholds } from '../../types';
import { ageInDays, exactDaysBetween, toISODate } from '../../lib/date';
import { analyzeWeights, litterAverageWeight, type WeightAnalysis } from '../../domain/weight';
import { ageDaysAt, sortSamples, type WeightSample } from './chart';

/* ------------------------------------------------------------------ */
/*  Eingabe                                                            */
/* ------------------------------------------------------------------ */

/** Plausibler Bereich für ein Katzengewicht in Gramm. */
export const MIN_GRAMS = 1;
export const MAX_GRAMS = 12_000;

export type ParsedGrams = { ok: true; grams: number } | { ok: false; error: string };

/**
 * Liest eine Gramm-Eingabe. Erlaubt sind reine Zahlen; „245 g" und „245,5"
 * werden freundlich mitgenommen, weil die Waage in 1-g-Schritten misst und
 * gerundet wird.
 */
export function parseGrams(raw: string): ParsedGrams {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, error: 'Bitte ein Gewicht eingeben.' };

  const cleaned = trimmed.replace(/\s/g, '').replace(/g$/i, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: 'Bitte nur Zahlen eingeben — das Gewicht in Gramm.' };
  }

  const grams = Math.round(Number(cleaned));
  if (!Number.isFinite(grams) || grams < MIN_GRAMS || grams > MAX_GRAMS) {
    return {
      ok: false,
      error: `Bitte ein Gewicht zwischen ${MIN_GRAMS} und ${MAX_GRAMS} g eingeben.`,
    };
  }
  return { ok: true, grams };
}

/* ------------------------------------------------------------------ */
/*  Fokuskette                                                         */
/* ------------------------------------------------------------------ */

/**
 * Nächstes Kitten, das noch dran ist — ab dem aktuellen nach unten, dann von
 * vorn. Bereits erfasste werden übersprungen. `null`, wenn alle erfasst sind
 * (oder die Liste leer ist).
 */
export function nextFocusId(
  ids: ID[],
  currentId: ID | null,
  done: ReadonlySet<ID> = new Set(),
): ID | null {
  if (ids.length === 0) return null;
  const startRaw = currentId ? ids.indexOf(currentId) : -1;
  const start = startRaw < 0 ? -1 : startRaw;
  for (let step = 1; step <= ids.length; step++) {
    const id = ids[(start + step + ids.length * 2) % ids.length];
    if (id === currentId) continue;
    if (!done.has(id)) return id;
  }
  // Alle anderen erledigt — bleibt nur noch das aktuelle selbst.
  if (currentId && !done.has(currentId)) return currentId;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Vergleich mit der letzten Messung                                  */
/* ------------------------------------------------------------------ */

/**
 * Jüngste Messung *bis einschließlich* dem Zeitpunkt `at`. Die betrachtete
 * Messung selbst darf nicht in `entries` stecken — die Aufrufer schließen sie
 * aus. So bekommt auch die zweite von zwei Messungen mit exakt gleichem
 * Zeitstempel eine Vorgängerin.
 */
export function previousSample(entries: WeightSample[], at: ISODateTime): WeightSample | undefined {
  const sorted = sortSamples(entries).filter((e) => e.at <= at);
  return sorted[sorted.length - 1];
}

export interface WeightDelta {
  /** Unterschied in Gramm. */
  grams: number;
  /** Echter Zeitabstand in Stunden. */
  hours: number;
  /** Hochgerechnet auf einen Tag — nur ab einem Abstand von 6 Stunden sinnvoll. */
  perDay?: number;
  previous: WeightSample;
}

/**
 * Unterschied einer Messung zur vorherigen. Immer über den echten Zeitabstand,
 * nie über Kalendertage (F23/F24).
 */
export function deltaToPrevious(
  entries: WeightSample[],
  at: ISODateTime,
  grams: number,
): WeightDelta | undefined {
  const previous = previousSample(entries, at);
  if (!previous) return undefined;
  const days = exactDaysBetween(previous.at, at);
  const hours = days * 24;
  return {
    grams: grams - previous.grams,
    hours,
    perDay: days >= 0.25 ? (grams - previous.grams) / days : undefined,
    previous,
  };
}

/** Unterschied der jüngsten Messung zu ihrer Vorgängerin. */
export function latestDelta(entries: WeightSample[]): WeightDelta | undefined {
  const sorted = sortSamples(entries);
  const last = sorted[sorted.length - 1];
  if (!last) return undefined;
  return deltaToPrevious(sorted.slice(0, -1), last.at, last.grams);
}

/* ------------------------------------------------------------------ */
/*  Tagesfortschritt                                                   */
/* ------------------------------------------------------------------ */

/** Anzahl der Messungen an einem Kalendertag (lokale Zeit). */
export function measurementsOn(entries: WeightSample[], date: ISODate): number {
  return sortSamples(entries).filter((e) => toISODate(new Date(e.at)) === date).length;
}

export interface DayProgress {
  /** Kitten mit mindestens einer Messung an diesem Tag. */
  done: number;
  total: number;
  doneIds: ID[];
  /** Gesamtzahl der Messungen an diesem Tag über alle Kitten. */
  measurements: number;
}

export function dayProgress(
  kittenIds: ID[],
  entriesByKitten: ReadonlyMap<ID, WeightSample[]>,
  date: ISODate,
): DayProgress {
  const doneIds: ID[] = [];
  let measurements = 0;
  for (const id of kittenIds) {
    const n = measurementsOn(entriesByKitten.get(id) ?? [], date);
    measurements += n;
    if (n > 0) doneIds.push(id);
  }
  return { done: doneIds.length, total: kittenIds.length, doneIds, measurements };
}

/* ------------------------------------------------------------------ */
/*  Bewertung eines Kittens                                            */
/* ------------------------------------------------------------------ */

export interface KittenAnalysisInput {
  kittenId: ID;
  /** Messungen dieses Kittens. */
  entries: WeightSample[];
  /** Alle Kitten des Wurfes inkl. des eigenen — für den Wurfdurchschnitt. */
  litterEntries?: ReadonlyMap<ID, WeightSample[]>;
  birthWeightG?: number;
  /** Geburtsdatum: aus `bornAt` des Kittens oder aus dem Wurf. */
  birthDate?: ISODate;
  thresholds: WeightThresholds;
}

export interface KittenAnalysis extends WeightAnalysis {
  /** Alter in Tagen zum Zeitpunkt der letzten Messung. */
  ageDays?: number;
  /** Durchschnitt der Geschwister, gegen den verglichen wurde. */
  litterAverageG?: number;
  /** Aktuelles Gewicht der letzten Messung. */
  currentG?: number;
}

/**
 * Bewertung eines Kittens: Geburtsgewicht, Alter und Wurfdurchschnitt
 * werden zusammengetragen und an `analyzeWeights` übergeben.
 */
export function analyzeKitten(input: KittenAnalysisInput): KittenAnalysis {
  const entries = sortSamples(input.entries);
  const latest = entries[entries.length - 1];

  const ageDays =
    input.birthDate && latest ? Math.max(0, ageDaysAt(input.birthDate, latest.at)) : undefined;

  const litterAverageG = input.litterEntries
    ? litterAverageWeight(
        new Map([...input.litterEntries].map(([id, list]) => [id, list])),
        input.kittenId,
      )
    : undefined;

  const analysis = analyzeWeights(entries, input.thresholds, {
    birthWeightG: input.birthWeightG,
    litterAverageG,
    ageDays,
  });

  return {
    ...analysis,
    ageDays,
    litterAverageG,
    currentG: latest?.grams,
  };
}

/* ------------------------------------------------------------------ */
/*  Kleinkram für die Oberfläche                                       */
/* ------------------------------------------------------------------ */

/**
 * Lebenstag zu einem Datum — der Geburtstag ist Tag 0. Ohne Geburtsdatum
 * undefined. Liegt das Datum vor der Geburt, ist der Wert negativ; die
 * Beschriftung übernimmt `dayOfLifeLabel`.
 */
export function dayOfLife(birthDate: ISODate | undefined, date: ISODate): number | undefined {
  if (!birthDate) return undefined;
  const day = ageInDays(birthDate, date);
  return Number.isFinite(day) ? day : undefined;
}

/**
 * Beschriftung des Lebenstages für Kopfzeilen: „Tag 12", „Noch nicht geboren"
 * (geplanter Wurf mit Geburtsdatum in der Zukunft) oder „Ohne Geburtsdatum".
 */
export function dayOfLifeLabel(birthDate: ISODate | undefined, date: ISODate): string {
  const day = dayOfLife(birthDate, date);
  if (day == null) return 'Ohne Geburtsdatum';
  if (day < 0) return 'Noch nicht geboren';
  return `Tag ${day}`;
}
