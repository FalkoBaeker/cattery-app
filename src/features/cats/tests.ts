/**
 * Gesundheitstests: Fälligkeiten und Zustand.
 *
 * HCM und PKD werden per Ultraschall halbjährlich gemacht (F47), FeLV/FIV
 * jährlich, Gentests gelten ein Leben lang. Die nächste Fälligkeit ergibt sich
 * aus Datum + Gültigkeit in Monaten und wird beim Speichern mitgeschrieben,
 * damit andere Module (Übersicht, Erinnerungen) sie ohne Nachrechnen finden.
 *
 * Monatsende zählt: 31.08. + 6 Monate = 28.02. (im Schaltjahr 29.02.).
 * Das erledigt `addMonths` aus src/lib/date.ts.
 *
 * Diese Datei ist frei von React und von Datenbankzugriffen.
 */

import type { HealthTest, HealthTestKind, ISODate } from '../../types';
import { HEALTH_TEST_LABEL } from '../../types';
import type { IconName } from '../../ui';
import { addMonths, daysBetween, formatDate, todayISO } from '../../lib/date';
import { isValidISODate } from './heat';

/** Symbol je Testart — für Listen und Zeitstrahl. */
export const HEALTH_TEST_ICON: Record<HealthTestKind, IconName> = {
  hcm: 'heart',
  pkd: 'eye',
  felv_fiv: 'syringe',
  genetic: 'chip',
  other: 'document',
};

/** Ab wie vielen Tagen vor Ablauf ein Test als „bald fällig" gilt. */
export const DUE_SOON_DAYS = 30;

export type HealthTestState =
  | 'unknown' /** kein brauchbares Datum */
  | 'unlimited' /** unbefristet gültig */
  | 'valid'
  | 'due_soon'
  | 'expired';

export const HEALTH_TEST_STATE_LABEL: Record<HealthTestState, string> = {
  unknown: 'Ohne Datum',
  unlimited: 'Unbefristet',
  valid: 'Gültig',
  due_soon: 'Bald fällig',
  expired: 'Abgelaufen',
};

export const HEALTH_TEST_STATE_TONE: Record<
  HealthTestState,
  'neutral' | 'ok' | 'warn' | 'alert'
> = {
  unknown: 'neutral',
  unlimited: 'neutral',
  valid: 'ok',
  due_soon: 'warn',
  expired: 'alert',
};

/** Für Sortierung und „schlimmster Zustand": größer = dringender. */
const SEVERITY: Record<HealthTestState, number> = {
  unlimited: 0,
  valid: 1,
  unknown: 2,
  due_soon: 3,
  expired: 4,
};

/* ------------------------------------------------------------------ */
/*  Fälligkeit                                                         */
/* ------------------------------------------------------------------ */

/**
 * Nächste Fälligkeit aus Testdatum und Gültigkeitsdauer.
 * Ohne Gültigkeit (leer, 0 oder negativ) gilt das Ergebnis unbefristet —
 * dann gibt es kein Fälligkeitsdatum.
 */
export function computeNextDueDate(
  date: ISODate | null | undefined,
  validMonths: number | null | undefined,
): ISODate | undefined {
  if (!isValidISODate(date)) return undefined;
  if (validMonths == null || !Number.isFinite(validMonths)) return undefined;
  const months = Math.round(validMonths);
  if (months <= 0) return undefined;
  return addMonths(date, months);
}

export interface HealthTestStatus {
  state: HealthTestState;
  nextDue?: ISODate;
  /** Tage bis zur Fälligkeit; negativ = überfällig. */
  daysUntilDue?: number;
  tone: 'neutral' | 'ok' | 'warn' | 'alert';
  /** Kurzer deutscher Klartext, direkt anzeigbar. */
  text: string;
}

/**
 * Bewertet einen einzelnen Test. Die Fälligkeit wird immer neu gerechnet;
 * ein gespeichertes `nextDueDate` dient nur als Rückfallebene, falls das
 * Testdatum unbrauchbar ist.
 */
export function healthTestStatus(
  test: Pick<HealthTest, 'date'> & Partial<Pick<HealthTest, 'validMonths' | 'nextDueDate'>>,
  ref: ISODate = todayISO(),
  soonDays: number = DUE_SOON_DAYS,
): HealthTestStatus {
  const hasDate = isValidISODate(test.date);
  const computed = computeNextDueDate(test.date, test.validMonths);
  const nextDue =
    computed ?? (!hasDate && isValidISODate(test.nextDueDate) ? test.nextDueDate : undefined);

  if (!hasDate && !nextDue) {
    return {
      state: 'unknown',
      tone: HEALTH_TEST_STATE_TONE.unknown,
      text: 'Ohne Datum — bitte nachtragen.',
    };
  }
  if (!nextDue) {
    return {
      state: 'unlimited',
      tone: HEALTH_TEST_STATE_TONE.unlimited,
      text: 'Unbefristet gültig.',
    };
  }

  const daysUntilDue = daysBetween(ref, nextDue);
  if (daysUntilDue < 0) {
    const overdue = Math.abs(daysUntilDue);
    return {
      state: 'expired',
      nextDue,
      daysUntilDue,
      tone: HEALTH_TEST_STATE_TONE.expired,
      text: `Seit ${overdue} ${overdue === 1 ? 'Tag' : 'Tagen'} abgelaufen.`,
    };
  }
  if (daysUntilDue <= soonDays) {
    return {
      state: 'due_soon',
      nextDue,
      daysUntilDue,
      tone: HEALTH_TEST_STATE_TONE.due_soon,
      text:
        daysUntilDue === 0
          ? 'Läuft heute ab.'
          : `Fällig in ${daysUntilDue} ${daysUntilDue === 1 ? 'Tag' : 'Tagen'}.`,
    };
  }
  return {
    state: 'valid',
    nextDue,
    daysUntilDue,
    tone: HEALTH_TEST_STATE_TONE.valid,
    text: `Gültig noch ${daysUntilDue} Tage.`,
  };
}

/**
 * Zweite Zeile einer Testzeile: wie lange das Ergebnis gilt und wann daraus
 * die nächste Untersuchung fällig wird. Ohne Gültigkeit (unbefristet) gibt es
 * nichts zu sagen — das steht schon im Zustand.
 *
 * "6 Monate gültig · nächste Fälligkeit 01.07.2026"
 */
export function healthTestValidityLine(
  test: Pick<HealthTest, 'date'> & Partial<Pick<HealthTest, 'validMonths'>>,
): string | undefined {
  const raw = test.validMonths;
  if (raw == null || !Number.isFinite(raw)) return undefined;
  const months = Math.round(raw);
  if (months <= 0) return undefined;

  const parts = [`${months} ${months === 1 ? 'Monat' : 'Monate'} gültig`];
  const due = computeNextDueDate(test.date, months);
  if (due) parts.push(`nächste Fälligkeit ${formatDate(due)}`);
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ */
/*  Bezeichnung und Gruppierung                                        */
/* ------------------------------------------------------------------ */

/** Anzeigename: bei Gentest und „weiterer Test" zählt die eigene Bezeichnung. */
export function healthTestTitle(test: Pick<HealthTest, 'kind'> & { label?: string }): string {
  const custom = test.label?.trim();
  if (custom) {
    return test.kind === 'genetic' ? `Gentest: ${custom}` : custom;
  }
  return HEALTH_TEST_LABEL[test.kind] ?? 'Test';
}

/**
 * Schlüssel, unter dem Tests derselben Sache zusammengefasst werden.
 * HCM bleibt HCM — mehrere freie Tests werden über ihre Bezeichnung getrennt,
 * damit „Blutbild" und „Schilddrüse" nicht in einen Topf fallen.
 */
export function healthTestGroupKey(test: Pick<HealthTest, 'kind'> & { label?: string }): string {
  if (test.kind === 'genetic' || test.kind === 'other') {
    return `${test.kind}:${test.label?.trim().toLowerCase() ?? ''}`;
  }
  return test.kind;
}

export interface HealthTestGroup {
  key: string;
  kind: HealthTestKind;
  title: string;
  /** Jüngster Test dieser Gruppe. */
  latest: HealthTest;
  /** Ältere Ergebnisse, absteigend nach Datum. */
  history: HealthTest[];
  status: HealthTestStatus;
}

export interface HealthTestSummary {
  groups: HealthTestGroup[];
  /** Dringendster Zustand über alle Gruppen. */
  worst: HealthTestState;
  /** Anzahl Gruppen, die abgelaufen oder bald fällig sind. */
  attentionCount: number;
  expiredCount: number;
  dueSoonCount: number;
}

/**
 * Fasst alle Tests einer Katze zusammen: je Sache das jüngste Ergebnis,
 * dazu die Historie. Sortiert nach Dringlichkeit, dann nach Bezeichnung.
 */
export function summarizeHealthTests(
  tests: readonly HealthTest[] | null | undefined,
  ref: ISODate = todayISO(),
  soonDays: number = DUE_SOON_DAYS,
): HealthTestSummary {
  const buckets = new Map<string, HealthTest[]>();
  for (const t of tests ?? []) {
    if (!t) continue;
    const key = healthTestGroupKey(t);
    const list = buckets.get(key);
    if (list) list.push(t);
    else buckets.set(key, [t]);
  }

  const groups: HealthTestGroup[] = [];
  for (const [key, list] of buckets) {
    const sorted = [...list].sort(
      (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt.localeCompare(a.createdAt),
    );
    const latest = sorted[0];
    groups.push({
      key,
      kind: latest.kind,
      title: healthTestTitle(latest),
      latest,
      history: sorted.slice(1),
      status: healthTestStatus(latest, ref, soonDays),
    });
  }

  groups.sort(
    (a, b) =>
      SEVERITY[b.status.state] - SEVERITY[a.status.state] || a.title.localeCompare(b.title, 'de'),
  );

  let worst: HealthTestState = 'unlimited';
  let expiredCount = 0;
  let dueSoonCount = 0;
  for (const g of groups) {
    if (SEVERITY[g.status.state] > SEVERITY[worst]) worst = g.status.state;
    if (g.status.state === 'expired') expiredCount += 1;
    if (g.status.state === 'due_soon') dueSoonCount += 1;
  }

  return {
    groups,
    worst,
    attentionCount: expiredCount + dueSoonCount,
    expiredCount,
    dueSoonCount,
  };
}
