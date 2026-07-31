/**
 * Reine Fachlogik des Termin-Moduls — ohne React, ohne Datenbank.
 *
 * Zwei Aufgaben:
 *  1. **Erinnerungen**: welche Erinnerung ist zu einem Zeitpunkt fällig?
 *     Gerechnet wird ausschließlich in echten Millisekunden. „24 Stunden
 *     vorher" heißt 24 echte Stunden — auch über den Sommerzeitwechsel
 *     hinweg, wo die Wanduhr dann eine Stunde abweicht. Das ist gewollt.
 *  2. **Kalender**: die Einträge aus fünf Quellen zusammenführen und
 *     sortieren. Der Kalender selbst schreibt nichts in diese Quellen.
 */

import type {
  Appointment,
  AppointmentKind,
  BreedingUse,
  CareTask,
  CareTaskKind,
  HealthTest,
  ID,
  ISODate,
  ISODateTime,
  Litter,
} from '../../types';
import {
  APPOINTMENT_KIND_LABEL,
  HEALTH_TEST_LABEL,
  VISITOR_APPOINTMENT_KINDS,
} from '../../types';
import type { BadgeTone, IconName } from '../../ui';
import { addMonths, dateOf, daysBetween, formatDateTime, formatTime } from '../../lib/date';

/* ================================================================== */
/*  Erinnerungen                                                       */
/* ================================================================== */

export type ReminderKind = '24h' | '1h';

/** Vorlauf in echten Millisekunden. */
export const REMINDER_LEAD_MS: Record<ReminderKind, number> = {
  '24h': 24 * 3_600_000,
  '1h': 3_600_000,
};

/** Dringendste zuerst — bei gleichzeitiger Fälligkeit gewinnt die nähere. */
const REMINDER_ORDER: ReminderKind[] = ['1h', '24h'];

/** Stabiler Schlüssel für den Merker in `notificationLog`. */
export function reminderKey(appointmentId: ID, kind: ReminderKind): string {
  return `appt:${appointmentId}:${kind}`;
}

/** Nur die Felder, die für die Erinnerung gebraucht werden. */
export type ReminderInput = Pick<
  Appointment,
  'id' | 'kind' | 'startAt' | 'remind24h' | 'remind1h' | 'cancelledAt'
> &
  Partial<Pick<Appointment, 'title' | 'location'>>;

export interface DueReminder {
  key: string;
  appointmentId: ID;
  kind: ReminderKind;
  startAt: ISODateTime;
  /** Millisekunden bis zum Terminbeginn im Moment der Prüfung. */
  msUntilStart: number;
  /** Überschrift der Mitteilung. */
  title: string;
  /** Fließtext der Mitteilung. */
  body: string;
  /**
   * Alle Schlüssel, die als erledigt gelten, **sobald genau diese Mitteilung
   * gezeigt wurde** — der eigene und die übersprungenen desselben Termins.
   * Nur so bleibt eine fehlgeschlagene Zustellung für andere Termine folgenlos.
   */
  markKeys: string[];
}

export interface ReminderCheck {
  /** Was jetzt als Mitteilung gezeigt werden soll — höchstens eine je Termin. */
  notify: DueReminder[];
  /**
   * Alle Schlüssel, die als „erledigt" zu vermerken sind. Enthält auch
   * übersprungene Erinnerungen: Wird die App erst eine Stunde vor dem Termin
   * geöffnet, soll die 24-Stunden-Erinnerung nicht nachträglich noch kommen.
   */
  markFired: string[];
}

/** Anzeigename eines Termins: eigener Titel, sonst die Art. */
export function appointmentTitle(a: Pick<Appointment, 'kind' | 'title'>): string {
  return a.title?.trim() || APPOINTMENT_KIND_LABEL[a.kind];
}

/** Termine, bei denen ein Interessent zu Besuch kommt. */
export function isVisitorKind(kind: AppointmentKind): boolean {
  return VISITOR_APPOINTMENT_KINDS.includes(kind);
}

/** „in 3 Stunden", „in 20 Minuten", „gleich" — für Mitteilungen und Karten. */
export function leadText(msUntilStart: number): string {
  if (msUntilStart <= 0) return 'jetzt';
  const minutes = Math.floor(msUntilStart / 60_000);
  if (minutes < 2) return 'gleich';
  if (minutes < 60) return `in ${minutes} Minuten`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'in 1 Stunde' : `in ${hours} Stunden`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'in 1 Tag' : `in ${days} Tagen`;
}

function buildReminder(
  a: ReminderInput,
  kind: ReminderKind,
  msUntilStart: number,
): DueReminder {
  const name = appointmentTitle(a);
  // Der Vorlauf steht schon in der Überschrift — im Fließtext würde er sich
  // nur wiederholen („Termin in 30 Minuten: … / in 30 Minuten · …").
  const parts = [formatDateTime(a.startAt)];
  if (a.location?.trim()) parts.push(a.location.trim());
  return {
    key: reminderKey(a.id, kind),
    appointmentId: a.id,
    kind,
    startAt: a.startAt,
    msUntilStart,
    title: `Termin ${leadText(msUntilStart)}: ${name}`,
    body: parts.join(' · '),
    markKeys: [reminderKey(a.id, kind)],
  };
}

/**
 * Ermittelt, welche Erinnerungen zum Zeitpunkt `now` fällig sind.
 *
 * Eine Erinnerung ist fällig, wenn
 *  - der Termin nicht abgesagt ist,
 *  - der Termin noch bevorsteht (`startAt > now`),
 *  - der zugehörige Schalter an ist,
 *  - das Fenster offen ist (`now >= startAt − Vorlauf`),
 *  - und sie noch nicht ausgelöst wurde.
 *
 * Sind für einen Termin beide Erinnerungen fällig, wird nur die dringendere
 * gezeigt; beide werden vermerkt.
 */
export function dueReminders(
  appointments: ReminderInput[],
  now: ISODateTime,
  firedKeys: Iterable<string> = [],
): ReminderCheck {
  const fired = firedKeys instanceof Set ? firedKeys : new Set(firedKeys);
  const nowMs = new Date(now).getTime();
  const result: ReminderCheck = { notify: [], markFired: [] };
  if (!Number.isFinite(nowMs)) return result;

  for (const a of appointments) {
    if (a.cancelledAt) continue;
    const startMs = new Date(a.startAt).getTime();
    if (!Number.isFinite(startMs)) continue;
    // Laufende und vergangene Termine bekommen keine Erinnerung mehr.
    if (startMs <= nowMs) continue;

    const msUntilStart = startMs - nowMs;
    const due: DueReminder[] = [];

    for (const kind of REMINDER_ORDER) {
      const enabled = kind === '24h' ? a.remind24h : a.remind1h;
      if (!enabled) continue;
      const key = reminderKey(a.id, kind);
      if (fired.has(key)) continue;
      if (msUntilStart > REMINDER_LEAD_MS[kind]) continue; // Fenster noch zu
      due.push(buildReminder(a, kind, msUntilStart));
    }

    if (due.length === 0) continue;
    // Gezeigt wird nur die dringendste; erledigt sind danach alle offenen
    // Erinnerungen dieses Termins — aber eben nur, wenn sie auch ankam.
    due[0].markKeys = due.map((d) => d.key);
    result.notify.push(due[0]);
    for (const d of due) result.markFired.push(d.key);
  }

  result.notify.sort((x, y) => x.startAt.localeCompare(y.startAt) || x.key.localeCompare(y.key));
  return result;
}

/**
 * Erinnerungs-Schlüssel, deren Fenster zum Zeitpunkt `now` bereits offen ist.
 *
 * Gedacht für den Moment des Anlegens oder Verschiebens: Wer einen Termin
 * anlegt, der schon in drei Stunden beginnt, weiß von ihm — eine Mitteilung
 * „Termin in 3 Stunden" eine Minute später wäre albern. Diese Schlüssel
 * werden deshalb sofort als erledigt vermerkt; nur Fenster, die sich erst
 * später öffnen (hier: die 1-Stunden-Erinnerung), melden sich noch.
 *
 * Die Schalter (`remind24h`/`remind1h`) spielen absichtlich keine Rolle:
 * Auch wer einen Schalter erst nachträglich einschaltet, soll für ein längst
 * offenes Fenster keine Sofort-Mitteilung mehr bekommen.
 */
export function openReminderKeys(
  a: Pick<ReminderInput, 'id' | 'startAt'>,
  now: ISODateTime,
): string[] {
  const nowMs = new Date(now).getTime();
  const startMs = new Date(a.startAt).getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(startMs)) return [];
  // Vergangene Termine erinnern ohnehin nicht mehr — nichts zu vermerken.
  if (startMs <= nowMs) return [];
  const msUntilStart = startMs - nowMs;
  return REMINDER_ORDER.filter((kind) => msUntilStart <= REMINDER_LEAD_MS[kind]).map((kind) =>
    reminderKey(a.id, kind),
  );
}

/**
 * Größter Vorlauf unter den **eingeschalteten** Erinnerungen.
 * 0, wenn die Nutzerin beide Schalter bewusst ausgemacht hat.
 */
export function enabledLeadMs(a: Pick<ReminderInput, 'remind24h' | 'remind1h'>): number {
  let lead = 0;
  if (a.remind24h) lead = Math.max(lead, REMINDER_LEAD_MS['24h']);
  if (a.remind1h) lead = Math.max(lead, REMINDER_LEAD_MS['1h']);
  return lead;
}

/**
 * Termine, die in Kürze anstehen — für die Karte im Kalender.
 *
 * Sie hängt bewusst **nicht** am Mitteilungs-Protokoll: die Karte erscheint
 * auch dann, wenn die Mitteilung nie zugestellt wurde. Sie fängt die fehlende
 * Zustellung auf — sie weckt aber keine Erinnerung wieder auf, die
 * ausgeschaltet wurde. Wer beide Schalter aus hat, will keine Vorwarnung.
 */
export function upcomingWithin<T extends ReminderInput>(
  appointments: T[],
  now: ISODateTime,
  withinMs: number = REMINDER_LEAD_MS['24h'],
): { appointment: T; msUntilStart: number }[] {
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return [];
  const result: { appointment: T; msUntilStart: number }[] = [];
  for (const a of appointments) {
    if (a.cancelledAt) continue;
    const lead = Math.min(withinMs, enabledLeadMs(a));
    if (lead <= 0) continue;
    const msUntilStart = new Date(a.startAt).getTime() - nowMs;
    if (!Number.isFinite(msUntilStart)) continue;
    if (msUntilStart <= 0 || msUntilStart > lead) continue;
    result.push({ appointment: a, msUntilStart });
  }
  return result.sort((x, y) => x.msUntilStart - y.msUntilStart);
}

/* ================================================================== */
/*  Bezüge je Terminart                                                */
/* ================================================================== */

/** Bei welchen Terminarten ist ein Interessent sinnvoll? */
export function allowsInterest(kind: AppointmentKind): boolean {
  return isVisitorKind(kind) || kind === 'other';
}

/** Bei welchen Terminarten sind Katze und Wurf sinnvoll? */
export function allowsAnimal(kind: AppointmentKind): boolean {
  return kind === 'vet' || kind === 'mating' || kind === 'other';
}

export interface AppointmentLinks {
  interestId: string;
  catId: string;
  litterId: string;
}

/**
 * Bezüge auf das beschränken, was zur Terminart passt.
 *
 * Wird die Art gewechselt, verschwindet das zugehörige Auswahlfeld aus dem
 * Formular. Ohne diese Bereinigung bliebe der alte Wert unsichtbar am Termin
 * hängen — der Tierarzttermin stünde weiter unter „Familie Meyer" und die
 * Nachbereitung landete im falschen Verlauf. Löschen ginge nicht mehr, weil
 * das Feld nicht mehr sichtbar ist.
 */
export function linksForKind(links: AppointmentLinks, kind: AppointmentKind): AppointmentLinks {
  const person = allowsInterest(kind);
  const animal = allowsAnimal(kind);
  return {
    interestId: person ? links.interestId : '',
    catId: animal ? links.catId : '',
    litterId: animal ? links.litterId : '',
  };
}

/* ================================================================== */
/*  Nachbereitung (F85)                                                */
/* ================================================================== */

export type FollowUpInput = Pick<
  Appointment,
  'id' | 'kind' | 'startAt' | 'cancelledAt' | 'followUpDone'
> &
  Partial<Pick<Appointment, 'title' | 'durationMin' | 'interestId'>>;

export interface FollowUpOptions {
  /** Wie lange nach dem Termin noch gefragt wird. */
  maxAgeDays?: number;
  /** Höchstens so viele Karten gleichzeitig — sonst wird es aufdringlich. */
  limit?: number;
}

/**
 * Termine, die vorbei sind und noch nicht nachbereitet wurden.
 * Neueste zuerst. Abgesagte Termine werden nie nachgefragt.
 */
export function pendingFollowUps<T extends FollowUpInput>(
  appointments: T[],
  now: ISODateTime,
  options: FollowUpOptions = {},
): T[] {
  const maxAgeDays = options.maxAgeDays ?? 30;
  const limit = options.limit ?? 3;
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return [];
  const oldestMs = nowMs - maxAgeDays * 86_400_000;

  return appointments
    .filter((a) => {
      if (a.cancelledAt || a.followUpDone) return false;
      const startMs = new Date(a.startAt).getTime();
      if (!Number.isFinite(startMs)) return false;
      const endMs = startMs + (a.durationMin ?? 0) * 60_000;
      return endMs <= nowMs && startMs >= oldestMs;
    })
    .sort((x, y) => y.startAt.localeCompare(x.startAt))
    .slice(0, limit);
}

/* ================================================================== */
/*  Kalendereinträge aus mehreren Quellen                              */
/* ================================================================== */

export type CalendarSource =
  | 'appointment'
  | 'care_task'
  | 'litter_due'
  | 'health_test'
  | 'breeding_use';

export interface CalendarEntry {
  /** Über alle Quellen eindeutig, z. B. "appt:abc". */
  key: string;
  source: CalendarSource;
  /** Tag, unter dem der Eintrag einsortiert wird (lokale Zeitzone). */
  date: ISODate;
  /** Gesetzt, wenn es eine Uhrzeit gibt. Ohne Uhrzeit = ganztägig. */
  at?: ISODateTime;
  title: string;
  /** Bezug: Interessent, Katze, Wurf … */
  relation?: string;
  detail?: string;
  icon: IconName;
  tone: BadgeTone;
  /** Ziel beim Antippen (Route ohne führendes #). */
  to?: string;
  cancelled?: boolean;
  overdue?: boolean;
}

export const APPOINTMENT_ICON: Record<AppointmentKind, IconName> = {
  meet_breeder: 'users',
  allergy_test: 'heart',
  meet_kittens: 'paw',
  pickup: 'home',
  vet: 'syringe',
  mating: 'cat',
  other: 'calendar',
};

export const CARE_TASK_ICON: Record<CareTaskKind, IconName> = {
  deworming: 'pill',
  vaccination: 'syringe',
  chip: 'chip',
  neuter: 'scissors',
  litter_registration: 'document',
  handover_allowed: 'home',
  health_test: 'heart',
  custom: 'list',
};

/** Klarnamen, damit die reine Funktion keine Datenbank braucht. */
export interface CalendarNames {
  interests?: Map<ID, string>;
  cats?: Map<ID, string>;
  litters?: Map<ID, string>;
  kittens?: Map<ID, string>;
}

export interface CalendarSources {
  appointments?: Appointment[];
  careTasks?: CareTask[];
  litters?: Litter[];
  healthTests?: HealthTest[];
  breedingUses?: BreedingUse[];
  names?: CalendarNames;
}

/** Vorwarnungen vor Ablauf einer Zuchtnutzungs-Frist, in Monaten. */
export const BREEDING_USE_WARN_MONTHS = [6, 3, 1];

/** Zuchtnutzungs-Vorgänge in diesen Stufen brauchen keine Frist mehr. */
const BREEDING_USE_FINISHED = new Set(['closed', 'cancelled', 'ownership_transferred']);

function relationOf(names: CalendarNames | undefined, ids: {
  interestId?: ID;
  kittenId?: ID;
  litterId?: ID;
  catId?: ID;
}): string | undefined {
  if (ids.interestId) {
    const n = names?.interests?.get(ids.interestId);
    if (n) return n;
  }
  if (ids.kittenId) {
    const n = names?.kittens?.get(ids.kittenId);
    if (n) return n;
  }
  if (ids.catId) {
    const n = names?.cats?.get(ids.catId);
    if (n) return n;
  }
  if (ids.litterId) {
    const n = names?.litters?.get(ids.litterId);
    if (n) return n;
  }
  return undefined;
}

function healthTestTitle(t: HealthTest): string {
  const custom = t.label?.trim();
  if (custom && (t.kind === 'genetic' || t.kind === 'other')) return `${custom} fällig`;
  return `${HEALTH_TEST_LABEL[t.kind]} fällig`;
}

/**
 * Führt alle Quellen zu einer sortierten Liste zusammen.
 *
 * `today` steuert nur die Kennzeichnung „überfällig"; die Liste selbst
 * enthält Vergangenheit und Zukunft.
 */
export function buildCalendarEntries(
  sources: CalendarSources,
  today: ISODate,
): CalendarEntry[] {
  const names = sources.names;
  const entries: CalendarEntry[] = [];
  const isOverdue = (d: ISODate) => daysBetween(today, d) < 0;

  /* --- Termine ---------------------------------------------------- */
  for (const a of sources.appointments ?? []) {
    if (!a.startAt || !Number.isFinite(new Date(a.startAt).getTime())) continue;
    const date = dateOf(a.startAt);
    entries.push({
      key: `appt:${a.id}`,
      source: 'appointment',
      date,
      at: a.startAt,
      title: appointmentTitle(a),
      relation: relationOf(names, a),
      detail: a.location?.trim() || undefined,
      icon: APPOINTMENT_ICON[a.kind],
      tone: a.cancelledAt ? 'neutral' : 'accent',
      to: `/kalender/${a.id}`,
      cancelled: Boolean(a.cancelledAt),
    });
  }

  /* --- Fahrplan-Punkte -------------------------------------------- */
  for (const t of sources.careTasks ?? []) {
    if (t.doneAt || t.skipped || !t.dueDate) continue;
    const overdue = isOverdue(t.dueDate);
    entries.push({
      key: `task:${t.id}`,
      source: 'care_task',
      date: t.dueDate,
      title: t.title,
      relation: relationOf(names, t),
      detail: t.detail,
      icon: CARE_TASK_ICON[t.kind] ?? 'list',
      tone: overdue ? 'warn' : 'neutral',
      to: t.kittenId
        ? `/zucht/kitten/${t.kittenId}`
        : t.litterId
          ? `/zucht/wurf/${t.litterId}`
          : t.catId
            ? `/zucht/katze/${t.catId}`
            : undefined,
      overdue,
    });
  }

  /* --- erwartete Geburten ----------------------------------------- */
  for (const l of sources.litters ?? []) {
    if (!l.dueDate) continue;
    if (l.birthDate) continue; // schon geboren
    if (l.status !== 'mated' && l.status !== 'pregnant') continue;
    const mother = names?.cats?.get(l.motherId);
    entries.push({
      key: `litter:${l.id}`,
      source: 'litter_due',
      date: l.dueDate,
      title: 'Geburtstermin erwartet',
      relation: mother,
      detail: l.status === 'pregnant' ? 'Trächtig' : 'Gedeckt',
      icon: 'cat',
      tone: 'accent',
      to: `/zucht/wurf/${l.id}`,
      overdue: isOverdue(l.dueDate),
    });
  }

  /* --- ablaufende Gesundheitstests -------------------------------- */
  for (const t of sources.healthTests ?? []) {
    if (!t.nextDueDate) continue;
    const overdue = isOverdue(t.nextDueDate);
    entries.push({
      key: `health:${t.id}`,
      source: 'health_test',
      date: t.nextDueDate,
      title: healthTestTitle(t),
      relation: names?.cats?.get(t.catId),
      icon: 'heart',
      tone: overdue ? 'warn' : 'neutral',
      to: `/zucht/katze/${t.catId}`,
      overdue,
    });
  }

  /* --- Fristen der Zuchtnutzung ----------------------------------- */
  for (const b of sources.breedingUses ?? []) {
    if (BREEDING_USE_FINISHED.has(b.stage)) continue;
    if (!b.deadlineDate) continue;

    entries.push({
      key: `breeding:${b.id}:deadline`,
      source: 'breeding_use',
      date: b.deadlineDate,
      title: 'Zuchtnutzung: Frist läuft ab',
      relation: b.catName,
      detail: 'Danach entfällt der Preisnachlass.',
      icon: 'contract',
      tone: 'alert',
      to: `/mehr/zuchtnutzung/${b.id}`,
      overdue: isOverdue(b.deadlineDate),
    });

    for (const months of BREEDING_USE_WARN_MONTHS) {
      const date = addMonths(b.deadlineDate, -months);
      // Vorwarnungen vor dem Fristbeginn ergeben keinen Sinn.
      if (b.startDate && daysBetween(b.startDate, date) < 0) continue;
      entries.push({
        key: `breeding:${b.id}:warn${months}`,
        source: 'breeding_use',
        date,
        title: `Zuchtnutzung: noch ${months} ${months === 1 ? 'Monat' : 'Monate'}`,
        relation: b.catName,
        icon: 'clock',
        tone: 'warn',
        to: `/mehr/zuchtnutzung/${b.id}`,
        overdue: isOverdue(date),
      });
    }
  }

  return entries.sort(compareEntries);
}

/**
 * Reihenfolge innerhalb eines Tages: ganztägige Punkte zuerst (sie gelten
 * für den ganzen Tag), danach die Termine nach Uhrzeit.
 */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const aTimed = a.at ? 1 : 0;
  const bTimed = b.at ? 1 : 0;
  if (aTimed !== bTimed) return aTimed - bTimed;
  if (a.at && b.at && a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.title !== b.title) return a.title.localeCompare(b.title, 'de');
  return a.key.localeCompare(b.key);
}

export interface CalendarDay {
  date: ISODate;
  entries: CalendarEntry[];
}

/** Gruppiert die (bereits sortierten) Einträge nach Tag. */
export function groupByDay(entries: CalendarEntry[]): CalendarDay[] {
  const days: CalendarDay[] = [];
  for (const e of [...entries].sort(compareEntries)) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.entries.push(e);
    else days.push({ date: e.date, entries: [e] });
  }
  return days;
}

export interface SplitCalendar {
  /** Heute und später, aufsteigend. */
  upcoming: CalendarDay[];
  /** Vor heute, absteigend — das Jüngste zuerst. */
  past: CalendarDay[];
}

/** Teilt in „kommt noch" und „war schon". Heute zählt immer zu „kommt noch". */
export function splitCalendar(entries: CalendarEntry[], today: ISODate): SplitCalendar {
  const days = groupByDay(entries);
  const upcoming = days.filter((d) => daysBetween(today, d.date) >= 0);
  const past = days.filter((d) => daysBetween(today, d.date) < 0).reverse();
  return { upcoming, past };
}

/** „14:30" für Termine mit Uhrzeit, sonst „ganztägig". */
export function entryTimeText(e: CalendarEntry): string {
  return e.at ? formatTime(e.at) : 'ganztägig';
}
