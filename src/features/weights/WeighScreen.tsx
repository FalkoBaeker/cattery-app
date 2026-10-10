/**
 * Schnellerfassung der Kittengewichte — der meistbenutzte Bildschirm der App.
 *
 * In Woche 1–2 wird zweimal täglich gewogen, mit einem Kitten in der Hand.
 * Eine Zeile je Kitten, ein gemeinsamer Zeitpunkt und ein atomar gespeicherter
 * Durchgang. Enter springt weiter, bestehende Messungen bleiben korrigierbar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ID, Kitten, WeightEntry } from '../../types';
import { COLLAR_COLORS, DEFAULT_SETTINGS, collarColor, kittenLabel } from '../../types';
import { db } from '../../db/db';
import {
  Badge,
  Button,
  Callout,
  Card,
  ColorDot,
  EmptyState,
  EventDateField,
  Icon,
  IconButton,
  List,
  NumberInput,
  Screen,
  Sheet,
  Spinner,
  Stack,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import {
  dateOf,
  daysBetween,
  formatRelativeDay,
  formatTime,
  nowISO,
  todayISO,
} from '../../lib/date';
import { formatGainG, formatGainPerDay, formatGrams, formatPercent } from '../../lib/format';
import {
  dailyWeightMeasurementTarget,
  WEIGHT_LEVEL_TONE,
  type WeightLevel,
} from '../../domain/weight';
import {
  analyzeKitten,
  dayOfLifeLabel,
  dayProgress,
  latestDelta,
  measurementsOn,
  nextFocusId,
  parseGrams,
} from './weighing';
import type { WeightSample } from './chart';
import { addWeightRound, deleteWeight } from './store';
import { entriesOnDate, localDateTime, suggestedTime } from './backfill';
import { WeightChart } from './WeightChart';
import { EditWeightSheet, WeightHistory } from './WeightHistory';
import { WeightBadge } from './WeightBadge';

/* ------------------------------------------------------------------ */
/*  Hilfen                                                             */
/* ------------------------------------------------------------------ */

const TONE_TEXT: Record<'ok' | 'warn' | 'alert' | 'neutral', string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  alert: 'text-alert',
  neutral: 'text-text-dim',
};

function levelTextClass(level: WeightLevel): string {
  return TONE_TEXT[WEIGHT_LEVEL_TONE[level]];
}

const COLLAR_ORDER = new Map(COLLAR_COLORS.map((c, i) => [c.key, i]));

/** Reihenfolge der Zeilen: nach Geburtszeit, sonst nach Halsbandfarbe. */
function sortKittens(list: Kitten[]): Kitten[] {
  return [...list].sort((a, b) => {
    if (a.bornAt && b.bornAt) return a.bornAt.localeCompare(b.bornAt);
    if (a.bornAt) return -1;
    if (b.bornAt) return 1;
    const oa = COLLAR_ORDER.get(a.collarColor) ?? 99;
    const ob = COLLAR_ORDER.get(b.collarColor) ?? 99;
    if (oa !== ob) return oa - ob;
    return kittenLabel(a).localeCompare(kittenLabel(b), 'de');
  });
}

/** Lebende Kitten — totgeborene und verstorbene werden nicht gewogen. */
function isAlive(k: Kitten): boolean {
  return !k.stillborn && k.saleStatus !== 'deceased' && !k.diedAt;
}

function inputElement(kittenId: ID): HTMLInputElement | null {
  return document.getElementById(`weigh-${kittenId}`) as HTMLInputElement | null;
}

/* ------------------------------------------------------------------ */
/*  Bildschirm                                                         */
/* ------------------------------------------------------------------ */

export function WeighScreen() {
  const { litterId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const data = useLiveQuery(async () => {
    if (!litterId) return { kind: 'missing' as const };
    const litter = await db.litters.get(litterId);
    if (!litter) return { kind: 'missing' as const };

    const [kittens, settings] = await Promise.all([
      db.kittens.where('litterId').equals(litterId).toArray(),
      db.settings.get('singleton'),
    ]);
    const ids = kittens.map((k) => k.id);
    const weights = ids.length
      ? await db.weights.where('kittenId').anyOf(ids).toArray()
      : ([] as WeightEntry[]);
    const mother = litter.motherId ? await db.cats.get(litter.motherId) : undefined;

    return {
      kind: 'ok' as const,
      litter,
      kittens,
      weights,
      mother,
      thresholds: { ...DEFAULT_SETTINGS.weight, ...settings?.weight },
    };
  }, [litterId]);

  /* --- Zustand --------------------------------------------------- */

  const [drafts, setDrafts] = useState<Record<ID, number | null>>({});
  const draftsRef = useRef<Record<ID, number | null>>({});
  const [lastSaved, setLastSaved] = useState<Record<ID, { entryId: ID; grams: number }>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [refDate, setRefDate] = useState(todayISO);
  const [time, setTime] = useState('');
  const [saveError, setSaveError] = useState('');
  const [focusedId, setFocusedId] = useState<ID | null>(null);
  const [detailId, setDetailId] = useState<ID | null>(null);
  const [editEntryId, setEditEntryId] = useState<ID | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const today = todayISO();

  const dirtyCount = Object.values(drafts).filter((value) => value != null).length;

  /* --- Aufbereitete Daten ---------------------------------------- */

  const view = useMemo(() => {
    if (!data || data.kind !== 'ok') return null;
    const alive = sortKittens(data.kittens.filter((kitten) => isAlive(kitten) ||
      (!kitten.stillborn && refDate < today && (!kitten.diedAt || refDate <= kitten.diedAt)),
    ));
    const hidden = data.kittens.length - alive.length;

    const entriesByKitten = new Map<ID, WeightEntry[]>();
    for (const k of data.kittens) entriesByKitten.set(k.id, []);
    for (const w of data.weights) {
      const list = entriesByKitten.get(w.kittenId);
      if (list) list.push(w);
    }
    for (const list of entriesByKitten.values()) list.sort((a, b) => a.at.localeCompare(b.at));

    const samplesByKitten = new Map<ID, WeightSample[]>(
      [...entriesByKitten].map(([id, list]) => [id, list.map((e) => ({ at: e.at, grams: e.grams }))]),
    );
    const selectedSamples = new Map(
      [...samplesByKitten].map(([id, list]) => [id, list.filter((entry) => dateOf(entry.at) <= refDate)]),
    );

    const order = alive.map((k) => k.id);
    const ageDays = data.litter.birthDate
      ? daysBetween(data.litter.birthDate, refDate)
      : undefined;
    const progress = dayProgress(
      order,
      samplesByKitten,
      refDate,
      dailyWeightMeasurementTarget(ageDays),
    );

    const series = alive.map((k) => ({
      kittenId: k.id,
      label: kittenLabel(k),
      hex: collarColor(k.collarColor).hex,
      entries: samplesByKitten.get(k.id) ?? [],
    }));

    const analyses = new Map(
      alive.map((k) => [
        k.id,
        analyzeKitten({
          kittenId: k.id,
          entries: selectedSamples.get(k.id) ?? [],
          litterEntries: selectedSamples,
          birthWeightG: k.birthWeightG,
          birthDate: k.bornAt ? dateOf(k.bornAt) : data.litter.birthDate,
          birthAt: k.bornAt,
          thresholds: data.thresholds,
        }),
      ]),
    );

    return {
      ...data,
      alive,
      hidden,
      entriesByKitten,
      samplesByKitten,
      selectedSamples,
      order,
      progress,
      series,
      analyses,
    };
  }, [data, refDate, today]);

  /* --- Schreiben --------------------------------------------------- */

  function setDraft(kittenId: ID, value: number | null) {
    draftsRef.current = { ...draftsRef.current, [kittenId]: value };
    setDrafts(draftsRef.current);
    setSaveError('');
  }

  async function changeDate(date: string) {
    if (savingRef.current || date === refDate) return;
    if (Object.values(draftsRef.current).some((value) => value != null)) {
      const accepted = await confirm({
        title: 'Wiegedatum ändern?',
        message: 'Die ungespeicherten Gewichte bleiben erhalten und werden dem neuen Datum zugeordnet.',
        confirmLabel: 'Datum ändern',
      });
      if (!accepted) return;
    }
    setRefDate(date);
    setTime('');
    setLastSaved({});
    setSaveError('');
  }

  async function saveRound() {
    if (!view || savingRef.current) return;
    const weights = view.alive.flatMap((kitten) => {
      const grams = draftsRef.current[kitten.id];
      return grams == null ? [] : [{ kittenId: kitten.id, grams }];
    });
    if (!weights.length) return;
    const fallbackTime = suggestedTime(entriesOnDate(view.weights, refDate));
    const at = !time && refDate === todayISO() ? nowISO() : localDateTime(refDate, time || fallbackTime);
    if (!at) {
      setSaveError('Bitte ein gültiges Datum und eine gültige Uhrzeit wählen.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const entries = await addWeightRound(weights, at);
      draftsRef.current = {};
      setDrafts({});
      setLastSaved(Object.fromEntries(entries.map((entry) => [entry.kittenId, {
        entryId: entry.id, grams: entry.grams,
      }])));
      setTime('');
      toast.success(`${entries.length === 1 ? 'Gewicht' : `${entries.length} Gewichte`} gespeichert.`);
    } catch (error) {
      setSaveError(`${error instanceof Error ? error.message : 'Die Gewichte konnten nicht gespeichert werden.'} Die Eingaben bleiben erhalten.`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function undo(kittenId: ID, entryId: ID) {
    try {
      await deleteWeight(entryId);
      setLastSaved((s) => {
        const next = { ...s };
        delete next[kittenId];
        return next;
      });
      toast.show('Wiegung zurückgenommen.', { tone: 'neutral', icon: 'refresh' });
    } catch {
      toast.error('Die Wiegung konnte nicht zurückgenommen werden.');
    }
  }

  /** Fokuswechsel bleibt synchron, damit die Tastatur auf dem iPhone offen bleibt. */
  function commit(kitten: Kitten) {
    if (savingRef.current) return;
    const raw = draftsRef.current[kitten.id];
    if (raw == null) return;

    const parsed = parseGrams(String(raw));
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }

    const order = view?.order ?? [];
    const filled = new Set(Object.entries(draftsRef.current).filter(([, value]) => value != null).map(([id]) => id));
    const next = nextFocusId(order, kitten.id, filled);

    if (next) {
      const el = inputElement(next);
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      inputElement(kitten.id)?.blur();
      document.getElementById('save-weight-round')?.focus();
    }
  }

  /* --- Lade- und Leerzustände -------------------------------------- */

  if (!data) {
    return (
      <Screen title="Wiegen" back>
        <div className="flex items-center justify-center gap-2 py-16 text-text-dim">
          <Spinner />
          <span className="text-sm">Wurf wird geladen …</span>
        </div>
      </Screen>
    );
  }

  if (data.kind !== 'ok' || !view) {
    return (
      <Screen title="Wiegen" back>
        <EmptyState
          icon="alert"
          title="Wurf nicht gefunden"
          description="Der Wurf wurde vermutlich gelöscht. Such ihn in der Übersicht noch einmal heraus."
          action={
            <Button variant="primary" onClick={() => navigate('/zucht')}>
              Zur Übersicht
            </Button>
          }
        />
      </Screen>
    );
  }

  const { litter, mother, alive, hidden, progress } = view;
  const birthDate = litter.birthDate;
  // „Tag 12" oder „Noch nicht geboren" — nie „Tag -5" (Geburtstermin in der Zukunft).
  const dayLabel = birthDate ? dayOfLifeLabel(birthDate, refDate) : null;
  const motherName = mother?.callName?.trim();
  const subtitle = [motherName ? `Wurf von ${motherName}` : 'Wurf', dayLabel]
    .filter(Boolean)
    .join(' · ');

  const detailKitten = detailId ? alive.find((k) => k.id === detailId) : undefined;
  const editEntry = editEntryId
    ? (view.weights.find((w) => w.id === editEntryId) ?? null)
    : null;
  const editKitten = editEntry ? alive.find((kitten) => kitten.id === editEntry.kittenId) : undefined;
  const hasMultipleDailyMeasurements = progress.targetPerKitten > 1;
  const progressValue = hasMultipleDailyMeasurements
    ? progress.creditedMeasurements
    : progress.done;
  const progressMax = hasMultipleDailyMeasurements
    ? progress.requiredMeasurements
    : progress.total;
  const progressLabel = hasMultipleDailyMeasurements
    ? `Wiege-Fortschritt: ${progress.creditedMeasurements} von ${progress.requiredMeasurements} Messungen`
    : `Wiege-Fortschritt: ${progress.done} von ${progress.total} gewogen`;
  /* --- Bildschirm ohne Kitten -------------------------------------- */

  if (alive.length === 0) {
    return (
      <Screen title="Wiegen" subtitle={subtitle} back>
        <EventDateField label="Wiegedatum" value={refDate} onChange={(date) => void changeDate(date)} max={today} min={birthDate} required />
        <EmptyState
          icon="paw"
          title={hidden > 0 ? 'Keine Kitten zum Wiegen' : 'Noch keine Kitten erfasst'}
          description={
            hidden > 0
              ? `In diesem Wurf ${hidden === 1 ? 'ist ein Kitten' : `sind ${hidden} Kitten`} als totgeboren oder verstorben eingetragen. Zum Wiegen bleibt niemand übrig.`
              : 'Leg die Kitten zuerst im Wurf an — danach kannst du hier in einem Durchgang alle Gewichte eintragen.'
          }
          action={
            <Button variant="primary" onClick={() => navigate(`/zucht/wurf/${litter.id}`)}>
              Wurf öffnen
            </Button>
          }
        />
      </Screen>
    );
  }

  /* --- Normalfall --------------------------------------------------- */

  return (
    <Screen
      title="Wiegen"
      subtitle={subtitle}
      back
      actions={
        <IconButton
          icon="chart"
          label="Kurve des Wurfes"
          size="md"
          onClick={() => setChartOpen(true)}
        />
      }
    >
      <Stack gap="md">
        {/* Kopfzeile: Fortschritt und Zeitpunkt */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.8rem] text-text-dim">
                {dayOfLifeLabel(birthDate, refDate)}
              </p>
              <p className="text-[1.05rem] font-semibold text-text">
                {hasMultipleDailyMeasurements
                  ? `${progress.creditedMeasurements} von ${progress.requiredMeasurements} Messungen`
                  : `${progress.done} von ${progress.total} gewogen`}
              </p>
            </div>
            <Badge tone={progress.done >= progress.total ? 'ok' : 'neutral'}>
              {hasMultipleDailyMeasurements
                ? `${progress.done} von ${progress.total} vollständig`
                : progress.measurements === 1
                  ? '1 Messung'
                  : `${progress.measurements} Messungen`}
            </Badge>
          </div>

          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progressMax}
            aria-valuenow={progressValue}
            aria-label={progressLabel}
          >
            <div
              className="h-full rounded-full bg-ok transition-[width] duration-300"
              style={{ width: `${progressMax ? (progressValue / progressMax) * 100 : 0}%` }}
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            <EventDateField
              label="Wiegedatum"
              value={refDate}
              onChange={(date) => void changeDate(date)}
              max={todayISO()}
              disabled={saving}
              required
            />
            <TextInput
              label="Uhrzeit (optional)"
              type="time"
              value={time}
              disabled={saving}
              onChange={(event) => setTime(event.target.value)}
            />
            <p className="text-[0.82rem] text-text-dim">
              Zeitpunkt: {time || (refDate === todayISO() ? 'jetzt' : `${suggestedTime(entriesOnDate(view.weights, refDate))} Uhr`)}
            </p>
          </div>
        </Card>

        {!birthDate && (
          <Callout tone="neutral" icon="info" title="Kein Geburtsdatum hinterlegt">
            Wiegen geht trotzdem. Sobald das Geburtsdatum im Wurf steht, zeigt die App Lebenstage
            und die Zunahme seit der Geburt.
          </Callout>
        )}

        {/* Die Zeilen */}
        <List>
          {alive.map((k) => {
            const saved = view.weights.find((entry) => entry.id === lastSaved[k.id]?.entryId);
            return (
            <WeighRow
              key={k.id}
              kitten={k}
              entries={view.selectedSamples.get(k.id) ?? []}
              selectedEntries={entriesOnDate(view.entriesByKitten.get(k.id) ?? [], refDate)}
              refDate={refDate}
              level={view.analyses.get(k.id)?.level ?? 'unknown'}
              draft={drafts[k.id] ?? null}
              lastSaved={saved ? { entryId: saved.id, grams: saved.grams } : undefined}
              pending={saving}
              onDraftChange={(v) => setDraft(k.id, v)}
              onCommit={() => commit(k)}
              onFocus={() => setFocusedId(k.id)}
              onBlur={() => setFocusedId((id) => (id === k.id ? null : id))}
              // Detail-Blatt und Korrektur-Blatt schließen sich gegenseitig
              // aus — das Detail-Blatt bringt seinen eigenen Verlauf mit
              // Korrigieren mit, zwei offene Blätter wären ein Knoten.
              onOpenDetail={() => {
                setEditEntryId(null);
                setDetailId(k.id);
              }}
              onUndo={(entryId) => void undo(k.id, entryId)}
              onEdit={(entryId) => {
                setDetailId(null);
                setEditEntryId(entryId);
              }}
            />
            );
          })}
        </List>

        {saveError && <Callout tone="alert" icon="alert" title="Nicht gespeichert">{saveError}</Callout>}
        <div className="flex flex-col gap-2">
          <Button
            id="save-weight-round"
            variant="primary"
            size="lg"
            block
            icon="check"
            loading={saving}
            disabled={dirtyCount === 0}
            onClick={() => void saveRound()}
          >
            Gewichte speichern{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
          </Button>
          {dirtyCount > 0 && (
            <Button
              block
              variant="ghost"
              icon="trash"
              disabled={saving}
              onClick={() => {
                draftsRef.current = {};
                setDrafts({});
                setSaveError('');
              }}
            >
              Eingaben verwerfen
            </Button>
          )}
        </div>

        {hidden > 0 && (
          <p className="px-1 text-[0.82rem] text-text-faint">
            {hidden === 1
              ? 'Ein Kitten wird nicht angezeigt (totgeboren oder verstorben).'
              : `${hidden} Kitten werden nicht angezeigt (totgeboren oder verstorben).`}
          </p>
        )}

        <Card>
          <p className="mb-2 text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
            {alive.length > 1 ? 'Kurve des Wurfes' : 'Kurve'}
          </p>
          <WeightChart
            series={view.series}
            birthDate={birthDate}
            height={270}
            emptyHint="Trag das erste Gewicht ein — danach wächst hier die Kurve mit jedem Wiegen."
          />
        </Card>
      </Stack>

      {/* Platz, damit die Tastatur die letzte Zeile nicht verdeckt */}
      <div style={{ height: focusedId ? '45vh' : 0 }} aria-hidden="true" />

      {/* Blatt: Kurve des ganzen Wurfes */}
      <Sheet open={chartOpen} onClose={() => setChartOpen(false)} title="Kurve des Wurfes" tall>
        <WeightChart
          series={view.series}
          birthDate={birthDate}
          height={360}
          emptyHint="Sobald du das erste Gewicht einträgst, entsteht hier die Kurve des ganzen Wurfes."
        />
      </Sheet>

      {/* Blatt: gerade gespeicherte Messung korrigieren */}
      <EditWeightSheet
        entry={editEntry}
        onClose={() => setEditEntryId(null)}
        birthDate={editKitten?.bornAt ? dateOf(editKitten.bornAt) : birthDate}
      />

      {/* Blatt: ein Kitten im Detail */}
      <Sheet
        open={Boolean(detailKitten)}
        onClose={() => setDetailId(null)}
        title={detailKitten ? kittenLabel(detailKitten) : ''}
        tall
      >
        {detailKitten && (
          <KittenDetail
            kitten={detailKitten}
            series={view.series}
            birthDate={birthDate}
            analysis={view.analyses.get(detailKitten.id)}
          />
        )}
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/*  Eine Zeile                                                         */
/* ------------------------------------------------------------------ */

interface WeighRowProps {
  kitten: Kitten;
  entries: WeightSample[];
  selectedEntries: WeightEntry[];
  refDate: string;
  level: WeightLevel;
  draft: number | null;
  lastSaved?: { entryId: ID; grams: number };
  pending: boolean;
  onDraftChange: (v: number | null) => void;
  onCommit: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onOpenDetail: () => void;
  onUndo: (entryId: ID) => void;
  onEdit: (entryId: ID) => void;
}

function WeighRow({
  kitten,
  entries,
  selectedEntries,
  refDate,
  level,
  draft,
  lastSaved,
  pending,
  onDraftChange,
  onCommit,
  onFocus,
  onBlur,
  onOpenDetail,
  onUndo,
  onEdit,
}: WeighRowProps) {
  const label = kittenLabel(kitten);
  const collar = collarColor(kitten.collarColor);
  const last = entries[entries.length - 1];
  const delta = latestDelta(entries);
  const todayCount = measurementsOn(entries, refDate);

  // Das verzögerte Scrollen nach dem Fokus (Tastatur fährt hoch) darf nach
  // dem Abbau der Zeile nicht mehr feuern.
  const scrollTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(scrollTimerRef.current), []);

  const subtitle = last
    ? `zuletzt ${formatGrams(last.grams)} · ${formatRelativeDay(dateOf(last.at))}, ${formatTime(last.at)}`
    : 'noch nie gewogen';

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3"
      onBlur={onBlur}
    >
      <div className="flex items-center gap-2.5">
        <ColorDot hex={collar.hex} size={16} />

        <button
          type="button"
          onClick={onOpenDetail}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1 text-left"
          aria-label={`Verlauf von ${label}`}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[0.97rem] font-medium text-text">{label}</span>
            <span className="truncate text-[0.82rem] text-text-dim">{subtitle}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {delta && (
                <span
                  className={['text-[0.82rem] font-semibold tabular', levelTextClass(level)].join(' ')}
                >
                  {formatGainG(delta.grams)}
                </span>
              )}
              {todayCount > 0 && (
                <Badge tone="ok" icon="check">
                  {todayCount === 1 ? 'erfasst' : `${todayCount}× erfasst`}
                </Badge>
              )}
              {pending && (
                <Badge tone="neutral" icon="clock">
                  wird gespeichert …
                </Badge>
              )}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="shrink-0 text-text-faint" />
        </button>

        <div className="w-[8rem] shrink-0">
          <NumberInput
            id={`weigh-${kitten.id}`}
            value={draft}
            onValueChange={onDraftChange}
            suffix="g"
            inputMode="numeric"
            enterKeyHint="next"
            autoComplete="off"
            placeholder={last ? String(last.grams) : '—'}
            disabled={pending}
            aria-label={`Gewicht von ${label} in Gramm`}
            className="h-13 text-right text-lg font-semibold"
            onFocus={(e) => {
              onFocus();
              const el = e.currentTarget;
              window.clearTimeout(scrollTimerRef.current);
              scrollTimerRef.current = window.setTimeout(
                () => el.scrollIntoView({ block: 'center', behavior: 'smooth' }),
                280,
              );
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommit();
              }
            }}
          />
        </div>
      </div>

      {selectedEntries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedEntries.map((entry) => (
            <Button
              key={entry.id}
              size="sm"
              variant="ghost"
              icon="edit"
              aria-label={`${label}: ${formatGrams(entry.grams)} um ${formatTime(entry.at)} Uhr ändern`}
              onClick={() => onEdit(entry.id)}
            >
              {formatTime(entry.at)} Uhr · {formatGrams(entry.grams)}
            </Button>
          ))}
        </div>
      )}

      {draft == null && lastSaved && (
        <div
          className="rounded-[var(--radius-field)] bg-ok-soft p-2"
          role="status"
        >
          <span className="flex items-center gap-1.5 px-1.5 py-1 text-[0.83rem] font-medium text-ok">
            <Icon name="check" size={16} />
            {formatGrams(lastSaved.grams)} gespeichert
          </span>
          <div className="grid grid-cols-2 gap-1">
            <Button
              size="md"
              variant="ghost"
              block
              className="px-2"
              onClick={() => onEdit(lastSaved.entryId)}
            >
              Ändern
            </Button>
            <Button
              size="md"
              variant="ghost"
              block
              className="px-2"
              onClick={() => onUndo(lastSaved.entryId)}
            >
              Rückgängig
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kitten im Detail                                                   */
/* ------------------------------------------------------------------ */

function KittenDetail({
  kitten,
  series,
  birthDate,
  analysis,
}: {
  kitten: Kitten;
  series: { kittenId: ID; label: string; hex: string; entries: WeightSample[] }[];
  birthDate?: string;
  analysis?: ReturnType<typeof analyzeKitten>;
}) {
  // Ein Bezugsdatum für das ganze Blatt: die eigene Geburtszeit des Kittens,
  // sonst die des Wurfes — Kurve und Verlauf zählen dieselben Lebenstage.
  const ownBirthDate = kitten.bornAt ? dateOf(kitten.bornAt) : birthDate;

  return (
    <Stack gap="lg">
      <div className="flex flex-col gap-3">
        <WeightBadge
          level={analysis?.level ?? 'unknown'}
          reasons={analysis?.reasons ?? []}
          showReasons
        />
        <dl className="grid grid-cols-2 gap-3">
          <Stat label="Aktuell" value={analysis?.currentG ? formatGrams(analysis.currentG) : '—'} />
          <Stat
            label="Geburtsgewicht"
            value={kitten.birthWeightG ? formatGrams(kitten.birthWeightG) : '—'}
          />
          {/* Ohne Geburtsgewicht rechnet die Bewertung ab der ersten Messung —
              dann darf die Kachel nicht „Seit Geburt" heißen. */}
          <Stat
            label={kitten.birthWeightG ? 'Seit Geburt' : 'Seit erster Wiegung'}
            value={formatPercent(analysis?.gainSinceBirthRatio, true)}
          />
          <Stat label="Zunahme" value={formatGainPerDay(analysis?.gainPerDay)} />
          <Stat
            label="Wurfdurchschnitt"
            value={analysis?.litterAverageG ? formatGrams(analysis.litterAverageG) : '—'}
          />
          <Stat
            label="Alter"
            value={analysis?.ageDays != null ? `Tag ${Math.floor(analysis.ageDays)}` : '—'}
          />
        </dl>
      </div>

      <div>
        <p className="mb-2 px-1 text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
          Kurve
        </p>
        <WeightChart
          series={series}
          focusKittenId={kitten.id}
          birthDate={ownBirthDate}
          height={300}
          emptyHint="Für dieses Kitten ist noch kein Gewicht erfasst."
        />
      </div>

      <div>
        <p className="mb-2 px-1 text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
          Alle Messungen
        </p>
        <WeightHistory kittenId={kitten.id} birthDate={ownBirthDate} />
      </div>
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-field)] bg-surface-2 px-3 py-2">
      <dt className="text-[0.75rem] text-text-dim">{label}</dt>
      <dd className="text-[0.95rem] font-semibold tabular text-text">{value}</dd>
    </div>
  );
}
