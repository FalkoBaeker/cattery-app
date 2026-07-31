/**
 * Schnellerfassung der Kittengewichte — der meistbenutzte Bildschirm der App.
 *
 * In Woche 1–2 wird zweimal täglich gewogen, mit einem Kitten in der Hand.
 * Deshalb: eine Zeile je Kitten, ein großes Zahlenfeld, sofort gespeichert,
 * Fokus springt weiter, jede Eingabe sofort korrigierbar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ID, ISODateTime, Kitten, WeightEntry } from '../../types';
import { COLLAR_COLORS, DEFAULT_SETTINGS, collarColor, kittenLabel } from '../../types';
import { db } from '../../db/db';
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
  NumberInput,
  Screen,
  Sheet,
  Spinner,
  Stack,
  TextInput,
  useToast,
} from '../../ui';
import {
  dateOf,
  formatDateTime,
  formatRelativeDay,
  formatTime,
  fromLocalInputValue,
  nowISO,
  toLocalInputValue,
} from '../../lib/date';
import { formatGainG, formatGainPerDay, formatGrams, formatPercent } from '../../lib/format';
import { WEIGHT_LEVEL_TONE, type WeightLevel } from '../../domain/weight';
import {
  analyzeKitten,
  dayOfLife,
  dayProgress,
  deltaToPrevious,
  latestDelta,
  measurementsOn,
  nextFocusId,
  parseGrams,
} from './weighing';
import type { WeightSample } from './chart';
import { addWeight, deleteWeight } from './store';
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

  const [atOverride, setAtOverride] = useState<ISODateTime | null>(null);
  const [drafts, setDrafts] = useState<Record<ID, number | null>>({});
  const draftsRef = useRef<Record<ID, number | null>>({});
  /**
   * Kitten, die im *laufenden Durchgang* erfasst wurden. Nur sie überspringt
   * die Fokuskette. Der Tagesfortschritt (`progress.doneIds`) taugt dafür
   * nicht: abends ist dort schon jedes Kitten vom Morgen eingetragen, die
   * Kette würde alle überspringen und sofort abbrechen.
   */
  const roundRef = useRef<Set<ID>>(new Set());
  const [lastSaved, setLastSaved] = useState<Record<ID, { entryId: ID; grams: number }>>({});
  const [focusedId, setFocusedId] = useState<ID | null>(null);
  const [detailId, setDetailId] = useState<ID | null>(null);
  const [editEntryId, setEditEntryId] = useState<ID | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeDraft, setTimeDraft] = useState('');

  const refDate = dateOf(atOverride ?? nowISO());

  // Wechselt der erfasste Tag, beginnt der Durchgang von vorn.
  useEffect(() => {
    roundRef.current = new Set();
    setLastSaved({});
  }, [refDate]);

  /* --- Aufbereitete Daten ---------------------------------------- */

  const view = useMemo(() => {
    if (!data || data.kind !== 'ok') return null;
    const alive = sortKittens(data.kittens.filter(isAlive));
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

    const order = alive.map((k) => k.id);
    const progress = dayProgress(order, samplesByKitten, refDate);

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
          entries: samplesByKitten.get(k.id) ?? [],
          litterEntries: samplesByKitten,
          birthWeightG: k.birthWeightG,
          birthDate: k.bornAt ? dateOf(k.bornAt) : data.litter.birthDate,
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
      order,
      progress,
      series,
      analyses,
    };
  }, [data, refDate]);

  /* --- Schreiben --------------------------------------------------- */

  function setDraft(kittenId: ID, value: number | null) {
    draftsRef.current = { ...draftsRef.current, [kittenId]: value };
    setDrafts(draftsRef.current);
  }

  async function persist(kitten: Kitten, grams: number, at: ISODateTime, allDone: boolean) {
    try {
      // Frisch aus der Datenbank lesen, damit der Vergleich auch bei zwei
      // schnellen Eingaben hintereinander stimmt.
      const before = await db.weights.where('kittenId').equals(kitten.id).toArray();
      const entry = await addWeight(kitten.id, grams, at);
      setLastSaved((s) => ({ ...s, [kitten.id]: { entryId: entry.id, grams } }));

      const delta = deltaToPrevious(before, at, grams);
      const parts = [`${kittenLabel(kitten)}: ${formatGrams(grams)}`];
      if (delta) parts.push(formatGainG(delta.grams));
      if (allDone) parts.push('alle erfasst');

      toast.show(parts.join(' · '), {
        tone: 'ok',
        icon: 'check-circle',
        durationMs: 4500,
        action: { label: 'Rückgängig', onClick: () => void undo(kitten.id, entry.id) },
      });
    } catch {
      toast.error('Das Gewicht konnte nicht gespeichert werden.');
    }
  }

  async function undo(kittenId: ID, entryId: ID) {
    try {
      await deleteWeight(entryId);
      roundRef.current.delete(kittenId);
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

  /**
   * Übernimmt die Eingabe einer Zeile. Der Fokuswechsel passiert *vor* dem
   * Speichern und damit noch im Antippen-Ereignis — nur so bleibt die
   * Tastatur auf dem iPhone offen.
   */
  function commit(kitten: Kitten) {
    const raw = draftsRef.current[kitten.id];
    if (raw == null) return;

    const parsed = parseGrams(String(raw));
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }

    const at = atOverride ?? nowISO();
    setDraft(kitten.id, null);
    roundRef.current.add(kitten.id);

    const order = view?.order ?? [];
    const next = nextFocusId(order, kitten.id, roundRef.current);

    if (next) {
      const el = inputElement(next);
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      // Der Durchgang ist voll. Die nächste Eingabe beginnt einen neuen —
      // zweimal täglich wiegen ist in Woche 1–2 der Normalfall.
      inputElement(kitten.id)?.blur();
      roundRef.current = new Set();
    }

    void persist(kitten, parsed.grams, at, next === null);
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
  const day = dayOfLife(birthDate, refDate);
  const motherName = mother?.callName?.trim();
  const subtitle = [motherName ? `Wurf von ${motherName}` : 'Wurf', day != null ? `Tag ${day}` : null]
    .filter(Boolean)
    .join(' · ');

  const detailKitten = detailId ? alive.find((k) => k.id === detailId) : undefined;
  const editEntry = editEntryId
    ? (view.weights.find((w) => w.id === editEntryId) ?? null)
    : null;

  /* --- Bildschirm ohne Kitten -------------------------------------- */

  if (alive.length === 0) {
    return (
      <Screen title="Wiegen" subtitle={subtitle} back>
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
                {day != null ? `Tag ${day}` : 'Ohne Geburtsdatum'}
              </p>
              <p className="text-[1.05rem] font-semibold text-text">
                {progress.done} von {progress.total} gewogen
              </p>
            </div>
            <Badge tone={progress.done >= progress.total ? 'ok' : 'neutral'}>
              {progress.measurements === 1
                ? '1 Messung'
                : `${progress.measurements} Messungen`}
            </Badge>
          </div>

          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label="Fortschritt"
          >
            <div
              className="h-full rounded-full bg-ok transition-[width] duration-300"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>

          <Button
            className="mt-3"
            block
            variant="quiet"
            icon="clock"
            onClick={() => {
              setTimeDraft(toLocalInputValue(atOverride ?? nowISO()));
              setTimeOpen(true);
            }}
          >
            {atOverride ? `Nachtrag: ${formatDateTime(atOverride)}` : 'Zeitpunkt: jetzt'}
          </Button>
        </Card>

        {atOverride && (
          <Callout tone="warn" icon="clock" title="Werte werden nachgetragen">
            <p>Alle Eingaben werden auf {formatDateTime(atOverride)} gespeichert.</p>
            <Button
              className="mt-1"
              variant="ghost"
              size="md"
              icon="refresh"
              onClick={() => setAtOverride(null)}
            >
              Wieder auf jetzt stellen
            </Button>
          </Callout>
        )}

        {!birthDate && (
          <Callout tone="neutral" icon="info" title="Kein Geburtsdatum hinterlegt">
            Wiegen geht trotzdem. Sobald das Geburtsdatum im Wurf steht, zeigt die App Lebenstage
            und die Zunahme seit der Geburt.
          </Callout>
        )}

        {/* Die Zeilen */}
        <List>
          {alive.map((k) => (
            <WeighRow
              key={k.id}
              kitten={k}
              entries={view.samplesByKitten.get(k.id) ?? []}
              refDate={refDate}
              level={view.analyses.get(k.id)?.level ?? 'unknown'}
              draft={drafts[k.id] ?? null}
              lastSaved={lastSaved[k.id]}
              onDraftChange={(v) => setDraft(k.id, v)}
              onCommit={() => commit(k)}
              onFocus={() => setFocusedId(k.id)}
              onBlur={() => setFocusedId((id) => (id === k.id ? null : id))}
              onOpenDetail={() => setDetailId(k.id)}
              onUndo={(entryId) => void undo(k.id, entryId)}
              onEdit={(entryId) => setEditEntryId(entryId)}
            />
          ))}
        </List>

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
            height={190}
            emptyHint="Trag das erste Gewicht ein — danach wächst hier die Kurve mit jedem Wiegen."
          />
        </Card>
      </Stack>

      {/* Platz, damit die Tastatur die letzte Zeile nicht verdeckt */}
      <div style={{ height: focusedId ? '45vh' : 0 }} aria-hidden="true" />

      {/* Blatt: Zeitpunkt */}
      <Sheet
        open={timeOpen}
        onClose={() => setTimeOpen(false)}
        title="Zeitpunkt der Wiegung"
        footer={
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="lg"
              block
              icon="check"
              onClick={() => {
                if (!timeDraft) {
                  toast.error('Bitte einen Zeitpunkt auswählen.');
                  return;
                }
                setAtOverride(fromLocalInputValue(timeDraft));
                setTimeOpen(false);
              }}
            >
              Übernehmen
            </Button>
            <Button
              variant="ghost"
              size="md"
              block
              onClick={() => {
                setAtOverride(null);
                setTimeOpen(false);
              }}
            >
              Auf jetzt stellen
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[0.9rem] leading-relaxed text-text-dim">
            Standard ist der Augenblick der Eingabe. Wenn du die Werte vom Morgen erst abends
            einträgst, stell hier den passenden Zeitpunkt ein — die Zunahme wird über den echten
            Zeitabstand gerechnet.
          </p>
          <TextInput
            label="Datum und Uhrzeit"
            type="datetime-local"
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
          />
        </div>
      </Sheet>

      {/* Blatt: Kurve des ganzen Wurfes */}
      <Sheet open={chartOpen} onClose={() => setChartOpen(false)} title="Kurve des Wurfes" tall>
        <WeightChart
          series={view.series}
          birthDate={birthDate}
          height={230}
          emptyHint="Sobald du das erste Gewicht einträgst, entsteht hier die Kurve des ganzen Wurfes."
        />
      </Sheet>

      {/* Blatt: gerade gespeicherte Messung korrigieren */}
      <EditWeightSheet
        entry={editEntry}
        onClose={() => setEditEntryId(null)}
        birthDate={birthDate}
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
  refDate: string;
  level: WeightLevel;
  draft: number | null;
  lastSaved?: { entryId: ID; grams: number };
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
  refDate,
  level,
  draft,
  lastSaved,
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

  const subtitle = last
    ? `zuletzt ${formatGrams(last.grams)} · ${formatRelativeDay(dateOf(last.at))}, ${formatTime(last.at)}`
    : 'noch nie gewogen';

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3"
      // Verlässt der Finger das Feld, wird der eingetippte Wert trotzdem
      // gespeichert. Das Ereignis steigt vom Eingabefeld hierher auf.
      onBlur={() => {
        onBlur();
        onCommit();
      }}
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
                  {todayCount === 1 ? 'erfasst' : `${todayCount}×`}
                </Badge>
              )}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="shrink-0 text-text-faint" />
        </button>

        <div className="w-[7rem] shrink-0">
          <NumberInput
            id={`weigh-${kitten.id}`}
            value={draft}
            onValueChange={onDraftChange}
            suffix="g"
            inputMode="numeric"
            enterKeyHint="next"
            autoComplete="off"
            placeholder={last ? String(last.grams) : '—'}
            aria-label={`Gewicht von ${label} in Gramm`}
            className="h-13 text-right text-[1.3rem] font-semibold"
            onFocus={(e) => {
              onFocus();
              const el = e.currentTarget;
              window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280);
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

      {draft != null && (
        <Button variant="primary" size="md" block icon="check" onClick={onCommit}>
          Speichern und weiter
        </Button>
      )}

      {draft == null && lastSaved && (
        <div className="flex items-center gap-1 rounded-[var(--radius-field)] bg-ok-soft px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[0.83rem] text-text-dim">
            Gerade gespeichert: {formatGrams(lastSaved.grams)}
          </span>
          <Button size="md" variant="ghost" onClick={() => onEdit(lastSaved.entryId)}>
            Ändern
          </Button>
          <Button size="md" variant="ghost" onClick={() => onUndo(lastSaved.entryId)}>
            Rückgängig
          </Button>
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
          <Stat
            label="Seit Geburt"
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
          birthDate={birthDate}
          height={210}
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
