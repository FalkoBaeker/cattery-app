/**
 * Reine Fachlogik für Würfe und Kitten.
 *
 * Ohne React, ohne Datenbank — alles hier ist mit Vitest prüfbar.
 * Datumsrechnung ausschließlich über src/lib/date.ts, damit Sommerzeit
 * und Monatsenden nicht in die Hose gehen.
 */

import type {
  BirthEvent,
  CareTask,
  CollarColorKey,
  ID,
  ISODate,
  ISODateTime,
  Kitten,
  KittenSaleStatus,
  Litter,
  SexOrUnknown,
  WeightEntry,
  WeightThresholds,
} from '../../types';
import { COLLAR_COLORS } from '../../types';
import { addDays, ageInWeeks, dateOf, daysBetween, todayISO } from '../../lib/date';
import { plural } from '../../lib/format';
import { analyzeWeights, litterAverageWeight, type WeightAnalysis } from '../../domain/weight';

/* ------------------------------------------------------------------ */
/*  Geburtstermin und Trächtigkeit                                     */
/* ------------------------------------------------------------------ */

/**
 * Errechneter Geburtstermin: Deckdatum + Trächtigkeitsdauer
 * (Vorgabe 65 Tage, einstellbar).
 */
export function dueDateFromMating(
  matingDate?: ISODate | null,
  gestationDays = 65,
): ISODate | undefined {
  if (!matingDate) return undefined;
  if (!Number.isFinite(gestationDays)) return undefined;
  return addDays(matingDate, Math.round(gestationDays));
}

/**
 * Der Termin, der wirklich gilt: der von Hand eingetragene, sonst der aus dem
 * Deckdatum errechnete.
 *
 * Wichtig fürs Sortieren und für alle Anzeigen: Ein Wurf mit Deckdatum, aber
 * ohne gespeicherten Termin hat trotzdem einen Termin — er wird nur nicht in
 * der Datenbank festgehalten, damit eine geänderte Trächtigkeitsdauer überall
 * durchschlägt.
 */
export function effectiveDueDate(
  litter: Pick<Litter, 'dueDate' | 'matingDate'>,
  gestationDays = 65,
): ISODate | undefined {
  return litter.dueDate ?? dueDateFromMating(litter.matingDate, gestationDays);
}

/**
 * Text für den Countdown auf ein Datum.
 * „noch 24 Tage" · „Termin heute" · „2 Tage überfällig"
 */
export function countdownLabel(target?: ISODate | null, ref: ISODate = todayISO()): string {
  if (!target) return '—';
  const diff = daysBetween(ref, target);
  if (diff === 0) return 'Termin heute';
  if (diff > 0) return `noch ${diff} ${plural(diff, 'Tag', 'Tage')}`;
  const late = Math.abs(diff);
  return `${late} ${plural(late, 'Tag', 'Tage')} überfällig`;
}

export interface PregnancyInfo {
  dueDate: ISODate;
  /** Trächtigkeitsdauer in Tagen laut Einstellungen. */
  totalDays: number;
  /** Vergangene Tage seit dem Deckdatum (0 am Decktag selbst). */
  elapsedDays: number;
  /** Tage bis zum Termin; negativ = überfällig. */
  daysUntilDue: number;
  /** Fortschritt 0…1, begrenzt. */
  progress: number;
  /** „Tag 41 von 65" */
  label: string;
  countdown: string;
}

/** Fortschritt einer Trächtigkeit. Ohne Deckdatum gibt es nichts zu rechnen. */
export function pregnancyInfo(
  matingDate?: ISODate | null,
  gestationDays = 65,
  ref: ISODate = todayISO(),
): PregnancyInfo | undefined {
  const dueDate = dueDateFromMating(matingDate, gestationDays);
  if (!matingDate || !dueDate) return undefined;

  const totalDays = Math.max(1, Math.round(gestationDays));
  const elapsedDays = daysBetween(matingDate, ref);
  const daysUntilDue = daysBetween(ref, dueDate);
  const progress = Math.min(1, Math.max(0, elapsedDays / totalDays));

  return {
    dueDate,
    totalDays,
    elapsedDays,
    daysUntilDue,
    progress,
    label:
      elapsedDays < 0
        ? 'Deckdatum liegt in der Zukunft'
        : `Tag ${elapsedDays + 1} von ${totalDays}`,
    countdown: countdownLabel(dueDate, ref),
  };
}

/* ------------------------------------------------------------------ */
/*  Zusammenfassung eines Wurfes                                       */
/* ------------------------------------------------------------------ */

export type KittenLike = Pick<Kitten, 'id' | 'stillborn' | 'saleStatus' | 'sex'>;

export interface LitterSummary {
  /** Alle erfassten Kitten, auch totgeborene. */
  total: number;
  /** Lebende Kitten. */
  alive: number;
  stillborn: number;
  /** Nach der Geburt verstorben. */
  deceased: number;
  males: number;
  females: number;
  unknownSex: number;
  available: number;
  reserved: number;
  /** Verkauft, einschließlich Zuchtvorbehalt. */
  sold: number;
  kept: number;
  /** Lebende Kitten, die heute mindestens einmal gewogen wurden. */
  weighedToday: number;
  /** Lebende Kitten insgesamt — die Bezugsgröße fürs Wiegen. */
  toWeigh: number;
  allWeighedToday: boolean;
  /** Noch kein Kitten erfasst. */
  isEmpty: boolean;
}

/** Ein Kitten gilt als lebend, solange es weder totgeboren noch verstorben ist. */
export function isLivingKitten(k: Pick<Kitten, 'stillborn' | 'saleStatus'>): boolean {
  return !k.stillborn && k.saleStatus !== 'deceased';
}

/**
 * Zählt einen Wurf durch. `weights` darf alle Wiegungen enthalten —
 * gefiltert wird auf den Bezugstag.
 */
export function summarizeLitter(
  kittens: KittenLike[],
  weights: Pick<WeightEntry, 'kittenId' | 'at'>[] = [],
  ref: ISODate = todayISO(),
): LitterSummary {
  const alive = kittens.filter(isLivingKitten);
  const aliveIds = new Set(alive.map((k) => k.id));

  const weighedIds = new Set<ID>();
  for (const w of weights) {
    if (!aliveIds.has(w.kittenId)) continue;
    if (!w.at) continue;
    if (dateOf(w.at) === ref) weighedIds.add(w.kittenId);
  }

  const countStatus = (s: KittenSaleStatus) =>
    alive.filter((k) => k.saleStatus === s).length;
  const countSex = (s: SexOrUnknown) => alive.filter((k) => k.sex === s).length;

  return {
    total: kittens.length,
    alive: alive.length,
    stillborn: kittens.filter((k) => k.stillborn).length,
    deceased: kittens.filter((k) => !k.stillborn && k.saleStatus === 'deceased').length,
    males: countSex('male'),
    females: countSex('female'),
    unknownSex: countSex('unknown'),
    available: countStatus('available'),
    reserved: countStatus('reserved'),
    sold: countStatus('sold') + countStatus('sold_breeding_reserved'),
    kept: countStatus('kept'),
    weighedToday: weighedIds.size,
    toWeigh: alive.length,
    allWeighedToday: alive.length > 0 && weighedIds.size === alive.length,
    isEmpty: kittens.length === 0,
  };
}

/** „5 Kitten · 3 Katzen, 2 Kater" — kurze Zeile für die Wurfkarte. */
export function summaryLine(s: LitterSummary): string {
  if (s.isEmpty) return 'Noch keine Kitten erfasst';
  // „Kitten" hat keine eigene Mehrzahlform — deshalb hier kein plural().
  const parts: string[] = [`${s.alive} Kitten`];
  const sexes: string[] = [];
  if (s.females > 0) sexes.push(`${s.females} ${plural(s.females, 'Katze', 'Katzen')}`);
  if (s.males > 0) sexes.push(`${s.males} Kater`); // Ein- und Mehrzahl gleich
  if (s.unknownSex > 0) sexes.push(`${s.unknownSex} ohne Angabe`);
  if (sexes.length > 0) parts.push(sexes.join(', '));
  if (s.stillborn > 0)
    parts.push(`${s.stillborn} ${plural(s.stillborn, 'Totgeburt', 'Totgeburten')}`);
  if (s.deceased > 0) parts.push(`${s.deceased} verstorben`);
  return parts.join(' · ');
}

/** „4 von 5 heute gewogen" — oder ein passender Kurztext. */
export function weighingLine(s: LitterSummary): string {
  if (s.toWeigh === 0) return 'Nichts zu wiegen';
  if (s.weighedToday === 0) return `Heute noch nicht gewogen (${s.toWeigh})`;
  if (s.allWeighedToday) return 'Heute alle gewogen';
  return `${s.weighedToday} von ${s.toWeigh} heute gewogen`;
}

/** Ab dieser Lebenswoche wird nicht mehr routinemäßig gewogen (F10/F11). */
export const WEIGHING_END_WEEK = 5;

/** Wird in diesem Wurf noch routinemäßig gewogen? Ohne Geburtsdatum: nein. */
export function isWeighingPhase(birthDate?: ISODate | null, ref: ISODate = todayISO()): boolean {
  if (!birthDate) return false;
  return ageInWeeks(birthDate, ref) < WEIGHING_END_WEEK;
}

export interface WeighingStatus {
  text: string;
  tone: 'ok' | 'warn' | 'neutral';
}

/**
 * Der Wiege-Stand für Wurfkarte und Wurf-Kopf.
 *
 * Ab Woche 5 verschwindet er nicht ersatzlos — dann steht dort, *warum* nicht
 * mehr gewogen wird. Ein wortloses Verschwinden liest sich sonst wie ein
 * Fehler. Ohne Kitten und ohne Geburtsdatum gibt es nichts zu sagen.
 */
export function weighingStatus(
  s: LitterSummary,
  birthDate?: ISODate | null,
  ref: ISODate = todayISO(),
): WeighingStatus | undefined {
  if (s.isEmpty || !birthDate) return undefined;
  if (!isWeighingPhase(birthDate, ref)) {
    return { text: `Ab Woche ${WEIGHING_END_WEEK} kein Routinewiegen mehr`, tone: 'neutral' };
  }
  return {
    text: weighingLine(s),
    tone: s.toWeigh === 0 ? 'neutral' : s.allWeighedToday ? 'ok' : 'warn',
  };
}

/* ------------------------------------------------------------------ */
/*  Wehen                                                              */
/* ------------------------------------------------------------------ */

export interface ContractionEntry {
  at: ISODateTime;
  /** Abstand zur vorherigen Wehe in Sekunden; fehlt bei der ersten. */
  secondsSincePrevious?: number;
}

type EventLike = Pick<BirthEvent, 'kind' | 'at'>;

function timeValue(at: ISODateTime): number {
  const t = new Date(at).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Wehen-Abstände aus dem Geburtsprotokoll.
 * Unsortierte Eingabe wird sortiert, ungültige Zeitstempel fallen raus,
 * gleiche Zeitstempel ergeben einen Abstand von 0.
 */
export function contractionIntervals(events: EventLike[]): ContractionEntry[] {
  const sorted = events
    .filter((e) => e.kind === 'contraction' && !Number.isNaN(timeValue(e.at)))
    .map((e) => ({ at: e.at, t: timeValue(e.at) }))
    .sort((a, b) => a.t - b.t);

  return sorted.map((e, i) => ({
    at: e.at,
    secondsSincePrevious: i === 0 ? undefined : Math.round((e.t - sorted[i - 1].t) / 1000),
  }));
}

export type ContractionTrend = 'shorter' | 'longer' | 'steady' | 'unknown';

export interface ContractionStats {
  count: number;
  lastAt?: ISODateTime;
  /** Alle Abstände in Sekunden, ältester zuerst. */
  intervalsSeconds: number[];
  /** Die jüngsten Abstände, jüngster zuerst — für die Anzeige. */
  recentSeconds: number[];
  /** Mittel der jüngsten Abstände. */
  averageSeconds?: number;
  trend: ContractionTrend;
}

/** Verdichtet die Wehen für die Anzeige im Geburtsprotokoll. */
export function contractionStats(events: EventLike[], recent = 5): ContractionStats {
  const entries = contractionIntervals(events);
  const intervals = entries
    .map((e) => e.secondsSincePrevious)
    .filter((v): v is number => v != null);

  const recentSeconds = intervals.slice(-Math.max(1, recent)).reverse();
  const averageSeconds =
    recentSeconds.length > 0
      ? Math.round(recentSeconds.reduce((a, b) => a + b, 0) / recentSeconds.length)
      : undefined;

  let trend: ContractionTrend = 'unknown';
  if (intervals.length >= 2) {
    const last = intervals[intervals.length - 1];
    const before = intervals.slice(0, -1).slice(-3);
    const avgBefore = before.reduce((a, b) => a + b, 0) / before.length;
    if (avgBefore > 0 && last < avgBefore * 0.8) trend = 'shorter';
    else if (avgBefore > 0 && last > avgBefore * 1.25) trend = 'longer';
    else trend = 'steady';
  }

  return {
    count: entries.length,
    lastAt: entries.length > 0 ? entries[entries.length - 1].at : undefined,
    intervalsSeconds: intervals,
    recentSeconds,
    averageSeconds,
    trend,
  };
}

export const CONTRACTION_TREND_LABEL: Record<ContractionTrend, string> = {
  shorter: 'Abstände werden kürzer',
  longer: 'Abstände werden länger',
  steady: 'Abstände bleiben gleich',
  unknown: 'Noch zu wenige Wehen',
};

/** „45 Sek." · „3:05 Min." · „1 Std. 12 Min." */
export function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} Sek.`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rest = s % 60;
    return `${m}:${String(rest).padStart(2, '0')} Min.`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} Std. ${String(m).padStart(2, '0')} Min.`;
}

/* ------------------------------------------------------------------ */
/*  Fahrplan-Hilfen                                                    */
/* ------------------------------------------------------------------ */

export interface TaskWeekGroup {
  /** Lebenswoche, in der der Punkt fällig ist; null ohne Geburtsdatum. */
  week: number | null;
  label: string;
  tasks: CareTask[];
}

/** Gruppiert Fahrplan-Punkte nach Lebenswoche des Wurfes. */
export function groupTasksByWeek(tasks: CareTask[], birthDate?: ISODate): TaskWeekGroup[] {
  const groups = new Map<number | null, CareTask[]>();

  for (const t of tasks) {
    const week = birthDate ? Math.floor(daysBetween(birthDate, t.dueDate) / 7) : null;
    const key = week != null && week < 0 ? -1 : week;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  return [...groups.entries()]
    .map(([week, list]) => ({
      week,
      label: week == null ? 'Ohne Geburtsdatum' : week < 0 ? 'Vor der Geburt' : `Woche ${week}`,
      tasks: list.sort(
        (a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title),
      ),
    }))
    .sort((a, b) => (a.week ?? 999) - (b.week ?? 999));
}

/** Der nächste offene Punkt: überfällige zuerst, sonst der zeitlich nächste. */
export function nextOpenTask(tasks: CareTask[]): CareTask | undefined {
  return tasks
    .filter((t) => !t.doneAt && !t.skipped)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title))[0];
}

/* ------------------------------------------------------------------ */
/*  Gewichtsbewertung eines ganzen Wurfes                              */
/* ------------------------------------------------------------------ */

export type WeighedKitten = Pick<Kitten, 'id' | 'stillborn' | 'saleStatus' | 'birthWeightG'>;

/**
 * Bewertet alle lebenden Kitten eines Wurfes auf einmal. Der Wurfdurchschnitt
 * wird dabei je Kitten ohne das Kitten selbst gerechnet, damit ein einzelnes
 * Sorgenkind den Vergleichswert nicht nach unten zieht.
 */
export function analyzeLitterWeights(
  kittens: WeighedKitten[],
  weights: Pick<WeightEntry, 'kittenId' | 'at' | 'grams'>[],
  thresholds: WeightThresholds,
  birthDate?: ISODate,
  ref: ISODate = todayISO(),
): Map<ID, WeightAnalysis> {
  const byKitten = new Map<ID, Pick<WeightEntry, 'at' | 'grams'>[]>();
  const living = kittens.filter(isLivingKitten);
  for (const k of living) byKitten.set(k.id, []);
  for (const w of weights) {
    const list = byKitten.get(w.kittenId);
    if (list) list.push({ at: w.at, grams: w.grams });
  }

  const ageDays = birthDate ? Math.max(0, daysBetween(birthDate, ref)) : undefined;
  const result = new Map<ID, WeightAnalysis>();

  for (const k of living) {
    const entries = byKitten.get(k.id) ?? [];
    result.set(
      k.id,
      analyzeWeights(entries, thresholds, {
        birthWeightG: k.birthWeightG,
        litterAverageG: litterAverageWeight(byKitten, k.id),
        ageDays,
      }),
    );
  }
  return result;
}

/** Anzahl Kitten mit auffälliger oder kritischer Einstufung. */
export function countWeightWarnings(analyses: Map<ID, WeightAnalysis>): number {
  let n = 0;
  for (const a of analyses.values()) {
    if (a.level === 'concern' || a.level === 'critical') n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/*  Halsbandfarben                                                     */
/* ------------------------------------------------------------------ */

/** Nächste freie Halsbandfarbe. Sind alle vergeben, bleibt „ohne". */
export function suggestCollarColor(used: CollarColorKey[]): CollarColorKey {
  const taken = new Set(used);
  const free = COLLAR_COLORS.find((c) => c.key !== 'none' && !taken.has(c.key));
  return free ? free.key : 'none';
}
