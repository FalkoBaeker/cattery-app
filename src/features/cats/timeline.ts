/**
 * Der Zeitstrahl einer Katze.
 *
 * „Dass Notizen untergehen" ist das Problem, „fortlaufende Dokumentation" die
 * Lösung (F6/F7). Hier laufen alle Ereignisse eines Tieres zusammen: Geburt,
 * Rolligkeiten, Gesundheitstests, Würfe, Termine, Wiegungen.
 *
 * Reine Funktion ohne React und ohne Datenbankzugriff — die Aufrufer holen die
 * Daten und reichen sie herein.
 */

import type {
  Appointment,
  CareTask,
  Cat,
  CatWeightEntry,
  HealthTest,
  HeatCycle,
  ID,
  ISODate,
  Litter,
} from '../../types';
import { APPOINTMENT_KIND_LABEL, LITTER_STATUS_LABEL } from '../../types';
import type { IconName } from '../../ui';
import { dateOf, formatDate, formatDateShort, todayISO } from '../../lib/date';
import { formatGrams } from '../../lib/format';
import { HEALTH_TEST_ICON, healthTestStatus, healthTestTitle } from './tests';
import { normalizeHeatCycles } from './heat';

export type CatEventKind =
  | 'birth'
  | 'heat'
  | 'health_test'
  | 'litter'
  | 'appointment'
  | 'weight'
  | 'task';

export type EventTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'alert';

export interface CatTimelineEvent {
  id: string;
  /** Sortierschlüssel "2026-03-03T14:05" — auch ohne Uhrzeit vergleichbar. */
  sortKey: string;
  date: ISODate;
  /** "14:05", wenn eine Uhrzeit bekannt ist. */
  time?: string;
  kind: CatEventKind;
  icon: IconName;
  tone: EventTone;
  title: string;
  detail?: string;
  /** Ziel innerhalb der App, z. B. "/zucht/wurf/abc". */
  href?: string;
}

export interface CatTimelineInput {
  cat: Pick<Cat, 'id' | 'birthDate' | 'breederName'>;
  heats?: readonly HeatCycle[];
  tests?: readonly HealthTest[];
  litters?: readonly Litter[];
  /** Anzahl Kitten je Wurf, für die Beschriftung. */
  kittenCountByLitter?: ReadonlyMap<ID, number>;
  appointments?: readonly Appointment[];
  weights?: readonly CatWeightEntry[];
  careTasks?: readonly CareTask[];
  /** Heute — für die Bewertung der Testgültigkeit. */
  ref?: ISODate;
}

function timeOf(iso: string): { date: ISODate; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: dateOf(iso), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** Alle Ereignisse einer Katze, neueste zuerst. */
export function buildCatTimeline(input: CatTimelineInput): CatTimelineEvent[] {
  const ref = input.ref ?? todayISO();
  const events: CatTimelineEvent[] = [];

  const push = (e: Omit<CatTimelineEvent, 'sortKey'> & { sortKey?: string }) => {
    events.push({ ...e, sortKey: e.sortKey ?? `${e.date}T${e.time ?? '00:00'}` });
  };

  /* --- Geburt der Katze ------------------------------------------- */
  if (input.cat.birthDate) {
    push({
      id: `birth:${input.cat.id}`,
      date: input.cat.birthDate,
      kind: 'birth',
      icon: 'star',
      tone: 'neutral',
      title: 'Geboren',
      detail: input.cat.breederName ? `Züchter: ${input.cat.breederName}` : undefined,
    });
  }

  /* --- Rolligkeiten ------------------------------------------------ */
  const { cycles } = normalizeHeatCycles(
    (input.heats ?? []).map((h) => ({ id: h.id, startDate: h.startDate, endDate: h.endDate })),
  );
  const noteByStart = new Map<ISODate, string>();
  for (const h of input.heats ?? []) {
    const note = h.notes?.trim();
    if (note && !noteByStart.has(h.startDate)) noteByStart.set(h.startDate, note);
  }
  for (const c of cycles) {
    const parts: string[] = [];
    if (c.durationDays != null) {
      parts.push(
        `${c.durationDays} ${c.durationDays === 1 ? 'Tag' : 'Tage'} (bis ${formatDateShort(c.endDate)})`,
      );
    } else {
      parts.push('Ende nicht erfasst');
    }
    const note = noteByStart.get(c.startDate);
    if (note) parts.push(note);
    push({
      id: `heat:${c.id ?? c.startDate}`,
      date: c.startDate,
      kind: 'heat',
      icon: 'refresh',
      tone: 'accent',
      title: 'Rollig',
      detail: parts.join(' · '),
    });
  }

  /* --- Gesundheitstests -------------------------------------------- */
  for (const t of input.tests ?? []) {
    if (!t?.date) continue;
    const status = healthTestStatus(t, ref);
    const parts: string[] = [];
    if (t.result?.trim()) parts.push(t.result.trim());
    if (status.nextDue) parts.push(`nächste Fälligkeit ${formatDate(status.nextDue)}`);
    else parts.push('unbefristet');
    push({
      id: `test:${t.id}`,
      date: t.date,
      kind: 'health_test',
      icon: HEALTH_TEST_ICON[t.kind] ?? 'document',
      tone: status.tone === 'ok' ? 'ok' : status.tone,
      title: healthTestTitle(t),
      detail: parts.join(' · '),
    });
  }

  /* --- Würfe -------------------------------------------------------- */
  for (const l of input.litters ?? []) {
    if (!l) continue;
    const role = l.motherId === input.cat.id ? 'Mutter' : 'Vater';
    const href = `/zucht/wurf/${l.id}`;
    const count = input.kittenCountByLitter?.get(l.id);

    if (l.matingDate) {
      push({
        id: `litter-mated:${l.id}`,
        date: l.matingDate,
        kind: 'litter',
        icon: 'heart',
        tone: 'accent',
        title: 'Gedeckt',
        detail: `als ${role}`,
        href,
      });
    }
    if (l.birthDate) {
      push({
        id: `litter-born:${l.id}`,
        date: l.birthDate,
        kind: 'litter',
        icon: 'paw',
        tone: 'ok',
        title: 'Wurf geboren',
        detail: [
          count != null ? `${count} ${count === 1 ? 'Kitten' : 'Kitten'}` : undefined,
          `als ${role}`,
        ]
          .filter(Boolean)
          .join(' · '),
        href,
      });
    } else if (l.dueDate) {
      push({
        id: `litter-due:${l.id}`,
        date: l.dueDate,
        kind: 'litter',
        icon: 'calendar',
        tone: 'neutral',
        title: 'Geburtstermin erwartet',
        detail: `${LITTER_STATUS_LABEL[l.status]} · als ${role}`,
        href,
      });
    }
  }

  /* --- Termine ------------------------------------------------------ */
  for (const a of input.appointments ?? []) {
    const t = a?.startAt ? timeOf(a.startAt) : null;
    if (!t) continue;
    push({
      id: `appt:${a.id}`,
      date: t.date,
      time: t.time,
      kind: 'appointment',
      icon: 'calendar',
      tone: a.cancelledAt ? 'alert' : 'neutral',
      title: a.title?.trim() || APPOINTMENT_KIND_LABEL[a.kind],
      detail: [
        a.cancelledAt ? 'abgesagt' : a.doneAt ? 'erledigt' : undefined,
        a.note?.trim(),
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/kalender/${a.id}`,
    });
  }

  /* --- Wiegungen ---------------------------------------------------- */
  for (const w of input.weights ?? []) {
    const t = w?.at ? timeOf(w.at) : null;
    if (!t) continue;
    push({
      id: `weight:${w.id}`,
      date: t.date,
      time: t.time,
      kind: 'weight',
      icon: 'weight',
      tone: 'neutral',
      title: `Gewogen: ${formatGrams(w.grams)}`,
      detail: w.note?.trim() || undefined,
    });
  }

  /* --- Aufgaben ----------------------------------------------------- */
  for (const task of input.careTasks ?? []) {
    if (!task?.dueDate) continue;
    push({
      id: `task:${task.id}`,
      date: task.doneAt ?? task.dueDate,
      kind: 'task',
      icon: task.doneAt ? 'check-circle' : 'bell',
      tone: task.doneAt ? 'ok' : 'warn',
      title: task.title,
      detail: task.doneAt ? 'erledigt' : `fällig ${formatDate(task.dueDate)}`,
    });
  }

  return events.sort((a, b) => b.sortKey.localeCompare(a.sortKey) || a.id.localeCompare(b.id));
}
