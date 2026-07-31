/**
 * Auswertung der Kitten-Gewichte.
 *
 * Besonderheiten aus der Praxis (siehe docs/ANFORDERUNGEN.md):
 *  - In Woche 1–2 wird zweimal täglich gewogen, später alle zwei Tage.
 *  - Tage werden auch mal übersprungen.
 *  - Deshalb wird die Zunahme immer über den **echten Zeitabstand** gerechnet,
 *    nie über Kalendertage.
 *  - Die App bewertet und warnt, gibt aber ausdrücklich keine Handlungsempfehlung.
 */

import type { ISODateTime, WeightEntry, WeightThresholds } from '../types';
import { exactDaysBetween } from '../lib/date';

export type WeightLevel = 'ok' | 'watch' | 'concern' | 'critical' | 'unknown';

/**
 * Wie viele Messungen ein lebendes Kitten am Bezugstag vollständig machen.
 * In den ersten beiden Lebenswochen sind es zwei, danach eine. Ohne ein
 * belastbares Alter bleibt die Oberfläche beim konservativen Einmal-Ziel.
 */
export function dailyWeightMeasurementTarget(ageDays?: number): 1 | 2 {
  return Number.isFinite(ageDays) && (ageDays as number) >= 0 && (ageDays as number) < 14
    ? 2
    : 1;
}

export const WEIGHT_LEVEL_LABEL: Record<WeightLevel, string> = {
  ok: 'In Ordnung',
  watch: 'Beobachten',
  concern: 'Auffällig',
  critical: 'Kritisch',
  unknown: 'Keine Daten',
};

export interface WeightPoint {
  at: ISODateTime;
  grams: number;
}

export interface WeightAnalysis {
  /** Jüngste Messung. */
  latest?: WeightPoint;
  /** Vorherige Messung, für den direkten Vergleich. */
  previous?: WeightPoint;
  /** Unterschied zur vorherigen Messung in Gramm. */
  lastChangeG?: number;
  /** Geglättete Zunahme in g pro Tag über das Auswertefenster. */
  gainPerDay?: number;
  /** Tage, über die `gainPerDay` gerechnet wurde. */
  gainWindowDays?: number;
  /** Zunahme seit der ersten Messung in Gramm. */
  totalGainG?: number;
  /** Zunahme seit Geburt als Anteil, z. B. 0.85 = +85 %. */
  gainSinceBirthRatio?: number;
  level: WeightLevel;
  /** Klartext-Begründungen für die Einstufung. */
  reasons: string[];
}

/** Sortiert nach Zeit, aufsteigend. */
function sortEntries(entries: Pick<WeightEntry, 'at' | 'grams'>[]): WeightPoint[] {
  return entries
    .filter((e) => Number.isFinite(e.grams) && e.grams > 0)
    .map((e) => ({ at: e.at, grams: e.grams }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Zunahme in g/Tag über ein Fenster von `windowDays` Tagen ab der letzten
 * Messung. Sind im Fenster zu wenige Messungen, wird das Fenster erweitert,
 * bis mindestens zwei Punkte mit echtem Zeitabstand vorliegen.
 */
export function gainPerDay(
  points: WeightPoint[],
  windowDays = 3,
): { value: number; days: number } | undefined {
  if (points.length < 2) return undefined;
  const last = points[points.length - 1];

  // Ältesten Punkt suchen, der noch im Fenster liegt.
  let startIndex = points.length - 2;
  for (let i = points.length - 2; i >= 0; i--) {
    const span = exactDaysBetween(points[i].at, last.at);
    if (span > windowDays) break;
    startIndex = i;
  }

  let first = points[startIndex];
  let days = exactDaysBetween(first.at, last.at);

  // Mehrere Messungen am selben Tag: weiter zurückgehen, bis Zeit vergangen ist.
  let i = startIndex;
  while (days < 0.25 && i > 0) {
    i -= 1;
    first = points[i];
    days = exactDaysBetween(first.at, last.at);
  }
  if (days < 0.25) return undefined;

  return { value: (last.grams - first.grams) / days, days };
}

export interface AnalyzeOptions {
  /** Geburtsgewicht, falls bekannt. */
  birthWeightG?: number;
  /** Durchschnittsgewicht der Geschwister zum selben Zeitpunkt. */
  litterAverageG?: number;
  /** Alter in Tagen zum Zeitpunkt der letzten Messung. */
  ageDays?: number;
}

/**
 * Bewertet die Gewichtsentwicklung eines Kittens.
 *
 * Einstufung, von schwer nach leicht — die schwerste zutreffende gewinnt:
 *  - kritisch: Gewichtsverlust, oder Geburtsgewicht nach 48 h nicht wieder erreicht
 *  - auffällig: Geburtsgewicht unter der Schwelle, deutlich unter dem
 *    Wurfdurchschnitt, oder Zunahme unter der Beobachtungsschwelle
 *  - beobachten: Zunahme zwischen Beobachtungs- und Gutschwelle
 *  - in Ordnung: Zunahme ab der Gutschwelle
 */
export function analyzeWeights(
  entries: Pick<WeightEntry, 'at' | 'grams'>[],
  thresholds: WeightThresholds,
  options: AnalyzeOptions = {},
): WeightAnalysis {
  const points = sortEntries(entries);
  const reasons: string[] = [];

  if (points.length === 0) {
    return { level: 'unknown', reasons: ['Noch keine Wiegung erfasst.'] };
  }

  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : undefined;
  const lastChangeG = previous ? latest.grams - previous.grams : undefined;
  const first = points[0];
  const totalGainG = latest.grams - first.grams;

  const birthWeight = options.birthWeightG ?? first.grams;
  const gainSinceBirthRatio =
    birthWeight > 0 ? (latest.grams - birthWeight) / birthWeight : undefined;

  const gain = gainPerDay(points);

  let level: WeightLevel = 'unknown';

  /* --- kritisch ---------------------------------------------------- */

  // Der geglättete Mehrtageswert darf einen frischen Rückgang niemals
  // verdecken. Beispiel: 100 → 130 → 129 g ist über mehrere Tage noch im
  // Plus, seit der letzten Wiegung aber dennoch ein Gewichtsverlust.
  if (lastChangeG != null && lastChangeG <= 0) {
    level = 'critical';
    reasons.push(
      lastChangeG < 0
        ? `Gewichtsverlust seit der letzten Wiegung: ${Math.abs(lastChangeG)} g.`
        : 'Keine Zunahme seit der letzten Wiegung.',
    );
  }

  // Zusätzlich bleibt ein negativer/stehender Trend über das gesamte
  // Auswertefenster kritisch, auch wenn die jüngste Einzelmessung leicht
  // aufgeholt hat.
  if (gain && gain.value <= 0 && (lastChangeG == null || lastChangeG > 0)) {
    level = 'critical';
    reasons.push(
      gain.value < 0
        ? `Gewichtsverlust: ${gain.value.toFixed(1)} g pro Tag über ${gain.days.toFixed(1)} Tage.`
        : 'Keine Zunahme über den letzten Zeitraum.',
    );
  }

  // Geburtsgewicht nach 48 Stunden nicht wieder erreicht.
  if (options.birthWeightG && options.ageDays != null && options.ageDays >= 2) {
    if (latest.grams < options.birthWeightG) {
      level = 'critical';
      reasons.push(
        `Geburtsgewicht (${options.birthWeightG} g) nach ${Math.floor(options.ageDays)} Tagen noch nicht wieder erreicht.`,
      );
    }
  }

  /* --- auffällig --------------------------------------------------- */

  if (level !== 'critical') {
    if (gain && gain.value > 0 && gain.value < thresholds.watchGainG) {
      level = 'concern';
      reasons.push(
        `Zunahme ${gain.value.toFixed(1)} g/Tag liegt unter ${thresholds.watchGainG} g.`,
      );
    }
  }

  // Diese beiden Punkte gelten unabhängig von der Zunahme. Kritisch bleibt
  // kritisch — alles andere wird auf „auffällig" angehoben.
  if (options.birthWeightG && options.birthWeightG < thresholds.concernBirthWeightG) {
    if (level !== 'critical') level = 'concern';
    reasons.push(
      `Geburtsgewicht ${options.birthWeightG} g liegt unter ${thresholds.concernBirthWeightG} g.`,
    );
  }

  if (options.litterAverageG && options.litterAverageG > 0) {
    const belowPercent = ((options.litterAverageG - latest.grams) / options.litterAverageG) * 100;
    if (belowPercent >= thresholds.belowLitterAvgPercent) {
      if (level !== 'critical') level = 'concern';
      reasons.push(
        `${belowPercent.toFixed(0)} % unter dem Wurfdurchschnitt (${Math.round(options.litterAverageG)} g).`,
      );
    }
  }

  /* --- beobachten und in Ordnung ----------------------------------- */

  if (level === 'unknown' && gain) {
    if (gain.value >= thresholds.goodGainG) {
      level = 'ok';
      reasons.push(`Zunahme ${gain.value.toFixed(1)} g/Tag.`);
    } else {
      level = 'watch';
      reasons.push(
        `Zunahme ${gain.value.toFixed(1)} g/Tag liegt unter ${thresholds.goodGainG} g.`,
      );
    }
  }

  if (level === 'unknown' && !gain) {
    reasons.push('Für eine Bewertung fehlt eine zweite Wiegung.');
  }

  return {
    latest,
    previous,
    lastChangeG,
    gainPerDay: gain?.value,
    gainWindowDays: gain?.days,
    totalGainG,
    gainSinceBirthRatio,
    level,
    reasons,
  };
}

/* ------------------------------------------------------------------ */
/*  Wurfdurchschnitt                                                   */
/* ------------------------------------------------------------------ */

/**
 * Durchschnittliches Gewicht der Geschwister zum Zeitpunkt der jeweils
 * letzten Messung. Kitten ohne Messung zählen nicht mit.
 */
export function litterAverageWeight(
  entriesByKitten: Map<string, Pick<WeightEntry, 'at' | 'grams'>[]>,
  excludeKittenId?: string,
): number | undefined {
  const values: number[] = [];
  for (const [kittenId, entries] of entriesByKitten) {
    if (kittenId === excludeKittenId) continue;
    const points = sortEntries(entries);
    if (points.length === 0) continue;
    values.push(points[points.length - 1].grams);
  }
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Fasst mehrere Messungen desselben Tages zum Tagesmittel zusammen —
 * für die Kurvendarstellung.
 */
export function dailyAverages(entries: Pick<WeightEntry, 'at' | 'grams'>[]): { date: string; grams: number }[] {
  const buckets = new Map<string, number[]>();
  for (const e of sortEntries(entries)) {
    const d = new Date(e.at);
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const list = buckets.get(key);
    if (list) list.push(e.grams);
    else buckets.set(key, [e.grams]);
  }
  return [...buckets.entries()]
    .map(([date, list]) => ({ date, grams: list.reduce((a, b) => a + b, 0) / list.length }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Farbmarke passend zur Einstufung — für Badges und Punkte. */
export const WEIGHT_LEVEL_TONE: Record<WeightLevel, 'ok' | 'warn' | 'alert' | 'neutral'> = {
  ok: 'ok',
  watch: 'warn',
  concern: 'warn',
  critical: 'alert',
  unknown: 'neutral',
};
