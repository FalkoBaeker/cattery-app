/**
 * Fachlogik für den Bildschirm „Heute".
 *
 * Der Bildschirm zeigt ausschließlich, was jetzt dran ist. Was hier entsteht,
 * ist deshalb keine Statistik, sondern eine Liste von Dingen, die aufgeräumt
 * werden wollen. Die Funktion ist bewusst frei von React und Datenbank,
 * damit sie vollständig geprüft werden kann.
 */

import type {
  Appointment,
  BreedingUse,
  CareTask,
  Cat,
  Contract,
  CostEntry,
  DocumentRec,
  HealthTest,
  ID,
  ISODate,
  ISODateTime,
  Interest,
  Kitten,
  Litter,
  RevenueEntry,
  Settings,
  WeightEntry,
} from '../../types';
import { HEALTH_TEST_LABEL, kittenLabel } from '../../types';
import { analyzeWeights, litterAverageWeight, type WeightLevel } from '../../domain/weight';
import { isActionable } from '../../domain/schedule';
import { addDays, dateOf, daysBetween, formatDate } from '../../lib/date';

/* ------------------------------------------------------------------ */
/*  Wiege-Rhythmus                                                     */
/* ------------------------------------------------------------------ */

/**
 * Rhythmus nach Lebensalter (docs/ANFORDERUNGEN.md, F8–F11):
 *  - Woche 1–2 (Tag 0–13):  zweimal täglich
 *  - Woche 3–4 (Tag 14–27): alle zwei Tage
 *  - ab Woche 5 (Tag 28):   gar nicht mehr
 *
 * Gewogen werden darf natürlich trotzdem jederzeit — die App erinnert nur
 * nicht mehr daran.
 */
export type WeighPhase = 'daily' | 'every2days' | 'none';

export function weighPhase(ageDays: number): WeighPhase {
  if (!Number.isFinite(ageDays) || ageDays < 0) return 'none';
  if (ageDays < 14) return 'daily';
  if (ageDays < 28) return 'every2days';
  return 'none';
}

/* ------------------------------------------------------------------ */
/*  Ergebnistypen                                                      */
/* ------------------------------------------------------------------ */

export interface DashboardWeightAlert {
  kittenId: ID;
  litterId: ID;
  kittenName: string;
  litterName: string;
  level: WeightLevel;
  reasons: string[];
}

export interface DashboardWeighReminder {
  litterId: ID;
  litterName: string;
  ageDays: number;
  phase: WeighPhase;
  /** Kitten, die jetzt dran sind. */
  pending: number;
  /** Lebende Kitten des Wurfes insgesamt. */
  total: number;
  /** Kurze Begründung für die Oberfläche. */
  reason: string;
}

export interface DashboardTask {
  task: CareTask;
  /** „Wurf von Mira" bzw. „Wurf von Mira · Rot". */
  context: string;
  overdueDays: number;
}

export interface DashboardHealthTest {
  test: HealthTest;
  catName: string;
  label: string;
  dueInDays: number;
}

export interface DashboardDeadline {
  use: BreedingUse;
  dueInDays: number;
}

export interface DashboardBackup {
  due: boolean;
  neverBackedUp: boolean;
  /** Tage seit der letzten Sicherung; fehlt, wenn nie gesichert wurde. */
  daysSince?: number;
  intervalDays: number;
}

export interface DashboardModel {
  /** Falsch = die App ist noch leer, dann gilt die Einführung. */
  hasAnyData: boolean;
  weightAlerts: DashboardWeightAlert[];
  weighReminders: DashboardWeighReminder[];
  appointmentsToday: Appointment[];
  appointmentsTomorrow: Appointment[];
  careTasks: DashboardTask[];
  healthTests: DashboardHealthTest[];
  breedingDeadlines: DashboardDeadline[];
  backup: DashboardBackup;
  /** Summe aller offenen Punkte — 0 bedeutet: alles erledigt. */
  openCount: number;
}

export interface DashboardInput {
  today: ISODate;
  settings: Settings;
  cats: Cat[];
  litters: Litter[];
  kittens: Kitten[];
  weights: WeightEntry[];
  careTasks: CareTask[];
  appointments: Appointment[];
  healthTests: HealthTest[];
  breedingUses: BreedingUse[];
  interests: Interest[];
  documents: DocumentRec[];
  contracts: Contract[];
  costs: CostEntry[];
  revenues: RevenueEntry[];
  /** Zeitpunkt der letzten Sicherung; kommt aus den Einstellungen. */
  lastBackupAt?: ISODateTime;
}

/* ------------------------------------------------------------------ */
/*  Hilfen                                                             */
/* ------------------------------------------------------------------ */

/** Kitten, die keine Aufmerksamkeit mehr brauchen. */
function isGone(k: Kitten): boolean {
  return k.stillborn || k.saleStatus === 'deceased';
}

/** „Wurf von Mira" — sonst über das Geburtsdatum, sonst schlicht „Wurf". */
export function litterName(litter: Litter, catsById: Map<ID, Cat>): string {
  const mother = catsById.get(litter.motherId);
  if (mother?.callName?.trim()) return `Wurf von ${mother.callName.trim()}`;
  if (litter.birthDate) return `Wurf vom ${formatDate(litter.birthDate)}`;
  return 'Wurf';
}

/** Bündelt Einträge nach einem Schlüssel. */
function groupBy<T>(items: T[], key: (item: T) => string | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const LEVEL_RANK: Record<WeightLevel, number> = {
  critical: 0,
  concern: 1,
  watch: 2,
  ok: 3,
  unknown: 4,
};

/* ------------------------------------------------------------------ */
/*  Hauptfunktion                                                      */
/* ------------------------------------------------------------------ */

export function buildDashboard(input: DashboardInput): DashboardModel {
  const { today, settings } = input;

  const catsById = new Map(input.cats.map((c) => [c.id, c]));
  const littersById = new Map(input.litters.map((l) => [l.id, l]));
  const kittensById = new Map(input.kittens.map((k) => [k.id, k]));
  const weightsByKitten = groupBy(input.weights, (w) => w.kittenId);

  /* --- Gewichtswarnungen ------------------------------------------ */

  const weightAlerts: DashboardWeightAlert[] = [];

  for (const litter of input.litters) {
    if (!litter.birthDate) continue;
    const ageDays = daysBetween(litter.birthDate, today);
    // Nach zwölf Wochen ist die Gewichtsphase vorbei; alte Würfe verstopfen
    // sonst dauerhaft den Bildschirm.
    if (ageDays < 0 || ageDays > 84) continue;

    const litterKittens = input.kittens.filter((k) => k.litterId === litter.id && !isGone(k));
    if (litterKittens.length === 0) continue;

    const entriesByKitten = new Map<string, WeightEntry[]>(
      litterKittens.map((k) => [k.id, weightsByKitten.get(k.id) ?? []]),
    );

    for (const k of litterKittens) {
      const entries = entriesByKitten.get(k.id) ?? [];
      if (entries.length === 0) continue;
      const average = litterAverageWeight(entriesByKitten, k.id);
      const latestAt = entries.reduce(
        (acc, e) => (e.at > acc ? e.at : acc),
        entries[0].at,
      );
      const analysis = analyzeWeights(entries, settings.weight, {
        birthWeightG: k.birthWeightG,
        litterAverageG: average,
        ageDays: daysBetween(litter.birthDate, dateOf(latestAt)),
      });
      if (analysis.level !== 'critical' && analysis.level !== 'concern') continue;
      weightAlerts.push({
        kittenId: k.id,
        litterId: litter.id,
        kittenName: kittenLabel(k),
        litterName: litterName(litter, catsById),
        level: analysis.level,
        reasons: analysis.reasons,
      });
    }
  }

  weightAlerts.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.kittenName.localeCompare(b.kittenName, 'de'),
  );

  /* --- Heute noch nicht gewogen ------------------------------------ */

  const weighReminders: DashboardWeighReminder[] = [];

  for (const litter of input.litters) {
    if (!litter.birthDate) continue;
    const ageDays = daysBetween(litter.birthDate, today);
    const phase = weighPhase(ageDays);
    if (phase === 'none') continue;

    const litterKittens = input.kittens.filter((k) => k.litterId === litter.id && !isGone(k));
    if (litterKittens.length === 0) continue;

    let pending = 0;
    for (const k of litterKittens) {
      const entries = weightsByKitten.get(k.id) ?? [];
      if (phase === 'daily') {
        // In Woche 1–2 sind zwei echte Messungen pro Kalendertag vorgesehen.
        // Eine einzelne Morgenmessung darf die Erinnerung für den zweiten
        // Tageswert nicht bereits als erledigt markieren.
        const measurementsToday = entries.filter((entry) => dateOf(entry.at) === today).length;
        if (measurementsToday < 2) pending += 1;
        continue;
      }

      const lastAt = entries.reduce<string | undefined>(
        (acc, e) => (acc === undefined || e.at > acc ? e.at : acc),
        undefined,
      );
      if (!lastAt) {
        pending += 1;
        continue;
      }
      const daysSince = daysBetween(dateOf(lastAt), today);
      if (daysSince >= 2) pending += 1;
    }

    if (pending === 0) continue;

    weighReminders.push({
      litterId: litter.id,
      litterName: litterName(litter, catsById),
      ageDays,
      phase,
      pending,
      total: litterKittens.length,
      reason:
        phase === 'daily'
          ? 'In den ersten zwei Wochen zweimal täglich wiegen.'
          : 'In Woche 3 und 4 alle zwei Tage wiegen.',
    });
  }

  weighReminders.sort((a, b) => a.ageDays - b.ageDays);

  /* --- Termine heute und morgen ------------------------------------ */

  const tomorrow = addDays(today, 1);
  const activeAppointments = input.appointments
    .filter((a) => !a.cancelledAt)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const appointmentsToday = activeAppointments.filter((a) => dateOf(a.startAt) === today);
  const appointmentsTomorrow = activeAppointments.filter((a) => dateOf(a.startAt) === tomorrow);

  /* --- Fahrplan ---------------------------------------------------- */

  const careTasks: DashboardTask[] = input.careTasks
    .filter((t) => !t.doneAt && !t.skipped && isActionable(t, settings.schedule, today))
    .map((t) => ({
      task: t,
      context: taskContext(t, littersById, kittensById, catsById),
      overdueDays: Math.max(0, -daysBetween(today, t.dueDate)),
    }))
    .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate) || a.context.localeCompare(b.context, 'de'));

  /* --- Ablaufende Gesundheitstests --------------------------------- */

  const healthTests: DashboardHealthTest[] = input.healthTests
    .filter((t) => Boolean(t.nextDueDate))
    .map((t) => ({
      test: t,
      catName: catsById.get(t.catId)?.callName ?? 'Unbekanntes Tier',
      label: t.label?.trim() || HEALTH_TEST_LABEL[t.kind],
      dueInDays: daysBetween(today, t.nextDueDate as ISODate),
    }))
    // Nur Tiere, die noch in der Zucht stehen — bei abgegebenen oder
    // verstorbenen Tieren ist ein abgelaufener Test bedeutungslos.
    .filter((h) => {
      const cat = catsById.get(h.test.catId);
      return cat ? cat.status === 'active' || cat.status === 'paused' : false;
    })
    .filter((h) => h.dueInDays <= 30)
    .sort((a, b) => a.dueInDays - b.dueInDays);

  /* --- Fristen aus Zuchtnutzungs-Vorgängen -------------------------- */

  const OPEN_STAGES = new Set([
    'at_buyer',
    'requested',
    'with_us',
    'mated',
    'pregnant',
    'littered',
    'neutered',
  ]);

  const breedingDeadlines: DashboardDeadline[] = input.breedingUses
    .filter((u) => OPEN_STAGES.has(u.stage))
    .map((u) => ({ use: u, dueInDays: daysBetween(today, u.deadlineDate) }))
    // Erinnerungen bei 6, 3 und 1 Monat vor Ablauf — wir zeigen ab einem
    // halben Jahr vorher durchgehend, damit nichts zwischen zwei Blicken
    // hindurchrutscht.
    .filter((d) => d.dueInDays <= 183)
    .sort((a, b) => a.dueInDays - b.dueInDays);

  /* --- Sicherung ---------------------------------------------------- */

  const hasAnyData =
    input.cats.length > 0 ||
    input.litters.length > 0 ||
    input.kittens.length > 0 ||
    input.weights.length > 0 ||
    input.careTasks.length > 0 ||
    input.healthTests.length > 0 ||
    input.breedingUses.length > 0 ||
    input.interests.length > 0 ||
    input.appointments.length > 0 ||
    input.documents.length > 0 ||
    input.contracts.length > 0 ||
    input.costs.length > 0 ||
    input.revenues.length > 0;

  const backup = backupStatus(input.lastBackupAt, settings.backupIntervalDays, today, hasAnyData);

  const openCount =
    weightAlerts.length +
    weighReminders.length +
    appointmentsToday.length +
    appointmentsTomorrow.length +
    careTasks.length +
    healthTests.length +
    breedingDeadlines.length +
    (backup.due ? 1 : 0);

  return {
    hasAnyData,
    weightAlerts,
    weighReminders,
    appointmentsToday,
    appointmentsTomorrow,
    careTasks,
    healthTests,
    breedingDeadlines,
    backup,
    openCount,
  };
}

/* ------------------------------------------------------------------ */
/*  Einzelteile                                                        */
/* ------------------------------------------------------------------ */

function taskContext(
  task: CareTask,
  litters: Map<ID, Litter>,
  kittens: Map<ID, Kitten>,
  cats: Map<ID, Cat>,
): string {
  const parts: string[] = [];
  const litter = task.litterId ? litters.get(task.litterId) : undefined;
  if (litter) parts.push(litterName(litter, cats));
  const kitten = task.kittenId ? kittens.get(task.kittenId) : undefined;
  if (kitten) parts.push(kittenLabel(kitten));
  const cat = task.catId ? cats.get(task.catId) : undefined;
  if (cat) parts.push(cat.callName);
  return parts.join(' · ');
}

/**
 * Ist eine Sicherung fällig? Ohne Daten wird nicht erinnert — es gäbe
 * nichts zu sichern.
 */
export function backupStatus(
  lastBackupAt: ISODateTime | undefined,
  intervalDays: number,
  today: ISODate,
  hasAnyData: boolean,
): DashboardBackup {
  const interval = Number.isFinite(intervalDays) && intervalDays > 0 ? intervalDays : 14;

  if (!lastBackupAt) {
    return { due: hasAnyData, neverBackedUp: true, intervalDays: interval };
  }

  const daysSince = Math.max(0, daysBetween(dateOf(lastBackupAt), today));
  return {
    due: hasAnyData && daysSince >= interval,
    neverBackedUp: false,
    daysSince,
    intervalDays: interval,
  };
}
