import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Callout,
  Sheet,
  Spinner,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { db, insert, patch, remove } from '../../db/db';
import type { ID } from '../../types';
import { dateOf, daysBetween, formatDate, todayISO } from '../../lib/date';
import { isValidISODate } from './heat';

export interface HeatSheetProps {
  open: boolean;
  onClose: () => void;
  catId: ID;
  /** Gesetzt = vorhandenen Eintrag bearbeiten. */
  entryId?: ID;
}

/**
 * Eine Rolligkeit erfassen. Pflicht ist allein der Beginn — das Ende trägt
 * sie oft erst Tage später nach, und manchmal gar nicht.
 */
export function HeatSheet({ open, onClose, catId, entryId }: HeatSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const entry = useLiveQuery(
    async () => (entryId ? ((await db.heatCycles.get(entryId)) ?? null) : null),
    [entryId],
  );

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  // Getrennt, damit die Meldung an dem Feld hängt, das sie meint.
  const [startError, setStartError] = useState<string | undefined>();
  const [endError, setEndError] = useState<string | undefined>();
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sessionKey = open ? (entryId ?? 'neu') : null;

  useEffect(() => {
    if (!open) {
      setLoadedFor(null);
      return;
    }
    if (loadedFor === sessionKey) return;
    if (entryId) {
      if (entry) {
        setStartDate(entry.startDate);
        setEndDate(entry.endDate ?? '');
        setNotes(entry.notes ?? '');
        setStartError(undefined);
        setEndError(undefined);
        setLoadedFor(sessionKey);
      }
      return;
    }
    setStartDate(todayISO());
    setEndDate('');
    setNotes('');
    setStartError(undefined);
    setEndError(undefined);
    setLoadedFor(sessionKey);
  }, [open, sessionKey, loadedFor, entryId, entry]);

  const loading = Boolean(entryId) && entry === undefined;

  async function save() {
    // Jede Meldung hängt an dem Feld, das sie meint — sonst zeigt der
    // Screenreader auf die falsche Eingabe.
    if (!isValidISODate(startDate)) {
      setStartError('Bitte den Beginn eintragen.');
      return;
    }
    if (endDate && !isValidISODate(endDate)) {
      setEndError('Das Ende ist kein gültiges Datum.');
      return;
    }
    if (endDate && daysBetween(startDate, endDate) < 0) {
      setEndError('Das Ende liegt vor dem Beginn.');
      return;
    }

    const data = {
      catId,
      startDate,
      endDate: endDate || undefined,
      notes: notes.trim() || undefined,
    };

    setBusy(true);
    try {
      if (entryId) await patch(db.heatCycles, entryId, data);
      else await insert(db.heatCycles, data);
      toast.success('Rolligkeit gespeichert.');
      onClose();
    } catch {
      toast.error('Speichern fehlgeschlagen. Bitte noch einmal versuchen.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!entryId) return;
    const ok = await confirm({
      title: 'Eintrag löschen?',
      message: 'Die Rolligkeit verschwindet aus der Auswertung und dem Zeitstrahl.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await remove(db.heatCycles, entryId);
      toast.success('Eintrag gelöscht.');
      onClose();
    } catch {
      toast.error('Löschen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  const duration =
    isValidISODate(startDate) && isValidISODate(endDate) && daysBetween(startDate, endDate) >= 0
      ? daysBetween(startDate, endDate) + 1
      : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={entryId ? 'Rolligkeit bearbeiten' : 'Rolligkeit eintragen'}
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
          <TextInput
            label="Beginn"
            required
            type="date"
            value={startDate}
            error={startError}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (startError) setStartError(undefined);
              // Der Beginn kann die Ende-Meldung entkräften.
              if (endError) setEndError(undefined);
            }}
          />
          <TextInput
            label="Ende"
            type="date"
            value={endDate}
            error={endError}
            hint={
              duration
                ? `Dauer: ${duration} ${duration === 1 ? 'Tag' : 'Tage'}`
                : 'Darf offen bleiben und später nachgetragen werden.'
            }
            onChange={(e) => {
              setEndDate(e.target.value);
              if (endError) setEndError(undefined);
            }}
          />
          <TextArea
            label="Notiz"
            rows={3}
            value={notes}
            placeholder="z. B. sehr laut, kaum gefressen"
            onChange={(e) => setNotes(e.target.value)}
          />

          {!entryId && (
            <Callout tone="neutral" icon="info">
              Ab der dritten Rolligkeit schätzt die App den nächsten Termin. Vorher wäre jede
              Zahl geraten.
            </Callout>
          )}

          {entryId && entry && (
            <div className="pt-1">
              <p className="px-1 pb-2 text-[0.8rem] text-text-faint">
                Eingetragen am {formatDate(dateOf(entry.createdAt))}
              </p>
              <Button
                block
                variant="ghost"
                icon="trash"
                className="text-alert"
                onClick={() => void onDelete()}
                disabled={busy}
              >
                Eintrag löschen
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
