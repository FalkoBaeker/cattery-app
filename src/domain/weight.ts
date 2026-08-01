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

import type { ISODate, ISODateTime, WeightEntry, WeightThresholds } from '../types';
import { dateOf, daysBetween, exactDaysBetween } from '../lib/date';

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
  /** Historischer Startkontext; beeinflusst den Status nur bis zur Aufholung. */
  birthWeightContext?: {
    category: 'low' | 'very-low';
    phase: 'pending' | 'early-recovery' | 'recovered' | 'late-recovery';
    thresholdG: number;
    gainPercent?: number;
  };
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
  /** Geburtsdatum oder genauer Zeitpunkt für die Tag-2-/Tag-7-Auswertung. */
  birthDate?: ISODate;
  birthAt?: ISODateTime;
}

/** Studienbasierte Aufholziele für niedrig geborene Kitten. */
export const LOW_BIRTH_DAY2_GAIN_PERCENT = 9.5;
export const LOW_BIRTH_DAY7_GAIN_PERCENT = 58;
export const VERY_LOW_BIRTH_WEIGHT_G = 60;

const LEVEL_SEVERITY: Record<WeightLevel, number> = {
  unknown: 0,
  ok: 1,
  watch: 2,
  concern: 3,
  critical: 4,
};

function atLeast(level: WeightLevel, minimum: WeightLevel): WeightLevel {
  return LEVEL_SEVERITY[level] >= LEVEL_SEVERITY[minimum] ? level : minimum;
}

function pointAgeDays(
  point: WeightPoint,
  latest: WeightPoint,
  options: AnalyzeOptions,
): number | undefined {
  if (options.birthAt) return exactDaysBetween(options.birthAt, point.at);
  if (options.birthDate) return daysBetween(options.birthDate, dateOf(point.at));
  if (options.ageDays != null) {
    return options.ageDays - exactDaysBetween(point.at, latest.at);
  }
  return undefined;
}

/** Nächstgelegene Messung am Studien-Stichtag; außerhalb der Toleranz keine Hochrechnung. */
function checkpointPoint(
  points: WeightPoint[],
  latest: WeightPoint,
  options: AnalyzeOptions,
  targetDay: number,
  toleranceDays: number,
): WeightPoint | undefined {
  let best: { point: WeightPoint; distance: number } | undefined;
  for (const point of points) {
    const age = pointAgeDays(point, latest, options);
    if (age == null) continue;
    const distance = Math.abs(age - targetDay);
    if (distance > toleranceDays) continue;
    if (!best || distance < best.distance || (distance === best.distance && point.at > best.point.at)) {
      best = { point, distance };
    }
  }
  return best?.point;
}

function positiveRecoveryStreak(points: WeightPoint[], minimumSpanDays = 2): boolean {
  if (points.length < 3) return false;
  const lastThree = points.slice(-3);
  if (exactDaysBetween(lastThree[0].at, lastThree[2].at) < minimumSpanDays) return false;
  return (
    lastThree[1].grams > lastThree[0].grams &&
    lastThree[2].grams > lastThree[1].grams
  );
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
  let birthWeightContext: WeightAnalysis['birthWeightContext'];

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

  /* --- niedriges Geburtsgewicht und Aufholung --------------------- */

  if (
    options.birthWeightG &&
    options.birthWeightG <= thresholds.concernBirthWeightG
  ) {
    const category =
      options.birthWeightG < VERY_LOW_BIRTH_WEIGHT_G ? 'very-low' : 'low';
    const prefix = category === 'very-low' ? 'Sehr niedriges' : 'Niedriges';
    const latestAge = pointAgeDays(latest, latest, options);
    const baseContext = {
      category,
      thresholdG: thresholds.concernBirthWeightG,
    } as const;

    if (latestAge == null || latestAge < 2) {
      level = atLeast(level, 'concern');
      birthWeightContext = { ...baseContext, phase: 'pending' };
      reasons.push(
        `${prefix} Geburtsgewicht: ${options.birthWeightG} g. Entwicklung bis Tag 2 wird beobachtet.`,
      );
    } else if (latestAge < 7) {
      const day2 = checkpointPoint(points, latest, options, 2, options.birthAt ? 0.75 : 0);
      const gainPercent = day2
        ? ((day2.grams - options.birthWeightG) / options.birthWeightG) * 100
        : undefined;
      const earlyRecovered =
        day2 != null &&
        day2.grams >= options.birthWeightG &&
        gainPercent != null &&
        gainPercent >= LOW_BIRTH_DAY2_GAIN_PERCENT;

      if (earlyRecovered) {
        level = atLeast(level, 'watch');
        birthWeightContext = {
          ...baseContext,
          phase: 'early-recovery',
          gainPercent,
        };
        reasons.push(
          `Frühes Aufholziel erreicht (${gainPercent.toFixed(1)} % bis Tag 2); Entwicklung bis Tag 7 beobachten.`,
        );
      } else {
        level = atLeast(level, 'concern');
        birthWeightContext = {
          ...baseContext,
          phase: 'pending',
          gainPercent,
        };
        reasons.push(
          gainPercent == null
            ? 'Für das Aufholziel an Tag 2 fehlt eine passende Messung.'
            : `Aufholentwicklung bis Tag 2: ${gainPercent.toFixed(1)} % statt ${LOW_BIRTH_DAY2_GAIN_PERCENT} %.`,
        );
      }
    } else {
      const day7 = checkpointPoint(points, latest, options, 7, options.birthAt ? 1 : 0);
      const gainPercent = day7
        ? ((day7.grams - options.birthWeightG) / options.birthWeightG) * 100
        : undefined;
      const recoveredByDay7 =
        day7 != null &&
        day7.grams >= options.birthWeightG &&
        gainPercent != null &&
        gainPercent >= LOW_BIRTH_DAY7_GAIN_PERCENT;
      const recoveredLater =
        !recoveredByDay7 &&
        latestAge > 7 &&
        latest.grams >= options.birthWeightG &&
        Boolean(gain && gain.value >= thresholds.goodGainG) &&
        positiveRecoveryStreak(points);

      if (recoveredByDay7) {
        birthWeightContext = {
          ...baseContext,
          phase: 'recovered',
          gainPercent,
        };
        reasons.push(
          `${prefix} Geburtsgewicht bis Tag 7 aufgeholt (${gainPercent.toFixed(1)} %).`,
        );
      } else if (recoveredLater) {
        birthWeightContext = {
          ...baseContext,
          phase: 'late-recovery',
          gainPercent,
        };
        reasons.push(`${prefix} Geburtsgewicht durch stabile spätere Entwicklung aufgeholt.`);
      } else {
        level = atLeast(level, 'concern');
        birthWeightContext = {
          ...baseContext,
          phase: 'pending',
          gainPercent,
        };
        reasons.push(
          gainPercent == null
            ? 'Aufholentwicklung nach niedrigem Geburtsgewicht noch nicht bestätigt.'
            : `Aufholentwicklung bis Tag 7: ${gainPercent.toFixed(1)} % statt ${LOW_BIRTH_DAY7_GAIN_PERCENT} %.`,
        );
      }
    }
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
    birthWeightContext,
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
