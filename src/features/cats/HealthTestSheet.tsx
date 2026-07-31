import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Callout,
  ChoiceGrid,
  NumberInput,
  Sheet,
  Spinner,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { db, insert, patch, remove } from '../../db/db';
import {
  HEALTH_TEST_DEFAULT_VALIDITY,
  HEALTH_TEST_LABEL,
  type HealthTestKind,
  type ID,
} from '../../types';
import { formatDate, todayISO } from '../../lib/date';
import { isValidISODate } from './heat';
import { computeNextDueDate } from './tests';

const KIND_OPTIONS = (Object.keys(HEALTH_TEST_LABEL) as HealthTestKind[]).map((value) => ({
  value,
  label: HEALTH_TEST_LABEL[value],
}));

/** Bei diesen Arten gibt es ein freies Bezeichnungsfeld. */
function needsLabel(kind: HealthTestKind): boolean {
  return kind === 'genetic' || kind === 'other';
}

export interface HealthTestSheetProps {
  open: boolean;
  onClose: () => void;
  catId: ID;
  /** Gesetzt = vorhandenen Test bearbeiten. */
  testId?: ID;
  /** Vorauswahl der Art beim Anlegen. */
  defaultKind?: HealthTestKind;
  defaultLabel?: string;
}

/**
 * Gesundheitstest erfassen. Die nächste Fälligkeit wird beim Speichern
 * mitgeschrieben (`nextDueDate`), damit andere Module sie ohne Nachrechnen
 * finden.
 */
export function HealthTestSheet({
  open,
  onClose,
  catId,
  testId,
  defaultKind = 'hcm',
  defaultLabel,
}: HealthTestSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const test = useLiveQuery(
    async () => (testId ? ((await db.healthTests.get(testId)) ?? null) : null),
    [testId],
  );

  const [kind, setKind] = useState<HealthTestKind>(defaultKind);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [result, setResult] = useState('');
  const [validMonths, setValidMonths] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [dateError, setDateError] = useState<string | undefined>();
  const [validityTouched, setValidityTouched] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sessionKey = open ? (testId ?? 'neu') : null;

  useEffect(() => {
    if (!open) {
      setLoadedFor(null);
      return;
    }
    if (loadedFor === sessionKey) return;
    if (testId) {
      if (test) {
        setKind(test.kind);
        setLabel(test.label ?? '');
        setDate(test.date ?? '');
        setResult(test.result ?? '');
        setValidMonths(test.validMonths ?? 0);
        setNotes(test.notes ?? '');
        setValidityTouched(true);
        setDateError(undefined);
        setLoadedFor(sessionKey);
      }
      return;
    }
    setKind(defaultKind);
    setLabel(defaultLabel ?? '');
    setDate(todayISO());
    setResult('');
    setValidMonths(HEALTH_TEST_DEFAULT_VALIDITY[defaultKind]);
    setNotes('');
    setValidityTouched(false);
    setDateError(undefined);
    setLoadedFor(sessionKey);
  }, [open, sessionKey, loadedFor, testId, test, defaultKind, defaultLabel]);

  const loading = Boolean(testId) && test === undefined;

  function chooseKind(next: HealthTestKind) {
    setKind(next);
    // Die übliche Gültigkeit nur übernehmen, solange sie nicht von Hand
    // geändert wurde — sonst überschreibt ein Tippen auf die Kachel die Eingabe.
    if (!validityTouched) setValidMonths(HEALTH_TEST_DEFAULT_VALIDITY[next]);
  }

  const nextDue = computeNextDueDate(date, validMonths);

  async function save() {
    if (!isValidISODate(date)) {
      setDateError('Bitte das Datum des Tests eintragen.');
      return;
    }
    const months = validMonths != null && validMonths > 0 ? Math.round(validMonths) : 0;
    const data = {
      catId,
      kind,
      label: needsLabel(kind) ? label.trim() || undefined : undefined,
      date,
      result: result.trim() || undefined,
      validMonths: months,
      nextDueDate: computeNextDueDate(date, months),
      notes: notes.trim() || undefined,
    };

    setBusy(true);
    try {
      if (testId) await patch(db.healthTests, testId, data);
      else await insert(db.healthTests, data);
      toast.success('Test gespeichert.');
      onClose();
    } catch {
      toast.error('Speichern fehlgeschlagen. Bitte noch einmal versuchen.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!testId) return;
    const ok = await confirm({
      title: 'Test löschen?',
      message: 'Das Ergebnis verschwindet aus dem Profil und dem Zeitstrahl.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await remove(db.healthTests, testId);
      toast.success('Test gelöscht.');
      onClose();
    } catch {
      toast.error('Löschen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={testId ? 'Test bearbeiten' : 'Test eintragen'}
      footer={
        <Button block size="lg" variant="primary" onClick={save} loading={busy} disabled={loading}>
          Speichern
        </Button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10 text-text-dim">
          <Spinner size={24} />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <ChoiceGrid
            label="Art"
            value={kind}
            onChange={chooseKind}
            options={KIND_OPTIONS}
            columns={2}
          />

          {needsLabel(kind) && (
            <TextInput
              label="Bezeichnung"
              value={label}
              placeholder={kind === 'genetic' ? 'z. B. PK-Def' : 'z. B. Blutbild'}
              onChange={(e) => setLabel(e.target.value)}
            />
          )}

          <TextInput
            label="Datum"
            required
            type="date"
            value={date}
            error={dateError}
            onChange={(e) => {
              setDate(e.target.value);
              if (dateError) setDateError(undefined);
            }}
          />

          <TextInput
            label="Ergebnis"
            value={result}
            placeholder="z. B. ohne Befund"
            onChange={(e) => setResult(e.target.value)}
          />

          <NumberInput
            label="Gültigkeit"
            suffix="Monate"
            value={validMonths}
            hint="0 lassen, wenn das Ergebnis unbefristet gilt (z. B. Gentest)."
            onValueChange={(v) => {
              setValidityTouched(true);
              setValidMonths(v);
            }}
          />

          <Callout tone={nextDue ? 'accent' : 'neutral'} icon="calendar" title="Nächste Fälligkeit">
            {nextDue
              ? formatDate(nextDue)
              : 'Unbefristet — es wird keine Wiederholung fällig.'}
          </Callout>

          <TextArea
            label="Notizen"
            rows={3}
            value={notes}
            placeholder="Tierarzt, Befundnummer, Besonderheiten"
            onChange={(e) => setNotes(e.target.value)}
          />

          {testId && (
            <div className="pt-1">
              <Button
                block
                variant="ghost"
                icon="trash"
                className="text-alert"
                onClick={() => void onDelete()}
                disabled={busy}
              >
                Test löschen
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
