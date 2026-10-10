/**
 * Alle Messungen eines Kittens — mit Korrigieren und Löschen.
 *
 * Wird vom Wiege-Bildschirm und von der Kitten-Akte benutzt. Holt die Daten
 * selbst, damit aufrufende Bildschirme nichts nachladen müssen.
 */

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ID, ISODate, WeightEntry } from '../../types';
import { db } from '../../db/db';
import {
  Badge,
  Button,
  EmptyState,
  EventDateTimeField,
  List,
  ListRow,
  Sheet,
  Spinner,
  TextInput,
  NumberInput,
  useConfirm,
  useToast,
} from '../../ui';
import {
  dateOf,
  formatDateTime,
  fromLocalInputValue,
  toLocalInputValue,
  nowISO,
} from '../../lib/date';
import { formatGainG, formatGainPerDay, formatGrams } from '../../lib/format';
import { dayOfLife, deltaToPrevious, parseGrams } from './weighing';
import { deleteWeight, updateWeight } from './store';

export interface WeightHistoryProps {
  kittenId: ID;
  /** Für die Angabe „Tag 12" je Messung. */
  birthDate?: ISODate;
  /** Nur die jüngsten n Messungen zeigen. */
  limit?: number;
  /** Bearbeiten und Löschen erlauben. */
  editable?: boolean;
}

export function WeightHistory({ kittenId, birthDate, limit, editable = true }: WeightHistoryProps) {
  const entries = useLiveQuery(
    () => db.weights.where('kittenId').equals(kittenId).toArray(),
    [kittenId],
  );
  const [editing, setEditing] = useState<WeightEntry | null>(null);

  const rows = useMemo(() => {
    if (!entries) return undefined;
    // Stabil sortiert: bei exakt gleichem Zeitstempel entscheidet die
    // Reihenfolge der Anlage — so hat auch die zweite Messung eine Vorgängerin.
    const ascending = [...entries].sort((a, b) => a.at.localeCompare(b.at));
    const withDelta = ascending.map((e, i) => ({
      entry: e,
      delta: deltaToPrevious(ascending.slice(0, i), e.at, e.grams),
    }));
    const newestFirst = withDelta.reverse();
    return limit ? newestFirst.slice(0, limit) : newestFirst;
  }, [entries, limit]);

  if (!rows) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-text-dim">
        <Spinner />
        <span className="text-sm">Wiegungen werden geladen …</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="scale"
        title="Noch keine Wiegung"
        description="Für dieses Kitten ist bisher kein Gewicht erfasst."
      />
    );
  }

  return (
    <>
      <List>
        {rows.map(({ entry, delta }) => {
          const day = dayOfLife(birthDate, dateOf(entry.at));
          const parts = [formatDateTime(entry.at)];
          if (day != null) parts.push(day >= 0 ? `Tag ${day}` : 'vor der Geburt');
          // Bei Lücken (F23) sagt der reine Unterschied wenig — erst die
          // Hochrechnung auf den Tag macht ihn vergleichbar.
          if (delta?.perDay != null && delta.hours >= 36) {
            parts.push(`≈ ${formatGainPerDay(delta.perDay)}`);
          }
          if (entry.note) parts.push(entry.note);
          return (
            <ListRow
              key={entry.id}
              title={formatGrams(entry.grams)}
              subtitle={parts.join(' · ')}
              trailing={
                delta ? (
                  <span className={deltaClass(delta.grams)}>{formatGainG(delta.grams)}</span>
                ) : (
                  <span className="text-text-faint">erste</span>
                )
              }
              onClick={editable ? () => setEditing(entry) : undefined}
              chevron={false}
            />
          );
        })}
      </List>

      {editable && (
        <EditWeightSheet entry={editing} onClose={() => setEditing(null)} birthDate={birthDate} />
      )}
    </>
  );
}

function deltaClass(grams: number): string {
  if (grams > 0) return 'text-ok tabular';
  if (grams < 0) return 'text-alert tabular';
  return 'text-text-dim tabular';
}

/* ------------------------------------------------------------------ */
/*  Blatt zum Korrigieren                                              */
/* ------------------------------------------------------------------ */

export function EditWeightSheet({
  entry,
  onClose,
  birthDate,
}: {
  entry: WeightEntry | null;
  onClose: () => void;
  birthDate?: ISODate;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [grams, setGrams] = useState<number | null>(null);
  const [at, setAt] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [loadedId, setLoadedId] = useState<ID | null>(null);

  // Werte übernehmen, sobald ein anderer Eintrag geöffnet wird.
  if (entry && entry.id !== loadedId) {
    setLoadedId(entry.id);
    setGrams(entry.grams);
    setAt(toLocalInputValue(entry.at));
    setNote(entry.note ?? '');
  }
  if (!entry && loadedId !== null) setLoadedId(null);

  async function save() {
    if (!entry) return;
    const parsed = parseGrams(grams == null ? '' : String(grams));
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    if (!at) {
      toast.error('Bitte einen Zeitpunkt angeben.');
      return;
    }
    try {
      await updateWeight(entry.id, {
        grams: parsed.grams,
        at: fromLocalInputValue(at),
        note: note.trim() || undefined,
      });
      toast.success('Messung geändert.');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Die Änderung konnte nicht gespeichert werden.');
    }
  }

  async function del() {
    if (!entry) return;
    const ok = await confirm({
      title: 'Messung löschen?',
      message: `${formatGrams(entry.grams)} vom ${formatDateTime(entry.at)} wird entfernt.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteWeight(entry.id);
      toast.show('Messung gelöscht.', { tone: 'neutral', icon: 'trash' });
      onClose();
    } catch {
      toast.error('Die Messung konnte nicht gelöscht werden.');
    }
  }

  const day = entry ? dayOfLife(birthDate, dateOf(entry.at)) : undefined;

  return (
    <Sheet
      open={Boolean(entry)}
      onClose={onClose}
      title="Messung ändern"
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" block icon="check" onClick={save}>
            Speichern
          </Button>
          <Button variant="ghost" size="md" block icon="trash" onClick={del}>
            Messung löschen
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {day != null && (
          <Badge tone="neutral">
            {day >= 0 ? `Tag ${day}` : 'Vor der Geburt'} · {formatDateTime(entry?.at)}
          </Badge>
        )}
        <NumberInput
          label="Gewicht"
          suffix="g"
          value={grams}
          onValueChange={setGrams}
          inputMode="numeric"
          autoComplete="off"
        />
        <EventDateTimeField
          label="Zeitpunkt"
          value={at}
          min={birthDate ? `${birthDate}T00:00` : undefined}
          max={toLocalInputValue(nowISO())}
          onChange={setAt}
        />
        <TextInput
          label="Notiz"
          placeholder="optional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
