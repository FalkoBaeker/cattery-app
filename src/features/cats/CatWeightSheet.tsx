import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Callout,
  NumberInput,
  Sheet,
  Spinner,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { db, insertPlain, patchPlain, remove } from '../../db/db';
import type { ID } from '../../types';
import { fromLocalInputValue, nowISO, toLocalInputValue } from '../../lib/date';

export interface CatWeightSheetProps {
  open: boolean;
  onClose: () => void;
  catId: ID;
  /** Gesetzt = vorhandene Wiegung ändern. */
  entryId?: ID;
  /** Vorschlag für das Gewicht, meist der letzte Wert. */
  defaultGrams?: number;
}

/**
 * Gewicht eines erwachsenen Tieres — in erster Linie die Königin während der
 * Trächtigkeit (F31). Nach der Geburt wird nicht mehr gewogen (F19); das ist
 * so gewollt und kein Fehler.
 */
export function CatWeightSheet({
  open,
  onClose,
  catId,
  entryId,
  defaultGrams,
}: CatWeightSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const entry = useLiveQuery(
    async () => (entryId ? ((await db.catWeights.get(entryId)) ?? null) : null),
    [entryId],
  );

  const [at, setAt] = useState('');
  const [grams, setGrams] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
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
        setAt(toLocalInputValue(entry.at));
        setGrams(entry.grams);
        setNote(entry.note ?? '');
        setError(undefined);
        setLoadedFor(sessionKey);
      }
      return;
    }
    setAt(toLocalInputValue(nowISO()));
    setGrams(defaultGrams ?? null);
    setNote('');
    setError(undefined);
    setLoadedFor(sessionKey);
  }, [open, sessionKey, loadedFor, entryId, entry, defaultGrams]);

  const loading = Boolean(entryId) && entry === undefined;

  async function save() {
    if (grams == null || !Number.isFinite(grams) || grams <= 0) {
      setError('Bitte ein Gewicht in Gramm eintragen.');
      return;
    }
    let iso: string;
    try {
      iso = at ? fromLocalInputValue(at) : nowISO();
      if (Number.isNaN(new Date(iso).getTime())) throw new Error('ungültig');
    } catch {
      setError('Zeitpunkt ist ungültig.');
      return;
    }

    setBusy(true);
    try {
      const data = { catId, at: iso, grams: Math.round(grams), note: note.trim() || undefined };
      if (entryId) await patchPlain(db.catWeights, entryId, data);
      else await insertPlain(db.catWeights, data);
      toast.success('Gewicht gespeichert.');
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
      title: 'Wiegung löschen?',
      message: 'Der Wert verschwindet aus dem Verlauf.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await remove(db.catWeights, entryId);
      toast.success('Wiegung gelöscht.');
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
      title={entryId ? 'Wiegung bearbeiten' : 'Gewicht eintragen'}
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
          <NumberInput
            label="Gewicht"
            required
            suffix="g"
            value={grams}
            error={error}
            /* Kein autoFocus: die Fokusfalle des Sheets setzt den Fokus selbst,
               das Attribut verpufft hier wirkungslos. */
            onValueChange={(v) => {
              setGrams(v);
              if (error) setError(undefined);
            }}
          />
          <TextInput
            label="Zeitpunkt"
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
          <TextArea
            label="Notiz"
            rows={2}
            value={note}
            placeholder="z. B. vor dem Ultraschall"
            onChange={(e) => setNote(e.target.value)}
          />

          {!entryId && (
            <Callout tone="neutral" icon="info">
              Während der Trächtigkeit wiegen wir die Königin. Nach der Geburt nicht mehr — das
              ist so gewollt.
            </Callout>
          )}

          {entryId && (
            <div className="pt-1">
              <Button
                block
                variant="ghost"
                icon="trash"
                className="text-alert"
                onClick={() => void onDelete()}
                disabled={busy}
              >
                Wiegung löschen
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
