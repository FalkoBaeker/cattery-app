/**
 * Interessent — Bildschirm /warteliste/:interestId.
 *
 * Herzstück ist der Kontaktverlauf: „Dass Notizen untergehen" ist das
 * Problem, „fortlaufende Dokumentation" die Lösung (F6/F7). Deshalb steht
 * die Schnellerfassung weit oben und braucht genau zwei Handgriffe.
 *
 * Ausdrücklich **kein** Bewertungs-Widget, keine Sterne, keine
 * Stimmungs-Kennzeichen (F70) — stattdessen ein großzügiges freies Notizfeld.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';

import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  Screen,
  Section,
  Segmented,
  Sheet,
  Stack,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
  type IconName,
} from '../../ui';
import {
  APPOINTMENT_KIND_LABEL,
  CONTACT_CHANNEL_LABEL,
  INTEREST_STATUS_LABEL,
  KITTEN_SALE_STATUS_LABEL,
  WISH_SEX_LABEL,
  collarColor,
  kittenLabel,
  type ContactChannel,
  type ID,
  type Interest,
  type InterestNote,
  type InterestStatus,
  type Kitten,
} from '../../types';
import { db } from '../../db/db';
import {
  dateOf,
  formatDate,
  formatDateTime,
  fromLocalInputValue,
  nowISO,
  toLocalInputValue,
} from '../../lib/date';
import { formatMoney } from '../../lib/format';
import { buildMailtoUrl, buildTelUrl, buildWhatsAppUrl, formatPurgeHint } from './order';
import {
  addContactNote,
  deleteContactNote,
  selectableKittens,
  setInterestStatus,
  setReservedKitten,
  updateContactNote,
  updateInterest,
} from './store';
import { CHANNEL_ICON, CHANNEL_ORDER, STATUS_CHAIN, openExternal } from './constants';
import { Chip, ChipRow, DataRow, LoadingList } from './shared';
import { InterestSheet } from './InterestSheet';

/* ================================================================== */
/*  Schnellaktionen                                                    */
/* ================================================================== */

function QuickAction({
  icon,
  label,
  available,
  onClick,
}: {
  icon: IconName;
  label: string;
  available: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] border p-2',
        available
          ? 'border-border bg-surface text-accent active:bg-surface-2'
          : 'border-dashed border-border bg-surface text-text-faint active:bg-surface-2',
      ].join(' ')}
    >
      <Icon name={icon} size={22} />
      <span className="text-[0.78rem] font-medium text-text-dim">{label}</span>
    </button>
  );
}

/* ================================================================== */
/*  Kontaktverlauf                                                     */
/* ================================================================== */

function ContactComposer({ interestId }: { interestId: ID }) {
  const toast = useToast();
  const [channel, setChannel] = useState<ContactChannel>('call');
  const [text, setText] = useState('');
  const [at, setAt] = useState<string>(() => nowISO());
  // Solange die Nutzerin den Zeitpunkt nicht selbst anfasst, gilt beim
  // Speichern „jetzt" — der beim Einhängen gemerkte Wert wäre nach einem
  // stundenlang offenen Bildschirm längst veraltet.
  const [atEdited, setAtEdited] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    const clean = text.trim();
    if (!clean) return;
    setSaving(true);
    try {
      await addContactNote(interestId, channel, clean, atEdited ? at : nowISO());
      setText('');
      setAt(nowISO());
      setAtEdited(false);
      setShowDate(false);
      toast.success('Im Verlauf festgehalten');
    } catch {
      toast.error('Der Eintrag ließ sich nicht speichern.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <ChipRow label="Kanal">
        {CHANNEL_ORDER.map((c) => (
          <Chip key={c} active={channel === c} icon={CHANNEL_ICON[c]} onClick={() => setChannel(c)}>
            {CONTACT_CHANNEL_LABEL[c]}
          </Chip>
        ))}
      </ChipRow>

      <TextArea
        aria-label="Was wurde besprochen?"
        rows={3}
        value={text}
        placeholder="Was wurde besprochen?"
        onChange={(e) => setText(e.target.value)}
      />

      {showDate ? (
        <TextInput
          label="Zeitpunkt"
          type="datetime-local"
          value={toLocalInputValue(at)}
          onChange={(e) => {
            if (e.target.value) {
              setAt(fromLocalInputValue(e.target.value));
              setAtEdited(true);
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            // Beim Aufklappen mit der aktuellen Zeit starten — nicht mit dem
            // Wert vom Einhängen des Bildschirms.
            if (!atEdited) setAt(nowISO());
            setShowDate(true);
          }}
          className="flex min-h-11 items-center gap-1.5 self-start px-1 text-[0.85rem] text-text-dim active:text-text"
        >
          <Icon name="clock" size={16} />
          {atEdited ? formatDateTime(at) : 'jetzt'}
          <span className="text-accent">ändern</span>
        </button>
      )}

      <Button variant="primary" block disabled={!text.trim()} loading={saving} onClick={save}>
        In den Verlauf eintragen
      </Button>
    </Card>
  );
}

function ContactNoteSheet({
  note,
  onClose,
}: {
  note: InterestNote | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [channel, setChannel] = useState<ContactChannel>('call');
  const [text, setText] = useState('');
  const [at, setAt] = useState(nowISO());

  useEffect(() => {
    if (note) {
      setChannel(note.channel);
      setText(note.text);
      setAt(note.at);
    }
  }, [note]);

  async function save() {
    if (!note) return;
    try {
      await updateContactNote(note.id, { channel, text: text.trim(), at });
    } catch {
      toast.error('Die Änderung ließ sich nicht speichern.');
      return;
    }
    toast.success('Gespeichert');
    onClose();
  }

  async function drop() {
    if (!note) return;
    const ok = await confirm({
      title: 'Eintrag löschen?',
      message: 'Dieser Verlaufseintrag verschwindet für immer.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteContactNote(note.id);
    } catch {
      toast.error('Der Eintrag ließ sich nicht löschen.');
      return;
    }
    toast.show('Eintrag gelöscht.');
    onClose();
  }

  return (
    <Sheet
      open={note !== null}
      onClose={onClose}
      tall
      title="Verlaufseintrag"
      action={
        <Button variant="ghost" size="sm" onClick={save} disabled={!text.trim()}>
          Sichern
        </Button>
      }
    >
      <Stack gap="md">
        <ChipRow label="Kanal">
          {CHANNEL_ORDER.map((c) => (
            <Chip
              key={c}
              active={channel === c}
              icon={CHANNEL_ICON[c]}
              onClick={() => setChannel(c)}
            >
              {CONTACT_CHANNEL_LABEL[c]}
            </Chip>
          ))}
        </ChipRow>
        <TextArea
          label="Text"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <TextInput
          label="Zeitpunkt"
          type="datetime-local"
          value={toLocalInputValue(at)}
          onChange={(e) => {
            if (e.target.value) setAt(fromLocalInputValue(e.target.value));
          }}
        />
        <Button variant="danger" block icon="trash" onClick={drop}>
          Eintrag löschen
        </Button>
      </Stack>
    </Sheet>
  );
}

function ContactHistory({
  notes,
  onEdit,
}: {
  notes: InterestNote[] | undefined;
  onEdit: (note: InterestNote) => void;
}) {
  if (notes === undefined) return <LoadingList rows={2} label="Verlauf wird geladen …" />;

  if (notes.length === 0) {
    return (
      <EmptyState
        icon="list"
        title="Noch nichts festgehalten"
        description="Hier sammelt sich, was ihr besprochen habt — Anrufe, Nachrichten, Besuche. Damit erübrigt sich das Nachlesen im WhatsApp-Verlauf."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {notes.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onEdit(n)}
          className="flex min-h-14 gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 text-left active:bg-surface-2"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-dim">
            <Icon name={CHANNEL_ICON[n.channel]} size={17} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-[0.78rem] text-text-faint">
              <span className="font-medium text-text-dim">{CONTACT_CHANNEL_LABEL[n.channel]}</span>
              <span>{formatDateTime(n.at)}</span>
            </span>
            <span className="selectable text-[0.92rem] leading-relaxed whitespace-pre-wrap text-text">
              {n.text}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Fragebogen                                                         */
/* ================================================================== */

type Tri = 'unknown' | 'yes' | 'no';

function toTri(value?: boolean): Tri {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown';
}
function fromTri(value: Tri): boolean | undefined {
  return value === 'yes' ? true : value === 'no' ? false : undefined;
}

function Question({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: boolean;
  onChange: (v: boolean | undefined) => void;
}) {
  return (
    <Segmented<Tri>
      label={label}
      value={toTri(value)}
      onChange={(v) => onChange(fromTri(v))}
      options={[
        { value: 'unknown', label: 'offen' },
        { value: 'yes', label: 'ja' },
        { value: 'no', label: 'nein' },
      ]}
    />
  );
}

/* ================================================================== */
/*  Kitten verknüpfen                                                  */
/* ================================================================== */

function KittenLinkSheet({
  open,
  onClose,
  interest,
}: {
  open: boolean;
  onClose: () => void;
  interest: Interest;
}) {
  const toast = useToast();
  const [kittens, setKittens] = useState<Kitten[] | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void selectableKittens(interest.kittenId).then((list) => {
      if (!cancelled) setKittens(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open, interest.kittenId]);

  async function choose(kittenId?: ID) {
    try {
      await setReservedKitten(interest, kittenId);
    } catch {
      toast.error('Die Verknüpfung ließ sich nicht speichern.');
      return;
    }
    toast.success(kittenId ? 'Kitten verknüpft' : 'Verknüpfung gelöst');
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Kitten verknüpfen">
      <Stack gap="md">
        <Callout tone="neutral" icon="info">
          Mit der Verknüpfung wird das Kitten auf „{KITTEN_SALE_STATUS_LABEL.reserved}" gesetzt. Der
          Schritt ist freiwillig — eine Reservierung geht auch ohne.
        </Callout>

        {kittens === undefined ? (
          <LoadingList rows={2} label="Kitten werden geladen …" />
        ) : kittens.length === 0 ? (
          <EmptyState
            icon="paw"
            title="Kein freies Kitten"
            description="Sobald ein Wurf da ist und Kitten als frei geführt werden, lassen sie sich hier verknüpfen."
          />
        ) : (
          <List>
            {kittens.map((k) => (
              <ListRow
                key={k.id}
                leading={
                  <span
                    aria-hidden="true"
                    className="inline-block size-3.5 rounded-full"
                    style={{ background: collarColor(k.collarColor).hex }}
                  />
                }
                title={kittenLabel(k)}
                subtitle={KITTEN_SALE_STATUS_LABEL[k.saleStatus]}
                trailing={k.id === interest.kittenId ? 'verknüpft' : undefined}
                onClick={() => void choose(k.id)}
              />
            ))}
          </List>
        )}

        {interest.kittenId && (
          <Button variant="quiet" block icon="x" onClick={() => void choose(undefined)}>
            Verknüpfung lösen
          </Button>
        )}
      </Stack>
    </Sheet>
  );
}

/* ================================================================== */
/*  Bildschirm                                                         */
/* ================================================================== */

export function InterestDetailScreen() {
  const { interestId } = useParams<{ interestId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const interest = useLiveQuery(
    async () => (interestId ? ((await db.interests.get(interestId)) ?? null) : null),
    [interestId],
  );
  const notes = useLiveQuery(
    async () =>
      interestId
        ? (await db.interestNotes.where('interestId').equals(interestId).sortBy('at')).reverse()
        : [],
    [interestId],
  );
  const appointments = useLiveQuery(
    async () =>
      interestId
        ? (await db.appointments.where('interestId').equals(interestId).toArray()).sort((a, b) =>
            b.startAt.localeCompare(a.startAt),
          )
        : [],
    [interestId],
  );
  const kitten = useLiveQuery(
    async () => (interest?.kittenId ? ((await db.kittens.get(interest.kittenId)) ?? null) : null),
    [interest?.kittenId],
  );

  const [editOpen, setEditOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [kittenOpen, setKittenOpen] = useState(false);
  const [editNote, setEditNote] = useState<InterestNote | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [householdDraft, setHouseholdDraft] = useState('');

  const telUrl = useMemo(() => buildTelUrl(interest?.phone), [interest?.phone]);
  const waUrl = useMemo(() => buildWhatsAppUrl(interest?.phone), [interest?.phone]);
  const mailUrl = useMemo(
    () => buildMailtoUrl(interest?.email, `Kitten aus unserer Zucht`),
    [interest?.email],
  );

  /* --- Ladezustand und Fehlerfall -------------------------------- */

  if (interest === undefined) {
    return (
      <Screen title="Interessent" back>
        <LoadingList rows={3} label="Eintrag wird geladen …" />
      </Screen>
    );
  }

  if (interest === null) {
    return (
      <Screen title="Interessent" back>
        <EmptyState
          icon="search"
          title="Eintrag nicht gefunden"
          description="Dieser Interessent wurde inzwischen endgültig gelöscht."
          action={
            <Button variant="primary" onClick={() => navigate('/warteliste')}>
              Zurück zur Warteliste
            </Button>
          }
        />
      </Screen>
    );
  }

  /* --- Aktionen --------------------------------------------------- */

  function missing(what: string) {
    toast.show(`${what} ist nicht hinterlegt.`, {
      tone: 'warn',
      icon: 'info',
      action: { label: 'Ergänzen', onClick: () => setEditOpen(true) },
    });
  }

  async function changeStatus(next: InterestStatus) {
    if (!interest) return;
    if (next === interest.status) return;

    if (next === 'declined') {
      const ok = await confirm({
        title: `${interest.name} absagen?`,
        message:
          'Der Eintrag wandert in den Papierkorb der Warteliste und wird dort nach 30 Tagen endgültig gelöscht. Bis dahin lässt er sich zurückholen.',
        confirmLabel: 'Absagen',
        danger: true,
      });
      if (!ok) return;
      try {
        await setInterestStatus(interest, next);
      } catch {
        toast.error('Der Status ließ sich nicht ändern.');
        return;
      }
      toast.show('In den Papierkorb verschoben.');
      navigate('/warteliste');
      return;
    }

    try {
      await setInterestStatus(interest, next);
    } catch {
      toast.error('Der Status ließ sich nicht ändern.');
      return;
    }
    if (next === 'reserved' && !interest.kittenId) setKittenOpen(true);
  }

  /** Liefert zurück, ob das Speichern geklappt hat — Blätter schließen nur dann. */
  async function patchInterest(changes: Partial<Interest>): Promise<boolean> {
    if (!interest) return false;
    try {
      await updateInterest(interest.id, changes);
      return true;
    } catch {
      toast.error('Die Änderung ließ sich nicht speichern.');
      return false;
    }
  }

  /* --- Anzeige ---------------------------------------------------- */

  const inTrash = Boolean(interest.deletedAt);

  return (
    <Screen
      title={interest.name}
      subtitle={`${INTEREST_STATUS_LABEL[interest.status]} · Wunsch: ${WISH_SEX_LABEL[interest.wishSex]}`}
      back
      actions={
        <IconButton icon="edit" label="Stammdaten bearbeiten" onClick={() => setEditOpen(true)} />
      }
    >
      <Stack gap="lg">
        {inTrash && interest.deletedAt && (
          <Callout tone="warn" icon="trash" title="Liegt im Papierkorb">
            {formatPurgeHint(interest.deletedAt)}. Zum Zurückholen den Papierkorb auf der
            Warteliste öffnen.
          </Callout>
        )}

        {/* --- Schnellaktionen --- */}
        <div className="grid grid-cols-4 gap-2">
          <QuickAction
            icon="phone"
            label="Anrufen"
            available={Boolean(telUrl)}
            onClick={() => (telUrl ? openExternal(telUrl) : missing('Eine Telefonnummer'))}
          />
          <QuickAction
            icon="whatsapp"
            label="WhatsApp"
            available={Boolean(waUrl)}
            onClick={() => (waUrl ? openExternal(waUrl) : missing('Eine Telefonnummer'))}
          />
          <QuickAction
            icon="mail"
            label="E-Mail"
            available={Boolean(mailUrl)}
            onClick={() => (mailUrl ? openExternal(mailUrl) : missing('Eine E-Mail-Adresse'))}
          />
          <QuickAction
            icon="edit"
            label="Notiz"
            available
            onClick={() => {
              document.getElementById('verlauf')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </div>

        {/* --- Status-Kette --- */}
        <Section title="Status">
          <ChipRow label="Status">
            {STATUS_CHAIN.map((s) => (
              <Chip
                key={s}
                active={interest.status === s}
                onClick={() => void changeStatus(s)}
              >
                {INTEREST_STATUS_LABEL[s]}
              </Chip>
            ))}
          </ChipRow>
          {interest.status === 'declined' ? (
            <Callout tone="alert" icon="x" title="Abgesagt">
              Der Status steht auf „Abgesagt". Mit einem der Schritte oben geht es weiter.
            </Callout>
          ) : (
            <Button variant="ghost" icon="x" onClick={() => void changeStatus('declined')}>
              Absagen
            </Button>
          )}
        </Section>

        {/* --- Kontaktverlauf --- */}
        <div id="verlauf">
          <Section
            title="Kontaktverlauf"
            description="Was besprochen wurde — chronologisch, neueste zuerst."
          >
            <Stack gap="md">
              <ContactComposer interestId={interest.id} />
              <ContactHistory notes={notes} onEdit={setEditNote} />
            </Stack>
          </Section>
        </div>

        {/* --- Freies Notizfeld --- */}
        <Section
          title="Notiz"
          action={
            <Button
              size="sm"
              variant="ghost"
              icon="edit"
              onClick={() => {
                setNoteDraft(interest.notes ?? '');
                setNotesOpen(true);
              }}
            >
              Bearbeiten
            </Button>
          }
        >
          <Card>
            {interest.notes?.trim() ? (
              <p className="selectable text-[0.93rem] leading-relaxed whitespace-pre-wrap text-text">
                {interest.notes}
              </p>
            ) : (
              <p className="text-[0.9rem] leading-relaxed text-text-faint">
                Platz für alles, was sonst nirgends hinpasst — Eindrücke, Absprachen, offene Fragen.
              </p>
            )}
          </Card>
        </Section>

        {/* --- Stammdaten --- */}
        <Section
          title="Stammdaten"
          action={
            <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditOpen(true)}>
              Bearbeiten
            </Button>
          }
        >
          <Card padded={false}>
            <div className="divide-y divide-border px-4">
              <DataRow label="Telefon" value={interest.phone} />
              <DataRow label="E-Mail" value={interest.email} />
              <DataRow label="Ort" value={interest.city} />
              <DataRow label="Quelle" value={interest.source} />
              <DataRow label="Wunschgeschlecht" value={WISH_SEX_LABEL[interest.wishSex]} />
              <DataRow label="Wunschzeitraum" value={interest.wishTimeframe} />
            </div>
          </Card>
        </Section>

        {/* --- Preis --- */}
        <Section title="Preis">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.85rem] text-text-dim">Angebotener / vereinbarter Betrag</p>
                <p className="mt-0.5 text-[1.35rem] font-semibold tabular text-text">
                  {interest.offeredPriceCents != null
                    ? formatMoney(interest.offeredPriceCents)
                    : 'noch offen'}
                </p>
              </div>
              <Button size="sm" icon="edit" onClick={() => setEditOpen(true)}>
                Ändern
              </Button>
            </div>
          </Card>
        </Section>

        {/* --- Fragebogen --- */}
        <Section title="Fragebogen" description="Alles freiwillig, alles darf offen bleiben.">
          <Card className="flex flex-col gap-4">
            <Question
              label="Allergiker im Haushalt"
              value={interest.allergySufferer}
              onChange={(v) => void patchInterest({ allergySufferer: v })}
            />
            <Question
              label="Andere Tiere"
              value={interest.hasOtherPets}
              onChange={(v) => void patchInterest({ hasOtherPets: v })}
            />
            <Question
              label="Kinder"
              value={interest.hasChildren}
              onChange={(v) => void patchInterest({ hasChildren: v })}
            />
            <Question
              label="Freigang geplant"
              value={interest.outdoorPlanned}
              onChange={(v) => void patchInterest({ outdoorPlanned: v })}
            />

            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <span className="px-1 text-[0.85rem] font-medium text-text-dim">
                Familiäre Besonderheiten
              </span>
              <button
                type="button"
                onClick={() => {
                  setHouseholdDraft(interest.householdNote ?? '');
                  setHouseholdOpen(true);
                }}
                className="min-h-11 rounded-[var(--radius-field)] border border-border bg-surface px-3.5 py-2.5 text-left active:bg-surface-2"
              >
                {interest.householdNote?.trim() ? (
                  <span className="text-[0.92rem] leading-relaxed whitespace-pre-wrap text-text">
                    {interest.householdNote}
                  </span>
                ) : (
                  <span className="text-[0.92rem] text-text-faint">
                    Zum Erfassen antippen
                  </span>
                )}
              </button>
            </div>
          </Card>
        </Section>

        {/* --- Kitten --- */}
        <Section
          title="Kitten"
          action={
            <Button size="sm" variant="ghost" icon="paw" onClick={() => setKittenOpen(true)}>
              {interest.kittenId ? 'Ändern' : 'Verknüpfen'}
            </Button>
          }
        >
          {kitten ? (
            <List>
              <ListRow
                leading={
                  <span
                    aria-hidden="true"
                    className="inline-block size-3.5 rounded-full"
                    style={{ background: collarColor(kitten.collarColor).hex }}
                  />
                }
                title={kittenLabel(kitten)}
                subtitle={KITTEN_SALE_STATUS_LABEL[kitten.saleStatus]}
                onClick={() => navigate(`/zucht/kitten/${kitten.id}`)}
              />
            </List>
          ) : (
            <Card>
              <p className="text-[0.9rem] leading-relaxed text-text-dim">
                Noch kein Kitten verknüpft. Beim Reservieren lässt sich eines zuordnen — dann wird
                auch dessen Verkaufsstatus mitgeführt.
              </p>
            </Card>
          )}
        </Section>

        {/* --- Termine --- */}
        <Section title="Termine" description="Nur zur Ansicht — geändert wird im Kalender.">
          {appointments === undefined ? (
            <LoadingList rows={1} label="Termine werden geladen …" />
          ) : appointments.length === 0 ? (
            <Card>
              <p className="text-[0.9rem] leading-relaxed text-text-dim">
                Für {interest.name} ist noch kein Termin eingetragen.
              </p>
            </Card>
          ) : (
            <List>
              {appointments.map((a) => (
                <ListRow
                  key={a.id}
                  leading={<Icon name="calendar" size={19} className="text-text-faint" />}
                  title={a.title?.trim() || APPOINTMENT_KIND_LABEL[a.kind]}
                  subtitle={formatDateTime(a.startAt)}
                  trailing={
                    a.cancelledAt ? (
                      <Badge tone="alert">abgesagt</Badge>
                    ) : a.doneAt ? (
                      <Badge tone="ok">erledigt</Badge>
                    ) : undefined
                  }
                  onClick={() => navigate(`/kalender/${a.id}`)}
                />
              ))}
            </List>
          )}
        </Section>

        <p className="px-1 pb-2 text-[0.78rem] text-text-faint">
          Angelegt am {formatDate(dateOf(interest.createdAt))} · zuletzt geändert am{' '}
          {formatDate(dateOf(interest.updatedAt))}
        </p>
      </Stack>

      {/* --- Blätter --- */}

      <InterestSheet open={editOpen} onClose={() => setEditOpen(false)} interest={interest} />

      <KittenLinkSheet
        open={kittenOpen}
        onClose={() => setKittenOpen(false)}
        interest={interest}
      />

      <ContactNoteSheet note={editNote} onClose={() => setEditNote(null)} />

      <Sheet
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        tall
        title="Notiz"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!(await patchInterest({ notes: noteDraft.trim() || undefined }))) return;
              setNotesOpen(false);
              toast.success('Gespeichert');
            }}
          >
            Sichern
          </Button>
        }
      >
        <TextArea
          aria-label="Notiz"
          rows={16}
          value={noteDraft}
          placeholder="Frei für alles: Eindrücke aus dem Gespräch, Absprachen, offene Fragen …"
          onChange={(e) => setNoteDraft(e.target.value)}
        />
      </Sheet>

      <Sheet
        open={householdOpen}
        onClose={() => setHouseholdOpen(false)}
        title="Familiäre Besonderheiten"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!(await patchInterest({ householdNote: householdDraft.trim() || undefined })))
                return;
              setHouseholdOpen(false);
              toast.success('Gespeichert');
            }}
          >
            Sichern
          </Button>
        }
      >
        <TextArea
          aria-label="Familiäre Besonderheiten"
          rows={8}
          value={householdDraft}
          placeholder="z. B. Homeoffice, kleine Kinder, andere Katze im Haushalt …"
          onChange={(e) => setHouseholdDraft(e.target.value)}
        />
      </Sheet>
    </Screen>
  );
}
