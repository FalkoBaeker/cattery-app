import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Badge,
  Button,
  Callout,
  ChoiceGrid,
  EmptyState,
  EventDateTimeField,
  Icon,
  List,
  ListRow,
  Screen,
  Section,
  Select,
  Spinner,
  Stack,
  Switch,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { db, insert, patch, remove } from '../../db/db';
import {
  APPOINTMENT_KIND_LABEL,
  type Appointment,
  type AppointmentKind,
  type ID,
  type ISODateTime,
} from '../../types';
import {
  formatDate,
  formatDateTime,
  fromLocalInputValue,
  nowISO,
  toLocalInputValue,
} from '../../lib/date';
import {
  allowsAnimal,
  allowsInterest,
  APPOINTMENT_ICON,
  appointmentTitle,
  isVisitorKind,
  linksForKind,
  openReminderKeys,
} from './reminders';
import { useAppointmentFormData, useAppSettingsState } from './useCalendarData';
import { markFired, resetReminders, NOTIFY_STATE_LABEL, useNotifyState } from './notify';
import { NotifySheet } from './NotifySheet';
import { FollowUpSheet } from './FollowUpSheet';

/* ------------------------------------------------------------------ */
/*  Entwurf                                                            */
/* ------------------------------------------------------------------ */

interface Draft {
  kind: AppointmentKind | null;
  startAt: ISODateTime;
  durationMin: string;
  title: string;
  interestId: string;
  catId: string;
  litterId: string;
  location: string;
  note: string;
  remind24h: boolean;
  remind1h: boolean;
}

/** Nächste volle Stunde — der wahrscheinlichste Terminbeginn. */
function nextFullHour(): ISODateTime {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

function emptyDraft(defaultPlace: string): Draft {
  return {
    kind: null,
    startAt: nextFullHour(),
    durationMin: '',
    title: '',
    interestId: '',
    catId: '',
    litterId: '',
    location: defaultPlace,
    note: '',
    // Beide Erinnerungen sind standardmäßig an (F83/F84).
    remind24h: true,
    remind1h: true,
  };
}

function draftFrom(a: Appointment): Draft {
  return {
    kind: a.kind,
    startAt: a.startAt,
    durationMin: a.durationMin ? String(a.durationMin) : '',
    title: a.title ?? '',
    interestId: a.interestId ?? '',
    catId: a.catId ?? '',
    litterId: a.litterId ?? '',
    location: a.location ?? '',
    note: a.note ?? '',
    remind24h: a.remind24h,
    remind1h: a.remind1h,
  };
}

const KIND_ORDER: AppointmentKind[] = [
  'meet_breeder',
  'allergy_test',
  'meet_kittens',
  'pickup',
  'vet',
  'mating',
  'other',
];

const KIND_HINT: Record<AppointmentKind, string> = {
  meet_breeder: 'Erstes Treffen',
  allergy_test: 'Verträglichkeit prüfen',
  meet_kittens: 'Besuch beim Wurf',
  pickup: 'Das Kitten zieht aus',
  vet: 'Kein Besuchstermin',
  mating: 'Kater oder Königin',
  other: 'Alles Übrige',
};

const DURATION_OPTIONS = [
  { value: '30', label: '30 Minuten' },
  { value: '45', label: '45 Minuten' },
  { value: '60', label: '1 Stunde' },
  { value: '90', label: '1,5 Stunden' },
  { value: '120', label: '2 Stunden' },
  { value: '180', label: '3 Stunden' },
];

/* ------------------------------------------------------------------ */
/*  Bildschirm                                                         */
/* ------------------------------------------------------------------ */

export function AppointmentDetailScreen() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const isNew = appointmentId === 'neu' || !appointmentId;
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { settings, loading: settingsLoading } = useAppSettingsState();
  const form = useAppointmentFormData();

  // Ein Umweg über ein Hüllobjekt: `useLiveQuery` liefert `undefined` beim
  // Laden *und* wenn nichts gefunden wurde. So bleiben beide unterscheidbar.
  const loaded = useLiveQuery(
    async () => (isNew ? { value: undefined } : { value: await db.appointments.get(appointmentId as ID) }),
    [appointmentId, isNew],
  );
  const existing = loaded?.value;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [kindOpen, setKindOpen] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [notify, refreshNotify] = useNotifyState();
  const baseline = useRef<string>('');

  /* --- Entwurf befüllen, sobald die Daten da sind ------------------ */
  useEffect(() => {
    if (draft) return;
    if (isNew) {
      // Erst wenn die Einstellungen da sind — sonst fehlt der Standard-Ort.
      if (settingsLoading) return;
      const d = emptyDraft(settings.seller.place ?? '');
      baseline.current = JSON.stringify(d);
      setDraft(d);
      return;
    }
    if (existing) {
      const d = draftFrom(existing);
      baseline.current = JSON.stringify(d);
      setDraft(d);
    }
  }, [draft, isNew, existing, settingsLoading, settings.seller.place]);

  const dirty = draft ? JSON.stringify(draft) !== baseline.current : false;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  /**
   * Terminart wechseln. Bezüge, die zur neuen Art nicht mehr passen, fallen
   * dabei weg — sonst bliebe der Interessent unsichtbar am Tierarzttermin
   * hängen und die Nachbereitung landete im falschen Verlauf.
   */
  function setKind(next: AppointmentKind) {
    setDraft((d) => (d ? { ...d, kind: next, ...linksForKind(d, next) } : d));
    setKindOpen(false);
  }

  /* --- Speichern --------------------------------------------------- */
  async function save() {
    if (!draft || !draft.kind) return;
    setSaving(true);
    try {
      // Doppelt hält besser: Auch beim Speichern werden nur die Bezüge
      // geschrieben, die zur Terminart passen.
      const links = linksForKind(draft, draft.kind);
      const fields = {
        kind: draft.kind,
        startAt: draft.startAt,
        durationMin: draft.durationMin ? Number(draft.durationMin) : undefined,
        title: draft.title.trim() || undefined,
        interestId: links.interestId || undefined,
        catId: links.catId || undefined,
        litterId: links.litterId || undefined,
        location: draft.location.trim() || undefined,
        note: draft.note.trim() || undefined,
        remind24h: draft.remind24h,
        remind1h: draft.remind1h,
      };

      if (isNew) {
        const created = await insert(db.appointments, fields);
        // Wer den Termin gerade selbst angelegt hat, weiß von ihm: bereits
        // offene Erinnerungs-Fenster gelten sofort als erledigt, sonst käme
        // eine Minute später „Termin in 3 Stunden" aufs Sperrbild. Scheitert
        // nur dieses Vermerken, ist der Termin trotzdem gespeichert — die
        // überflüssige Mitteilung ist dann das kleinere Übel.
        await markFired(openReminderKeys(created, nowISO())).catch(() => {});
        baseline.current = JSON.stringify(draft);
        toast.success('Termin angelegt.');
        navigate(`/kalender/${created.id}`, { replace: true });
      } else if (existing) {
        await patch(db.appointments, existing.id, fields);
        // Verschobener Termin: die Erinnerungen sollen neu greifen dürfen —
        // aber nicht sofort feuern, wenn das Fenster zum neuen Zeitpunkt
        // längst offen ist (siehe oben beim Anlegen).
        if (existing.startAt !== draft.startAt) {
          await resetReminders(existing.id);
          await markFired(
            openReminderKeys({ id: existing.id, startAt: draft.startAt }, nowISO()),
          ).catch(() => {});
        }
        baseline.current = JSON.stringify(draft);
        toast.success('Gespeichert.');
      }
    } catch {
      toast.error('Der Termin konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function goBack() {
    if (dirty) {
      const ok = await confirm({
        title: 'Änderungen verwerfen?',
        message: 'Es gibt ungespeicherte Änderungen an diesem Termin.',
        confirmLabel: 'Verwerfen',
        cancelLabel: 'Weiter bearbeiten',
        danger: true,
      });
      if (!ok) return;
    }
    navigate('/kalender');
  }

  /** Absage zurücknehmen — an zwei Stellen gebraucht, deshalb einmal hier. */
  async function reviveAppointment(appointment: Appointment) {
    try {
      await patch(db.appointments, appointment.id, { cancelledAt: undefined });
      // Beim Absagen werden alte Zustellmerker entfernt. Liegt der Termin beim
      // Zurücknehmen bereits in einem offenen Fenster, dieses sofort als
      // gesehen markieren — sonst würde dieselbe Erinnerung erneut erscheinen.
      await markFired(openReminderKeys(appointment, nowISO())).catch(() => {});
      toast.success('Der Termin gilt wieder.');
    } catch {
      toast.error('Die Absage konnte nicht zurückgenommen werden.');
    }
  }

  async function toggleCancelled() {
    if (!existing) return;
    if (existing.cancelledAt) {
      await reviveAppointment(existing);
      return;
    }
    try {
      await patch(db.appointments, existing.id, { cancelledAt: nowISO() });
      await resetReminders(existing.id);
    } catch {
      toast.error('Die Absage konnte nicht gespeichert werden.');
      return;
    }
    toast.show('Termin abgesagt. Er bleibt im Kalender stehen.', {
      tone: 'warn',
      durationMs: 6000,
      action: {
        label: 'Rückgängig',
        onClick: () => {
          void reviveAppointment(existing);
        },
      },
    });
  }

  async function deleteAppointment() {
    if (!existing) return;
    const ok = await confirm({
      title: 'Termin löschen?',
      message:
        'Der Termin wird endgültig entfernt. Wenn er nur nicht stattfindet, sag ihn lieber ab — dann bleibt er im Verlauf sichtbar.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove(db.appointments, existing.id);
      await resetReminders(existing.id);
      toast.success('Termin gelöscht.');
      navigate('/kalender', { replace: true });
    } catch {
      toast.error('Der Termin konnte nicht gelöscht werden.');
    }
  }

  /* --- Zustände ---------------------------------------------------- */

  // Reihenfolge zählt: Der Entwurf gewinnt vor dem Ladezustand. Direkt nach
  // dem Anlegen zeigt die Adresse schon die neue Kennung, die Wächter-Abfrage
  // läuft aber noch — ohne diese Reihenfolge blitzte hier kurz der Spinner auf,
  // obwohl das Formular längst ausgefüllt vor einem liegt.
  if (!isNew && loaded !== undefined && !existing) {
    return (
      <Screen title="Termin" back>
        <EmptyState
          icon="calendar"
          title="Diesen Termin gibt es nicht mehr"
          description="Er wurde gelöscht oder der Link ist veraltet."
          action={
            <Button variant="primary" icon="arrow-left" onClick={() => navigate('/kalender')}>
              Zum Kalender
            </Button>
          }
        />
      </Screen>
    );
  }

  if (!draft) {
    return (
      <Screen title="Termin" back>
        <div className="flex flex-col items-center gap-3 py-16 text-text-dim">
          <Spinner size={26} />
          <p className="text-[0.9rem]">Termin wird geladen …</p>
        </div>
      </Screen>
    );
  }

  const kind = draft.kind;
  const visitor = kind ? isVisitorKind(kind) : false;
  const personLinked = kind ? allowsInterest(kind) : false;
  const animalLinked = kind ? allowsAnimal(kind) : false;
  const cancelled = Boolean(existing?.cancelledAt);
  // Für die Nachbereitung zählt der gespeicherte Zeitpunkt, nicht der Entwurf —
  // sonst springt die Frage beim Umdatieren hin und her.
  const past = existing ? new Date(existing.startAt).getTime() < Date.now() : false;
  const askFollowUp = Boolean(existing) && past && !cancelled && !existing?.followUpDone;

  const interestOptions = form.interests.map((i) => ({ value: i.id, label: i.name }));
  const catOptions = form.cats.map((c) => ({ value: c.id, label: c.callName }));
  const litterOptions = form.litters.map((l) => {
    const name = form.names.litters?.get(l.id) ?? 'Wurf';
    const when = l.birthDate ?? l.dueDate;
    return { value: l.id, label: when ? `${name} · ${formatDate(when)}` : name };
  });

  return (
    <Screen
      title={isNew ? 'Neuer Termin' : kind ? appointmentTitle({ kind, title: draft.title }) : 'Termin'}
      subtitle={isNew ? undefined : formatDateTime(draft.startAt)}
      back={() => void goBack()}
      actions={
        <Button
          variant="primary"
          loading={saving}
          disabled={!kind || (!isNew && !dirty)}
          onClick={() => void save()}
        >
          {isNew ? 'Anlegen' : 'Sichern'}
        </Button>
      }
    >
      <Stack gap="lg">
        {cancelled && (
          <Callout tone="warn" icon="info" title="Dieser Termin ist abgesagt">
            Er bleibt im Kalender stehen, es kommt aber keine Erinnerung mehr.
          </Callout>
        )}

        {/* --- Schritt 1: die Art ----------------------------------- */}
        {kindOpen || !kind ? (
          <Section
            title="Was für ein Termin ist das?"
            description="Davon hängt ab, was danach abgefragt wird."
          >
            <ChoiceGrid<AppointmentKind>
              value={kind}
              onChange={(v) => setKind(v)}
              options={KIND_ORDER.map((k) => ({
                value: k,
                label: APPOINTMENT_KIND_LABEL[k],
                description: KIND_HINT[k],
                icon: <Icon name={APPOINTMENT_ICON[k]} size={20} />,
              }))}
            />
          </Section>
        ) : (
          <List>
            <ListRow
              leading={
                <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Icon name={APPOINTMENT_ICON[kind]} size={19} />
                </span>
              }
              title={APPOINTMENT_KIND_LABEL[kind]}
              subtitle={KIND_HINT[kind]}
              trailing="Ändern"
              onClick={() => setKindOpen(true)}
            />
          </List>
        )}

        {kind && (
          <>
            {/* --- Wann ------------------------------------------- */}
            <Section title="Wann">
              <Stack gap="sm">
                <EventDateTimeField
                  label="Datum und Uhrzeit"
                  value={toLocalInputValue(draft.startAt)}
                  onChange={(v) => {
                    if (!v || !Number.isFinite(new Date(v).getTime())) return;
                    const iso = fromLocalInputValue(v);
                    if (Number.isFinite(new Date(iso).getTime())) set('startAt', iso);
                  }}
                />
                <Select
                  label="Dauer"
                  hint="Darf leer bleiben."
                  placeholder="Keine Angabe"
                  options={DURATION_OPTIONS}
                  value={draft.durationMin}
                  onChange={(e) => set('durationMin', e.target.value)}
                />
              </Stack>
            </Section>

            {/* --- Wer und was ------------------------------------ */}
            <Section title="Bezug" description="Alles freiwillig — ein Termin geht auch ohne.">
              <Stack gap="sm">
                {personLinked && (
                  <Select
                    label="Interessent"
                    placeholder={
                      form.loading ? 'Wird geladen …' : interestOptions.length === 0 ? 'Noch niemand auf der Warteliste' : 'Niemand verknüpft'
                    }
                    options={interestOptions}
                    value={draft.interestId}
                    onChange={(e) => set('interestId', e.target.value)}
                    hint={
                      interestOptions.length === 0 && !form.loading
                        ? 'Interessenten kommen aus der Warteliste. Der Termin geht auch ohne.'
                        : undefined
                    }
                  />
                )}

                {animalLinked && (
                  <>
                    <Select
                      label="Katze"
                      placeholder={
                        form.loading ? 'Wird geladen …' : catOptions.length === 0 ? 'Noch keine Katze angelegt' : 'Keine Katze verknüpft'
                      }
                      options={catOptions}
                      value={draft.catId}
                      onChange={(e) => set('catId', e.target.value)}
                    />
                    <Select
                      label="Wurf"
                      placeholder={
                        form.loading ? 'Wird geladen …' : litterOptions.length === 0 ? 'Noch kein Wurf angelegt' : 'Kein Wurf verknüpft'
                      }
                      options={litterOptions}
                      value={draft.litterId}
                      onChange={(e) => set('litterId', e.target.value)}
                    />
                  </>
                )}

                <TextInput
                  label="Ort"
                  value={draft.location}
                  placeholder={settings.seller.place || 'z. B. bei uns zu Hause'}
                  onChange={(e) => set('location', e.target.value)}
                  hint={
                    settings.seller.place
                      ? 'Vorgabe aus den Einstellungen. Lässt sich hier überschreiben.'
                      : 'Ein Standard-Ort lässt sich in den Einstellungen hinterlegen.'
                  }
                />

                <TextInput
                  label="Titel"
                  value={draft.title}
                  placeholder={APPOINTMENT_KIND_LABEL[kind]}
                  onChange={(e) => set('title', e.target.value)}
                  hint="Ohne Angabe wird die Art des Termins als Titel benutzt."
                />
              </Stack>
            </Section>

            {/* --- Hausregeln (F88) ------------------------------- */}
            {visitor && (
              <Callout tone="accent" icon="home" title="Hausregeln kurz erwähnen">
                Schuhe bitte ausziehen, vor dem Kontakt mit den Kitten Hände waschen. Am besten
                schon bei der Terminbestätigung sagen — dann ist es vor Ort keine Überraschung.
              </Callout>
            )}

            {kind === 'pickup' && (
              <Callout tone="neutral" icon="info">
                Abgabe ist frühestens nach {settings.schedule.handoverWeek} Wochen erlaubt, mit
                zwei Impfungen. Der Wurf-Fahrplan zeigt, wann das erreicht ist.
              </Callout>
            )}

            {/* --- Erinnerungen ----------------------------------- */}
            <Section title="Erinnerungen">
              <Stack gap="sm">
                <List>
                  <Switch
                    label="24 Stunden vorher"
                    description="Einen Tag im Voraus Bescheid bekommen"
                    checked={draft.remind24h}
                    onChange={(v) => set('remind24h', v)}
                  />
                  <Switch
                    label="1 Stunde vorher"
                    description="Kurz vorher noch einmal"
                    checked={draft.remind1h}
                    onChange={(v) => set('remind1h', v)}
                  />
                </List>

                <button
                  type="button"
                  onClick={() => setNotifyOpen(true)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-left active:bg-surface-2"
                >
                  <Icon name="bell" size={19} className="shrink-0 text-text-dim" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.92rem] font-medium text-text">
                      Mitteilungen: {NOTIFY_STATE_LABEL[notify]}
                    </span>
                    <span className="block text-[0.8rem] text-text-dim">
                      Erinnerungen kommen nur zuverlässig, wenn die App auf dem Home-Bildschirm
                      liegt und regelmäßig geöffnet wird.
                    </span>
                  </span>
                  <Icon name="chevron-right" size={18} className="shrink-0 text-text-faint" />
                </button>
              </Stack>
            </Section>

            {/* --- Notiz ------------------------------------------ */}
            <Section title="Notiz">
              <TextArea
                rows={4}
                value={draft.note}
                placeholder="Was noch wichtig ist …"
                onChange={(e) => set('note', e.target.value)}
              />
            </Section>

            {/* --- Nachbereitung (F85) ---------------------------- */}
            {askFollowUp && (
              <Section title="Nachbereitung">
                <Callout tone="accent" icon="edit" title="Wie war's?">
                  <p className="mt-1">
                    Der Termin ist vorbei. Eine kurze Notiz landet im Verlauf
                    {existing?.interestId ? ' des Interessenten' : ' dieses Termins'} und geht
                    nicht mehr verloren.
                  </p>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="primary"
                    onClick={() => setFollowUpOpen(true)}
                  >
                    Notiz schreiben
                  </Button>
                </Callout>
              </Section>
            )}

            {/* --- Absagen und Löschen ---------------------------- */}
            {existing && (
              <Section title="Termin beenden">
                <Stack gap="sm">
                  <Button
                    block
                    variant="secondary"
                    icon={cancelled ? 'refresh' : 'x'}
                    onClick={() => void toggleCancelled()}
                  >
                    {cancelled ? 'Absage zurücknehmen' : 'Termin absagen'}
                  </Button>
                  <Button block variant="danger" icon="trash" onClick={() => void deleteAppointment()}>
                    Termin löschen
                  </Button>
                  <p className="px-1 text-[0.82rem] leading-relaxed text-text-faint">
                    Absagen ist der schonende Weg: Der Termin bleibt im Kalender stehen, bekommt
                    aber keine Erinnerung mehr. Löschen ist endgültig.
                  </p>
                </Stack>
              </Section>
            )}

            {existing?.followUpDone && (
              <div className="px-1">
                <Badge tone="ok" icon="check">
                  Nachbereitet
                </Badge>
              </div>
            )}
          </>
        )}
      </Stack>

      <NotifySheet
        open={notifyOpen}
        onClose={() => {
          setNotifyOpen(false);
          refreshNotify();
        }}
      />

      <FollowUpSheet
        appointment={followUpOpen && existing ? existing : null}
        interestName={
          existing?.interestId
            ? form.interests.find((i) => i.id === existing.interestId)?.name
            : undefined
        }
        onClose={() => setFollowUpOpen(false)}
      />
    </Screen>
  );
}
