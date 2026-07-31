/** Kalenderbasierter Nachtragsbereich für genau ein Kitten. */

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router';
import type { ISODate, WeightEntry } from '../../types';
import { collarColor, kittenLabel } from '../../types';
import { db } from '../../db/db';
import {
  addDays,
  addMonths,
  dateOf,
  formatDateWithWeekday,
  formatMonthYear,
  formatTime,
  todayISO,
} from '../../lib/date';
import { formatGrams } from '../../lib/format';
import {
  Badge,
  Button,
  Callout,
  Card,
  ColorDot,
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  NumberInput,
  Screen,
  Spinner,
  Stack,
  TextInput,
  useToast,
} from '../../ui';
import { addWeight } from './store';
import { parseGrams } from './weighing';
import { EditWeightSheet } from './WeightHistory';
import { entriesOnDate, localDateTime, monthCells, monthStart, suggestedTime } from './backfill';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function WeightBackfillScreen() {
  const { kittenId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const today = todayISO();

  const data = useLiveQuery(async () => {
    if (!kittenId) return { kind: 'missing' as const };
    const kitten = await db.kittens.get(kittenId);
    if (!kitten) return { kind: 'missing' as const };
    const [litter, weights] = await Promise.all([
      db.litters.get(kitten.litterId),
      db.weights.where('kittenId').equals(kitten.id).toArray(),
    ]);
    return { kind: 'ok' as const, kitten, litter, weights };
  }, [kittenId]);

  const [selectedDate, setSelectedDate] = useState<ISODate>(today);
  const [visibleMonth, setVisibleMonth] = useState<ISODate>(monthStart(today));
  const [time, setTime] = useState('08:00');
  const [grams, setGrams] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<WeightEntry | null>(null);

  const weights = useMemo(() => (data?.kind === 'ok' ? data.weights : []), [data]);
  const selectedEntries = useMemo(
    () => entriesOnDate(weights, selectedDate),
    [weights, selectedDate],
  );
  const countsByDate = useMemo(() => {
    const counts = new Map<ISODate, number>();
    for (const entry of weights) {
      const date = dateOf(entry.at);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return counts;
  }, [weights]);

  useEffect(() => {
    const suggestion = suggestedTime(selectedEntries);
    const suggestedAt = localDateTime(selectedDate, suggestion);
    if (selectedDate === today && suggestedAt && suggestedAt > new Date().toISOString()) {
      const now = new Date();
      setTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      );
    } else {
      setTime(suggestion);
    }
    setGrams(null);
  }, [selectedDate, selectedEntries, today]);

  function selectDate(date: ISODate) {
    setSelectedDate(date);
    setVisibleMonth(monthStart(date));
  }

  async function save() {
    if (!data || data.kind !== 'ok') return;
    const parsed = parseGrams(grams == null ? '' : String(grams));
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const at = localDateTime(selectedDate, time);
    if (!at) {
      toast.error('Bitte eine gültige Uhrzeit eingeben.');
      return;
    }
    if (at > new Date().toISOString()) {
      toast.error('Eine Wiegung kann nicht in der Zukunft liegen.');
      return;
    }
    const entered = new Date(at);
    if (
      selectedEntries.some((entry) => {
        const existing = new Date(entry.at);
        return (
          existing.getHours() === entered.getHours() &&
          existing.getMinutes() === entered.getMinutes()
        );
      })
    ) {
      toast.error('Für diese Uhrzeit gibt es schon eine Messung. Du kannst sie oben ändern.');
      return;
    }

    setSaving(true);
    try {
      await addWeight(data.kitten.id, parsed.grams, at);
      setGrams(null);
      toast.success(`${formatGrams(parsed.grams)} am ${formatDateWithWeekday(selectedDate)} gespeichert.`);
    } catch {
      toast.error('Das Gewicht konnte nicht gespeichert werden. Die Eingabe bleibt erhalten.');
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <Screen title="Gewicht nachtragen" back>
        <div className="flex items-center justify-center gap-2 py-16 text-text-dim">
          <Spinner />
          <span className="text-sm">Kitten wird geladen …</span>
        </div>
      </Screen>
    );
  }

  if (data.kind === 'missing') {
    return (
      <Screen title="Gewicht nachtragen" back>
        <EmptyState
          icon="paw"
          title="Kitten nicht gefunden"
          description="Das Kitten wurde vermutlich gelöscht. Öffne den Wurf noch einmal."
          action={<Button onClick={() => navigate('/zucht')}>Zur Zucht</Button>}
        />
      </Screen>
    );
  }

  const { kitten, litter } = data;
  const birthDate = kitten.bornAt ? dateOf(kitten.bornAt) : litter?.birthDate;
  const cells = monthCells(visibleMonth);
  const collar = collarColor(kitten.collarColor);
  const canGoForward = monthStart(visibleMonth) < monthStart(today);
  const canGoBackward = !birthDate || monthStart(visibleMonth) > monthStart(birthDate);

  return (
    <Screen
      title="Gewicht nachtragen"
      subtitle={kittenLabel(kitten)}
      back
      actions={
        litter ? (
          <IconButton
            icon="scale"
            label="Aktuellen Wurf wiegen"
            onClick={() => navigate(`/wiegen/${litter.id}`)}
          />
        ) : undefined
      }
    >
      <Stack gap="md">
        <Callout tone="neutral" icon="calendar" title="Vergangene Messung eintragen">
          Wähle den Tag, stelle die echte Uhrzeit ein und speichere das Gewicht. Für die aktuelle
          Wiegerunde bleibt der schnelle Wurf-Bildschirm zuständig.
        </Callout>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <IconButton
              icon="chevron-left"
              label="Vorheriger Monat"
              disabled={!canGoBackward}
              onClick={() => setVisibleMonth(monthStart(addMonths(visibleMonth, -1)))}
            />
            <p className="text-center text-[1rem] font-semibold text-text capitalize">
              {formatMonthYear(visibleMonth)}
            </p>
            <IconButton
              icon="chevron-right"
              label="Nächster Monat"
              disabled={!canGoForward}
              onClick={() => setVisibleMonth(monthStart(addMonths(visibleMonth, 1)))}
            />
          </div>

          <div className="grid grid-cols-7 gap-1" aria-label="Kalender">
            {WEEKDAYS.map((weekday) => (
              <span
                key={weekday}
                className="pb-1 text-center text-[0.72rem] font-semibold text-text-faint"
              >
                {weekday}
              </span>
            ))}
            {cells.map((date, index) => {
              if (!date) return <span key={`blank-${index}`} aria-hidden="true" />;
              const count = countsByDate.get(date) ?? 0;
              const unavailable = date > today || Boolean(birthDate && date < birthDate);
              const selected = date === selectedDate;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={unavailable}
                  aria-label={`${formatDateWithWeekday(date)}${count ? `, ${count} ${count === 1 ? 'Messung' : 'Messungen'}` : ''}`}
                  aria-pressed={selected}
                  onClick={() => selectDate(date)}
                  className={[
                    'relative flex aspect-square min-h-10 items-center justify-center rounded-xl border text-[0.88rem] font-medium tabular',
                    'disabled:border-transparent disabled:text-text-faint/40',
                    selected
                      ? 'border-accent bg-accent text-on-accent'
                      : date === today
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-transparent text-text active:bg-surface-2',
                  ].join(' ')}
                >
                  {Number(date.slice(-2))}
                  {count > 0 && (
                    <span
                      className={[
                        'absolute bottom-1 size-1.5 rounded-full',
                        selected ? 'bg-on-accent' : 'bg-ok',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            {birthDate && (
              <Button size="sm" variant="ghost" icon="paw" onClick={() => selectDate(birthDate)}>
                Geburtstag
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon="calendar"
              className={birthDate ? '' : 'col-span-2'}
              onClick={() => selectDate(today)}
            >
              Heute
            </Button>
          </div>
        </Card>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
                {formatDateWithWeekday(selectedDate)}
              </h2>
              <p className="mt-0.5 text-sm text-text-faint">
                {selectedEntries.length === 0
                  ? 'Noch keine Messung an diesem Tag'
                  : selectedEntries.length === 1
                    ? 'Eine Messung vorhanden'
                    : `${selectedEntries.length} Messungen vorhanden`}
              </p>
            </div>
            <ColorDot hex={collar.hex} size={18} />
          </div>

          {selectedEntries.length > 0 && (
            <List>
              {selectedEntries.map((entry) => (
                <ListRow
                  key={entry.id}
                  leading={<Icon name="clock" size={19} className="text-text-dim" />}
                  title={`${formatTime(entry.at)} Uhr`}
                  subtitle="Antippen zum Ändern oder Löschen"
                  trailing={<span className="font-semibold tabular text-text">{formatGrams(entry.grams)}</span>}
                  onClick={() => setEditing(entry)}
                />
              ))}
            </List>
          )}

          <Card className="mt-1">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-text">Messung hinzufügen</p>
                <p className="text-[0.82rem] text-text-dim">Zeit und Gewicht gehören zusammen.</p>
              </div>
              <Badge tone="neutral">{kittenLabel(kitten)}</Badge>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-2">
              <TextInput
                label="Uhrzeit"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
              <NumberInput
                label="Gewicht"
                suffix="g"
                value={grams}
                onValueChange={setGrams}
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                aria-label="Gewicht in Gramm"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void save();
                  }
                }}
              />
            </div>
            <Button
              className="mt-3"
              variant="primary"
              size="lg"
              block
              icon="check"
              loading={saving}
              onClick={() => void save()}
            >
              Gewicht speichern
            </Button>
          </Card>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Button
            icon="chevron-left"
            onClick={() => selectDate(addDays(selectedDate, -1))}
            disabled={Boolean(birthDate && selectedDate <= birthDate)}
          >
            Vortag
          </Button>
          <Button
            iconRight="chevron-right"
            onClick={() => selectDate(addDays(selectedDate, 1))}
            disabled={selectedDate >= today}
          >
            Nächster Tag
          </Button>
        </div>
      </Stack>

      <EditWeightSheet
        entry={editing}
        onClose={() => setEditing(null)}
        birthDate={birthDate}
      />
    </Screen>
  );
}
