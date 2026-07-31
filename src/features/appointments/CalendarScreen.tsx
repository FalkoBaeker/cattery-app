import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  List,
  ListRow,
  Screen,
  Spinner,
  Stack,
  useToast,
  type BadgeTone,
} from '../../ui';
import { db, patch } from '../../db/db';
import type { Appointment, ISODate } from '../../types';
import {
  daysBetween,
  formatDateTime,
  formatDateWithWeekday,
  formatRelativeDay,
  nowISO,
  todayISO,
} from '../../lib/date';
import { plural } from '../../lib/format';
import {
  appointmentTitle,
  entryTimeText,
  leadText,
  pendingFollowUps,
  splitCalendar,
  upcomingWithin,
  type CalendarDay,
  type CalendarEntry,
} from './reminders';
import { useCalendarData } from './useCalendarData';
import { pruneReminderLog, useNotifyState, useReminderRunner } from './notify';
import { NotifySheet } from './NotifySheet';
import { FollowUpSheet } from './FollowUpSheet';
import { SwipeCard } from './SwipeCard';

/* ------------------------------------------------------------------ */
/*  Bausteine                                                          */
/* ------------------------------------------------------------------ */

const ICON_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-text-dim',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  alert: 'bg-alert-soft text-alert',
};

function EntryIcon({ entry }: { entry: CalendarEntry }) {
  return (
    <span
      className={[
        'flex size-9 items-center justify-center rounded-full',
        ICON_TONE[entry.cancelled ? 'neutral' : entry.tone],
      ].join(' ')}
    >
      <Icon name={entry.icon} size={19} />
    </span>
  );
}

function EntryRow({ entry, onOpen }: { entry: CalendarEntry; onOpen: (to: string) => void }) {
  const subtitle = [entry.relation, entry.detail].filter(Boolean).join(' · ');
  const trailing = entry.cancelled ? (
    <Badge tone="neutral">Abgesagt</Badge>
  ) : !entry.at && entry.overdue ? (
    <Badge tone="warn">überfällig</Badge>
  ) : (
    entryTimeText(entry)
  );

  return (
    <ListRow
      leading={<EntryIcon entry={entry} />}
      title={
        <span className={entry.cancelled ? 'text-text-dim line-through' : undefined}>
          {entry.title}
        </span>
      }
      subtitle={subtitle || undefined}
      trailing={trailing}
      onClick={entry.to ? () => onOpen(entry.to as string) : undefined}
    />
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayHeading(date: ISODate, today: ISODate): { main: string; sub?: string } {
  const diff = daysBetween(today, date);
  if (Math.abs(diff) <= 2) {
    return { main: capitalize(formatRelativeDay(date, today)), sub: formatDateWithWeekday(date) };
  }
  return {
    main: formatDateWithWeekday(date),
    sub: Math.abs(diff) <= 14 ? formatRelativeDay(date, today) : undefined,
  };
}

function DayGroup({
  day,
  today,
  onOpen,
}: {
  day: CalendarDay;
  today: ISODate;
  onOpen: (to: string) => void;
}) {
  const { main, sub } = dayHeading(day.date, today);
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline gap-2 px-1">
        <h2 className="text-[0.95rem] font-semibold text-text">{main}</h2>
        {sub && <span className="text-[0.8rem] text-text-dim">{sub}</span>}
      </header>
      <List>
        {day.entries.map((e) => (
          <EntryRow key={e.key} entry={e} onOpen={onOpen} />
        ))}
      </List>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Bildschirm                                                         */
/* ------------------------------------------------------------------ */

export function CalendarScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const today = todayISO();
  const { loading, entries, appointments, names } = useCalendarData(today);

  const [now, setNow] = useState(() => nowISO());
  const [showPast, setShowPast] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [followUp, setFollowUp] = useState<Appointment | null>(null);
  const [notify, refreshNotify] = useNotifyState();

  // Der Prüflauf startet schon beim Laden der App (siehe notify.ts). Hier wird
  // er nur zusätzlich am Leben gehalten — doppelt läuft er dadurch nicht.
  useReminderRunner();

  useEffect(() => {
    void pruneReminderLog().catch(() => {
      /* Aufräumen ist Kür, kein Muss. */
    });
  }, []);

  // Hält „in 20 Minuten" aktuell, ohne die ganze Seite neu zu laden.
  useEffect(() => {
    const handle = window.setInterval(() => setNow(nowISO()), 30_000);
    return () => window.clearInterval(handle);
  }, []);

  const { upcoming, past } = useMemo(() => splitCalendar(entries, today), [entries, today]);
  const soon = useMemo(() => upcomingWithin(appointments, now), [appointments, now]);
  const followUps = useMemo(() => pendingFollowUps(appointments, now), [appointments, now]);

  const pastCount = past.reduce((sum, d) => sum + d.entries.length, 0);
  const upcomingCount = upcoming.reduce((sum, d) => sum + d.entries.length, 0);

  function open(to: string) {
    navigate(to);
  }

  /** Liefert false, wenn nichts gespeichert wurde — dann kommt die Karte zurück. */
  async function dismissFollowUp(a: Appointment): Promise<boolean> {
    try {
      await patch(db.appointments, a.id, { followUpDone: true });
      return true;
    } catch {
      toast.error('Die Frage konnte nicht ausgeblendet werden. Bitte noch einmal versuchen.');
      return false;
    }
  }

  /* --- Laden ------------------------------------------------------- */
  if (loading) {
    return (
      <Screen title="Kalender">
        <div className="flex flex-col items-center gap-3 py-16 text-text-dim">
          <Spinner size={26} />
          <p className="text-[0.9rem]">Termine werden geladen …</p>
        </div>
      </Screen>
    );
  }

  const nothingAtAll = entries.length === 0;

  return (
    <Screen
      title="Kalender"
      subtitle={
        upcomingCount > 0
          ? `${upcomingCount} ${plural(upcomingCount, 'kommender Eintrag', 'kommende Einträge')}`
          : 'Nichts geplant'
      }
      actions={
        <IconButton
          icon="bell"
          label="Erinnerungen"
          variant={notify === 'granted' ? 'ghost' : 'quiet'}
          onClick={() => setNotifyOpen(true)}
        />
      }
    >
      <Stack gap="lg">
        {/* --- Nachbereitung: „Wie war's?" (F85) --------------------- */}
        {followUps.map((a) => (
          <SwipeCard key={a.id} onDismiss={() => dismissFollowUp(a)} dismissLabel="Nicht nachfragen">
            <div className="flex flex-col gap-2">
              <span className="text-[0.78rem] font-semibold tracking-wide text-text-dim uppercase">
                Wie war's?
              </span>
              <div>
                <p className="font-medium text-text">{appointmentTitle(a)}</p>
                <p className="text-[0.85rem] text-text-dim">
                  {formatDateTime(a.startAt)}
                  {a.interestId && names.interests?.get(a.interestId)
                    ? ` · ${names.interests.get(a.interestId)}`
                    : ''}
                </p>
              </div>
              <Button variant="primary" size="sm" icon="edit" onClick={() => setFollowUp(a)}>
                Notiz schreiben
              </Button>
            </div>
          </SwipeCard>
        ))}

        {/* --- Anstehende Erinnerungen ------------------------------- */}
        {soon.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
              Steht an
            </h2>
            <List>
              {soon.map(({ appointment, msUntilStart }) => (
                <ListRow
                  key={appointment.id}
                  leading={
                    <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Icon name="bell" size={19} />
                    </span>
                  }
                  title={appointmentTitle(appointment)}
                  subtitle={`${leadText(msUntilStart)} · ${formatDateTime(appointment.startAt)}`}
                  onClick={() => navigate(`/kalender/${appointment.id}`)}
                />
              ))}
            </List>
            <p className="px-1 text-[0.78rem] leading-relaxed text-text-faint">
              Diese Karte erscheint unabhängig davon, ob eine Mitteilung angekommen ist. Termine
              mit abgeschalteten Erinnerungen bleiben still.
            </p>
          </section>
        )}

        {/* --- Hinweis zu den Mitteilungen --------------------------- */}
        {notify !== 'granted' && notify !== 'unsupported' && (
          <Callout
            tone={notify === 'denied' ? 'alert' : 'warn'}
            icon="bell"
            title={
              notify === 'needs_install'
                ? 'Erinnerungen brauchen die App auf dem Home-Bildschirm'
                : notify === 'denied'
                  ? 'Mitteilungen sind am iPhone abgelehnt'
                  : 'Erinnerungen sind noch nicht eingeschaltet'
            }
          >
            <p className="mt-1">
              Termine stehen trotzdem alle hier. Es kommt dann nur keine Mitteilung aufs Sperrbild.
            </p>
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              onClick={() => setNotifyOpen(true)}
            >
              Was heißt das?
            </Button>
          </Callout>
        )}

        {/* --- Kommendes -------------------------------------------- */}
        {nothingAtAll ? (
          <EmptyState
            icon="calendar"
            title="Noch keine Termine"
            description="Hier laufen Besuche, Tierarzttermine und Deckbesuche zusammen — dazu alles, was der Wurf-Fahrplan vorgibt, erwartete Geburten und ablaufende Fristen. Leg unten rechts den ersten Termin an."
            action={
              <Button variant="primary" icon="plus" onClick={() => navigate('/kalender/neu')}>
                Termin anlegen
              </Button>
            }
          />
        ) : upcoming.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title="Nichts mehr geplant"
            description="Alle Termine liegen in der Vergangenheit. Vergangenes lässt sich unten aufklappen."
            action={
              <Button variant="primary" icon="plus" onClick={() => navigate('/kalender/neu')}>
                Termin anlegen
              </Button>
            }
          />
        ) : (
          upcoming.map((day) => (
            <DayGroup key={day.date} day={day} today={today} onOpen={open} />
          ))
        )}

        {/* --- Vergangenes ------------------------------------------ */}
        {past.length > 0 && (
          <div className="flex flex-col gap-4">
            <Button
              block
              variant="quiet"
              icon={showPast ? 'chevron-up' : 'chevron-down'}
              onClick={() => setShowPast((v) => !v)}
            >
              {showPast ? 'Vergangenes ausblenden' : `Vergangenes anzeigen (${pastCount})`}
            </Button>
            {showPast &&
              past.map((day) => <DayGroup key={day.date} day={day} today={today} onOpen={open} />)}
          </div>
        )}
      </Stack>

      <Fab label="Termin anlegen" onClick={() => navigate('/kalender/neu')} />

      <NotifySheet
        open={notifyOpen}
        onClose={() => {
          setNotifyOpen(false);
          refreshNotify();
        }}
      />

      <FollowUpSheet
        appointment={followUp}
        interestName={
          followUp?.interestId ? names.interests?.get(followUp.interestId) : undefined
        }
        onClose={() => setFollowUp(null)}
      />
    </Screen>
  );
}
