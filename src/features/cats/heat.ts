/**
 * Auswertung der Rolligkeit einer Königin (F53/F54).
 *
 * Grundgedanke: Die Züchterin trägt Beginn (und wenn sie daran denkt auch das
 * Ende) einer Rolligkeit ein. Daraus ergibt sich der Zyklus — aber nur, wenn
 * genug Daten da sind. Lieber ehrlich schweigen als eine Zahl erfinden:
 * unter {@link MIN_CYCLES_FOR_PREDICTION} Zyklen gibt es keine Vorhersage.
 *
 * Diese Datei ist frei von React und von Datenbankzugriffen.
 */

import type { ISODate } from '../../types';
import {
  addDays,
  daysBetween,
  formatDate,
  parseISODate,
  toISODate,
  todayISO,
} from '../../lib/date';

/** Ab so vielen Rolligkeiten wagt die App eine Vorhersage. */
export const MIN_CYCLES_FOR_PREDICTION = 3;

/**
 * Beginnt ein Eintrag höchstens so viele Tage nach dem Ende (bzw. Beginn) des
 * vorigen, gilt er als derselbe Vorgang — sie hat doppelt eingetragen oder
 * die Rolligkeit über zwei Einträge dokumentiert.
 */
export const SAME_HEAT_GAP_DAYS = 3;

/** So lange gilt eine Rolligkeit ohne Enddatum noch als laufend. */
export const ONGOING_MAX_DAYS = 14;

/* ------------------------------------------------------------------ */
/*  Typen                                                              */
/* ------------------------------------------------------------------ */

/** Roheingabe — bewusst tolerant, weil auch Unfug in der Datenbank stehen kann. */
export interface HeatInput {
  id?: string;
  startDate?: ISODate | null;
  endDate?: ISODate | null;
}

export interface HeatCycleSpan {
  id?: string;
  startDate: ISODate;
  endDate?: ISODate;
  /** Dauer in Tagen, Beginn und Ende eingeschlossen. */
  durationDays?: number;
  /** true, wenn mehrere Einträge zu dieser Rolligkeit zusammengefasst wurden. */
  merged?: boolean;
}

export interface HeatPrediction {
  /** Wahrscheinlichster Beginn der nächsten Rolligkeit. */
  date: ISODate;
  /** Frühester Beginn nach dem kürzesten bisher gemessenen Abstand. */
  earliest: ISODate;
  /** Spätester Beginn nach dem längsten bisher gemessenen Abstand. */
  latest: ISODate;
  /** Auf wie vielen Rolligkeiten die Schätzung beruht. */
  basedOnCycles: number;
  /** Auf wie vielen Abständen die Schätzung beruht (= Zyklen − 1). */
  basedOnIntervals: number;
  /** Tage, die der geschätzte Termin bereits zurückliegt (0 = nicht überfällig). */
  overdueDays: number;
}

export interface HeatAnalysis {
  /** Aufsteigend sortiert, überlappende Einträge zusammengefasst. */
  cycles: HeatCycleSpan[];
  count: number;
  /** Einträge ohne brauchbares Beginn-Datum. */
  ignoredCount: number;
  /** Wie viele Einträge in einen anderen eingerechnet wurden. */
  mergedCount: number;
  /** Abstände zwischen den Beginn-Daten in Tagen, aufsteigend nach Zeit. */
  intervals: number[];
  averageDays?: number;
  medianDays?: number;
  minDays?: number;
  maxDays?: number;
  /** Streuung (Standardabweichung) der Abstände in Tagen. */
  spreadDays?: number;
  /** Mittlere Dauer der Rolligkeit; nur aus Einträgen mit Ende. */
  averageDurationDays?: number;
  last?: HeatCycleSpan;
  /** Tage seit Beginn der letzten Rolligkeit (negativ = liegt in der Zukunft). */
  daysSinceLastStart?: number;
  /** Die letzte Rolligkeit hat kein Ende und liegt noch nicht lange zurück. */
  ongoing: boolean;
  prediction?: HeatPrediction;
  /** Ehrlicher Klartext für die Oberfläche — immer gefüllt. */
  summary: string;
}

/* ------------------------------------------------------------------ */
/*  Hilfen                                                             */
/* ------------------------------------------------------------------ */

/** Prüft "YYYY-MM-DD" und lehnt Unmögliches wie "2026-02-31" ab. */
export function isValidISODate(d: unknown): d is ISODate {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const parsed = parseISODate(d);
  return !Number.isNaN(parsed.getTime()) && toISODate(parsed) === d;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Standardabweichung der Grundgesamtheit. Bei einem einzigen Wert: 0. */
function stdDev(values: number[]): number | undefined {
  const m = mean(values);
  if (m == null) return undefined;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function laterDate(a: ISODate, b: ISODate): ISODate {
  return daysBetween(a, b) > 0 ? b : a;
}

/* ------------------------------------------------------------------ */
/*  Aufbereitung                                                       */
/* ------------------------------------------------------------------ */

/**
 * Bringt die Einträge in Reihenfolge, wirft Unbrauchbares weg und fasst
 * überlappende (oder unmittelbar aneinander anschließende) Einträge zusammen.
 */
export function normalizeHeatCycles(entries: readonly HeatInput[] | null | undefined): {
  cycles: HeatCycleSpan[];
  ignoredCount: number;
  mergedCount: number;
} {
  const valid: HeatCycleSpan[] = [];
  let ignoredCount = 0;

  for (const e of entries ?? []) {
    if (!e || !isValidISODate(e.startDate)) {
      ignoredCount += 1;
      continue;
    }
    const startDate = e.startDate;
    let endDate = isValidISODate(e.endDate) ? e.endDate : undefined;
    // Ein Ende vor dem Beginn ist ein Vertipper — dann lieber kein Ende.
    if (endDate && daysBetween(startDate, endDate) < 0) endDate = undefined;
    valid.push({ id: e.id, startDate, endDate });
  }

  valid.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || (a.endDate ?? '').localeCompare(b.endDate ?? ''),
  );

  const cycles: HeatCycleSpan[] = [];
  let mergedCount = 0;

  for (const c of valid) {
    const prev = cycles[cycles.length - 1];
    const prevEnd = prev ? (prev.endDate ?? prev.startDate) : undefined;

    if (prev && prevEnd && daysBetween(prevEnd, c.startDate) <= SAME_HEAT_GAP_DAYS) {
      mergedCount += 1;
      prev.merged = true;
      if (c.endDate) {
        prev.endDate = prev.endDate ? laterDate(prev.endDate, c.endDate) : c.endDate;
      } else if (prev.endDate) {
        // Ohne eigenes Ende zieht der spätere Beginn das Ende höchstens nach hinten.
        prev.endDate = laterDate(prev.endDate, c.startDate);
      }
      continue;
    }
    cycles.push({ ...c });
  }

  for (const c of cycles) {
    if (c.endDate) c.durationDays = daysBetween(c.startDate, c.endDate) + 1;
  }

  return { cycles, ignoredCount, mergedCount };
}

/* ------------------------------------------------------------------ */
/*  Auswertung                                                         */
/* ------------------------------------------------------------------ */

export function analyzeHeatCycles(
  entries: readonly HeatInput[] | null | undefined,
  ref: ISODate = todayISO(),
): HeatAnalysis {
  const { cycles, ignoredCount, mergedCount } = normalizeHeatCycles(entries);

  const intervals: number[] = [];
  for (let i = 1; i < cycles.length; i++) {
    intervals.push(daysBetween(cycles[i - 1].startDate, cycles[i].startDate));
  }

  const durations = cycles.map((c) => c.durationDays).filter((d): d is number => d != null);
  const last = cycles[cycles.length - 1];
  const daysSinceLastStart = last ? daysBetween(last.startDate, ref) : undefined;

  const ongoing =
    last != null &&
    !last.endDate &&
    daysSinceLastStart != null &&
    daysSinceLastStart >= 0 &&
    daysSinceLastStart <= ONGOING_MAX_DAYS;

  const averageDays = mean(intervals);
  const medianDays = median(intervals);
  const minDays = intervals.length ? Math.min(...intervals) : undefined;
  const maxDays = intervals.length ? Math.max(...intervals) : undefined;
  const spreadDays = intervals.length ? stdDev(intervals) : undefined;

  let prediction: HeatPrediction | undefined;
  if (last && cycles.length >= MIN_CYCLES_FOR_PREDICTION && medianDays != null) {
    const date = addDays(last.startDate, Math.round(medianDays));
    const overdue = daysBetween(date, ref);
    prediction = {
      date,
      earliest: addDays(last.startDate, minDays ?? Math.round(medianDays)),
      latest: addDays(last.startDate, maxDays ?? Math.round(medianDays)),
      basedOnCycles: cycles.length,
      basedOnIntervals: intervals.length,
      overdueDays: overdue > 0 ? overdue : 0,
    };
  }

  return {
    cycles,
    count: cycles.length,
    ignoredCount,
    mergedCount,
    intervals,
    averageDays,
    medianDays,
    minDays,
    maxDays,
    spreadDays,
    averageDurationDays: mean(durations),
    last,
    daysSinceLastStart,
    ongoing,
    prediction,
    summary: buildSummary(cycles.length, intervals, averageDays, medianDays),
  };
}

function days(n: number): string {
  return `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
}

/**
 * "Letzte Rolligkeit vor 18 Tagen (12.03.2026)." — die Angabe, die in der
 * Übersicht ausdrücklich verlangt ist. Ohne erfasste Rolligkeit: undefined.
 */
export function lastHeatSummary(
  analysis: Pick<HeatAnalysis, 'last' | 'daysSinceLastStart'>,
): string | undefined {
  const last = analysis.last;
  if (!last) return undefined;
  const date = formatDate(last.startDate);
  const since = analysis.daysSinceLastStart;

  if (since == null || !Number.isFinite(since)) return `Letzte Rolligkeit am ${date}.`;
  if (since < 0) return `Letzte Rolligkeit am ${date} — das Datum liegt in der Zukunft.`;
  if (since === 0) return `Letzte Rolligkeit: heute begonnen (${date}).`;
  return `Letzte Rolligkeit vor ${days(since)} (${date}).`;
}

function buildSummary(
  count: number,
  intervals: number[],
  averageDays?: number,
  medianDays?: number,
): string {
  if (count === 0) return 'Noch keine Rolligkeit erfasst.';
  if (count === 1) {
    return 'Eine Rolligkeit erfasst. Für einen Zyklus sind mindestens drei nötig.';
  }
  if (count === 2) {
    return `Zwei Rolligkeiten, ${days(intervals[0])} Abstand. Für eine Vorhersage fehlt noch eine dritte.`;
  }
  const avg = averageDays != null ? Math.round(averageDays) : undefined;
  const med = medianDays != null ? Math.round(medianDays) : undefined;
  const parts: string[] = [];
  if (avg != null) parts.push(`im Mittel alle ${days(avg)}`);
  if (med != null && med !== avg) parts.push(`Median ${days(med)}`);
  return `${count} Rolligkeiten, ${parts.join(', ')} — gerechnet aus ${intervals.length} ${
    intervals.length === 1 ? 'Abstand' : 'Abständen'
  }.`;
}
