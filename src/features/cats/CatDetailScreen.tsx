import { useMemo, useState } from 'react';
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
  Spinner,
  Stack,
  type BadgeTone,
} from '../../ui';
import { db } from '../../db/db';
import {
  CAT_STATUS_LABEL,
  LITTER_STATUS_LABEL,
  SEX_LABEL,
  type CatStatus,
  type HealthTestKind,
  type ID,
  type ISODate,
  type Litter,
} from '../../types';
import {
  daysBetween,
  formatDate,
  formatDateTime,
  formatRelativeDay,
  todayISO,
} from '../../lib/date';
import { formatGainG, formatGrams } from '../../lib/format';
import { analyzeHeatCycles, lastHeatSummary } from './heat';
import { formatInbreeding } from './format';
import { catAgeLabel } from './age';
import {
  HEALTH_TEST_ICON,
  HEALTH_TEST_STATE_LABEL,
  healthTestTitle,
  healthTestValidityLine,
  summarizeHealthTests,
  type HealthTestGroup,
} from './tests';
import { buildCatTimeline, type EventTone } from './timeline';
import { CatAvatar } from './CatAvatar';
import { CatEditorSheet } from './CatEditorSheet';
import { HeatSheet } from './HeatSheet';
import { HealthTestSheet } from './HealthTestSheet';
import { CatWeightSheet } from './CatWeightSheet';
import { WeightTrend } from './WeightTrend';
import { useSettingsValues } from '../../db/useSettings';

/* ------------------------------------------------------------------ */
/*  Kleinteile                                                         */
/* ------------------------------------------------------------------ */

const STATUS_TONE: Record<CatStatus, BadgeTone> = {
  active: 'ok',
  paused: 'warn',
  neutered: 'neutral',
  placed: 'neutral',
  deceased: 'neutral',
};

/* Bewusst eine lokale Kopie: src/ui/Card.tsx hält seine Tonfarben (TONES)
   privat und exportiert sie nicht. Sobald src/ui sie veröffentlicht,
   fliegt diese Tabelle raus. */
const EVENT_TONE_CLASS: Record<EventTone, string> = {
  neutral: 'bg-surface-2 text-text-dim',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  alert: 'bg-alert-soft text-alert',
};

/** Ladeanzeige für einen einzelnen Abschnitt — niemals „leer" zeigen, solange geladen wird. */
function SectionLoading({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border px-4 py-7 text-[0.88rem] text-text-dim">
      <Spinner size={18} />
      {label}
    </div>
  );
}

/** Zeile im Stammdatenblock. Leere Werte werden gar nicht erst gezeigt. */
function DataRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <ListRow title={label} trailing={<span className="text-text">{value}</span>} />;
}

const STANDARD_TEST_KINDS: HealthTestKind[] = ['hcm', 'pkd', 'felv_fiv'];

/** Stabile Vorgabe, solange die Kittenzahlen noch geladen werden. */
const EMPTY_COUNTS = new Map<ID, number>();

function litterSortDate(l: Litter): string {
  return l.birthDate ?? l.dueDate ?? l.matingDate ?? '';
}

/**
 * "in 5 Tagen" nur, solange es hilft. Bei einem Wurf von vor drei Jahren
 * sagt „vor 1096 Tagen" niemandem etwas.
 */
function relativeIfNear(date: string | undefined, ref: ISODate): string | undefined {
  if (!date) return undefined;
  return Math.abs(daysBetween(ref, date)) <= 60 ? formatRelativeDay(date, ref) : undefined;
}

/* ------------------------------------------------------------------ */
/*  Bildschirm                                                         */
/* ------------------------------------------------------------------ */

export function CatDetailScreen() {
  const { catId } = useParams<{ catId: string }>();
  const navigate = useNavigate();
  const today = todayISO();
  const settings = useSettingsValues();

  const cat = useLiveQuery(
    async () => (catId ? ((await db.cats.get(catId)) ?? null) : null),
    [catId],
  );
  const heats = useLiveQuery(
    async () => (catId ? await db.heatCycles.where('catId').equals(catId).toArray() : []),
    [catId],
  );
  const tests = useLiveQuery(
    async () => (catId ? await db.healthTests.where('catId').equals(catId).toArray() : []),
    [catId],
  );
  const litters = useLiveQuery(
    async () => {
      if (!catId) return [];
      const [asMother, asFather] = await Promise.all([
        db.litters.where('motherId').equals(catId).toArray(),
        db.litters.where('fatherId').equals(catId).toArray(),
      ]);
      return [...asMother, ...asFather].sort((a, b) =>
        litterSortDate(b).localeCompare(litterSortDate(a)),
      );
    },
    [catId],
  );
  const weights = useLiveQuery(
    async () =>
      catId
        ? (await db.catWeights.where('catId').equals(catId).toArray()).sort((a, b) =>
            a.at.localeCompare(b.at),
          )
        : [],
    [catId],
  );
  const appointments = useLiveQuery(
    async () => (catId ? await db.appointments.where('catId').equals(catId).toArray() : []),
    [catId],
  );
  const careTasks = useLiveQuery(
    async () => (catId ? await db.careTasks.where('catId').equals(catId).toArray() : []),
    [catId],
  );

  const litterIds = (litters ?? [])
    .map((l) => l.id)
    .sort()
    .join(',');
  const kittenCounts = useLiveQuery(
    async () => {
      const map = new Map<ID, number>();
      for (const id of litterIds ? litterIds.split(',') : []) {
        map.set(id, await db.kittens.where('litterId').equals(id).count());
      }
      return map;
    },
    [litterIds],
    EMPTY_COUNTS,
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [heatSheet, setHeatSheet] = useState<{ open: boolean; id?: ID }>({ open: false });
  const [testSheet, setTestSheet] = useState<{
    open: boolean;
    id?: ID;
    kind?: HealthTestKind;
    label?: string;
  }>({ open: false });
  const [weightSheet, setWeightSheet] = useState<{ open: boolean; id?: ID }>({ open: false });
  const [openHistory, setOpenHistory] = useState<string[]>([]);
  const [fullTimeline, setFullTimeline] = useState(false);

  const heatAnalysis = useMemo(
    () => analyzeHeatCycles(heats ?? [], today),
    [heats, today],
  );
  const healthSummary = useMemo(() => summarizeHealthTests(tests ?? [], today), [tests, today]);
  const timeline = useMemo(() => {
    if (!cat) return [];
    return buildCatTimeline({
      cat,
      heats,
      tests,
      litters: settings.modules.litters ? litters : [],
      kittenCountByLitter: kittenCounts,
      appointments: settings.modules.appointments ? appointments : [],
      weights: settings.modules.weights ? weights : [],
      careTasks,
      ref: today,
    });
  }, [
    cat,
    heats,
    tests,
    litters,
    kittenCounts,
    appointments,
    weights,
    careTasks,
    today,
    settings.modules.litters,
    settings.modules.appointments,
    settings.modules.weights,
  ]);

  /* --- Ladezustand und Fehlerfälle -------------------------------- */

  if (!catId) {
    return (
      <Screen title="Katze" back>
        <EmptyState
          icon="alert"
          title="Keine Katze angegeben"
          description="Der Aufruf enthält keine Kennung. Geh zurück und wähle ein Tier aus der Liste."
          action={<Button onClick={() => navigate('/zucht')}>Zur Zuchtübersicht</Button>}
        />
      </Screen>
    );
  }

  if (cat === undefined) {
    return (
      <Screen title="Katze" back>
        <div className="flex justify-center py-16 text-text-dim">
          <Spinner size={26} />
        </div>
      </Screen>
    );
  }

  if (cat === null) {
    return (
      <Screen title="Katze" back>
        <EmptyState
          icon="alert"
          title="Diese Katze gibt es nicht mehr"
          description="Sie wurde gelöscht oder der Verweis ist veraltet."
          action={<Button onClick={() => navigate('/zucht')}>Zur Zuchtübersicht</Button>}
        />
      </Screen>
    );
  }

  const isFemale = cat.sex === 'female';
  // `cat.breed` zählt hier bewusst nicht mit: der Editor füllt die Rasse immer
  // automatisch aus den Einstellungen — sie sagt nichts darüber, ob wirklich
  // Stammdaten gepflegt wurden.
  const hasStammdaten = Boolean(
    cat.birthDate ||
      cat.emsCode ||
      cat.registrationNo ||
      cat.chipNo ||
      cat.bloodGroup ||
      cat.breederName ||
      cat.inbreedingPercent != null,
  );

  const shownTimeline = fullTimeline ? timeline : timeline.slice(0, 12);
  const lastWeight = weights && weights.length > 0 ? weights[weights.length - 1] : undefined;

  return (
    <Screen
      title={cat.callName}
      subtitle={cat.catteryName}
      back
      actions={
        <IconButton icon="edit" label="Stammdaten bearbeiten" onClick={() => setEditorOpen(true)} />
      }
    >
      <Stack gap="lg">
        {/* ---------------------------------------------------------- */}
        {/*  Kopf                                                       */}
        {/* ---------------------------------------------------------- */}
        <Card>
          <div className="flex items-start gap-4">
            <CatAvatar name={cat.callName} photoAttachmentId={cat.photoAttachmentId} size={76} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[1.35rem] leading-tight font-semibold break-words text-text">
                {cat.callName}
              </h2>
              {cat.catteryName && (
                <p className="mt-0.5 text-[0.88rem] break-words text-text-dim">{cat.catteryName}</p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge tone="neutral">{SEX_LABEL[cat.sex]}</Badge>
                <Badge tone="neutral">{catAgeLabel(cat.birthDate, today)}</Badge>
                <Badge tone={STATUS_TONE[cat.status]}>{CAT_STATUS_LABEL[cat.status]}</Badge>
                {!cat.isOwn && <Badge tone="neutral">fremdes Tier</Badge>}
              </div>
            </div>
          </div>
        </Card>

        {/* ---------------------------------------------------------- */}
        {/*  Stammdaten                                                 */}
        {/* ---------------------------------------------------------- */}
        <Section
          title="Stammdaten"
          action={
            <Button icon="edit" onClick={() => setEditorOpen(true)}>
              Bearbeiten
            </Button>
          }
        >
          {hasStammdaten ? (
            <List>
              <DataRow
                label="Wurfdatum"
                value={cat.birthDate ? formatDate(cat.birthDate) : undefined}
              />
              <DataRow label="Rasse" value={cat.breed} />
              <DataRow label="EMS-Code" value={cat.emsCode} />
              <DataRow label="Zuchtbuchnummer" value={cat.registrationNo} />
              <DataRow label="Chipnummer" value={cat.chipNo} />
              <DataRow label="Blutgruppe" value={cat.bloodGroup} />
              <DataRow label="Züchter" value={cat.breederName} />
              {/* PawPeds liefert zwei Nachkommastellen — formatPercent würde
                  aus 6,25 ein falsches „6,3 %" machen. */}
              <DataRow label="Ahnenverlust" value={formatInbreeding(cat.inbreedingPercent)} />
            </List>
          ) : (
            <Callout tone="neutral" icon="info" title="Nur der Rufname ist gefüllt">
              Alles Weitere — Zuchtbuchnummer, Chip, EMS-Code, Züchter — darf leer bleiben. Trag
              es ein, wenn du es zur Hand hast.
            </Callout>
          )}
        </Section>

        {cat.notes && (
          <Section title="Notizen">
            <Card>
              <p className="text-[0.92rem] leading-relaxed whitespace-pre-wrap text-text selectable">
                {cat.notes}
              </p>
            </Card>
          </Section>
        )}

        {/* ---------------------------------------------------------- */}
        {/*  Rolligkeit                                                 */}
        {/* ---------------------------------------------------------- */}
        {isFemale && (
          <Section
            title="Rolligkeit"
            description={lastHeatSummary(heatAnalysis)}
            action={
              <Button icon="plus" onClick={() => setHeatSheet({ open: true })}>
                Eintragen
              </Button>
            }
          >
            {heats === undefined ? (
              <SectionLoading />
            ) : heatAnalysis.count === 0 ? (
              <EmptyState
                icon="refresh"
                title="Noch keine Rolligkeit erfasst"
                description="Trag den Beginn ein, sobald sie rollig wird. Ab der dritten Rolligkeit schätzt die App den nächsten Termin."
                action={
                  <Button icon="plus" onClick={() => setHeatSheet({ open: true })}>
                    Rolligkeit eintragen
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                <HeatSummary analysis={heatAnalysis} />
                <HeatList analysis={heatAnalysis} onEdit={(id) => setHeatSheet({ open: true, id })} />
              </div>
            )}
          </Section>
        )}

        {/* ---------------------------------------------------------- */}
        {/*  Gesundheitstests                                           */}
        {/* ---------------------------------------------------------- */}
        <Section
          title="Gesundheitstests"
          description="HCM und PKD per Ultraschall, üblicherweise halbjährlich."
          action={
            <Button icon="plus" onClick={() => setTestSheet({ open: true })}>
              Eintragen
            </Button>
          }
        >
          {tests === undefined ? (
            <SectionLoading />
          ) : healthSummary.groups.length === 0 ? (
            <EmptyState
              icon="heart"
              title="Noch kein Test erfasst"
              description="Trag Datum, Ergebnis und Gültigkeit ein — die nächste Fälligkeit rechnet die App aus."
              action={
                <Button icon="plus" onClick={() => setTestSheet({ open: true, kind: 'hcm' })}>
                  Test eintragen
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {healthSummary.expiredCount > 0 && (
                <Callout tone="alert" icon="alert" title="Abgelaufen">
                  {healthSummary.expiredCount === 1
                    ? 'Ein Test ist abgelaufen.'
                    : `${healthSummary.expiredCount} Tests sind abgelaufen.`}
                </Callout>
              )}
              {healthSummary.dueSoonCount > 0 && (
                <Callout tone="warn" icon="calendar" title="Bald fällig">
                  {healthSummary.dueSoonCount === 1
                    ? 'Ein Test wird in den nächsten Wochen fällig.'
                    : `${healthSummary.dueSoonCount} Tests werden in den nächsten Wochen fällig.`}
                </Callout>
              )}
              <List>
                {healthSummary.groups.map((g) => (
                  <HealthGroupRows
                    key={g.key}
                    group={g}
                    expanded={openHistory.includes(g.key)}
                    onToggle={() =>
                      setOpenHistory((keys) =>
                        keys.includes(g.key) ? keys.filter((k) => k !== g.key) : [...keys, g.key],
                      )
                    }
                    onEdit={(id) => setTestSheet({ open: true, id })}
                  />
                ))}
              </List>
              {STANDARD_TEST_KINDS.filter(
                (kind) => !healthSummary.groups.some((g) => g.kind === kind),
              ).map((kind) => (
                <ListRow
                  key={kind}
                  className="rounded-[var(--radius-card)] border border-dashed border-border"
                  leading={<Icon name="plus" size={18} className="text-text-faint" />}
                  title={healthTestTitle({ kind })}
                  subtitle="Noch nicht erfasst"
                  onClick={() => setTestSheet({ open: true, kind })}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ---------------------------------------------------------- */}
        {/*  Würfe                                                      */}
        {/* ---------------------------------------------------------- */}
        {settings.modules.litters && <Section title="Würfe">
          {litters === undefined ? (
            <SectionLoading />
          ) : litters.length === 0 ? (
            <EmptyState
              icon="paw"
              title="Noch kein Wurf"
              description="Würfe werden in der Zuchtübersicht angelegt und erscheinen dann hier."
              action={<Button onClick={() => navigate('/zucht')}>Zur Zuchtübersicht</Button>}
            />
          ) : (
            <List>
              {litters.map((l) => {
                const count = kittenCounts.get(l.id);
                const date = l.birthDate ?? l.dueDate ?? l.matingDate;
                return (
                  <ListRow
                    key={l.id}
                    leading={<Icon name="paw" size={20} className="text-text-faint" />}
                    title={
                      l.birthDate
                        ? `Wurf vom ${formatDate(l.birthDate)}`
                        : l.dueDate
                          ? `Erwartet ${formatDate(l.dueDate)}`
                          : 'Wurf ohne Datum'
                    }
                    subtitle={[
                      LITTER_STATUS_LABEL[l.status],
                      l.motherId === cat.id ? 'als Mutter' : 'als Vater',
                      relativeIfNear(date, today),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={count != null && count > 0 ? `${count} Kitten` : undefined}
                    onClick={() => navigate(`/zucht/wurf/${l.id}`)}
                  />
                );
              })}
            </List>
          )}
        </Section>}

        {/* ---------------------------------------------------------- */}
        {/*  Gewicht (nur Königinnen)                                   */}
        {/* ---------------------------------------------------------- */}
        {settings.modules.weights && isFemale && (
          <Section
            title="Gewicht"
            description="Während der Trächtigkeit. Nach der Geburt wird nicht mehr gewogen."
            action={
              <Button icon="plus" onClick={() => setWeightSheet({ open: true })}>
                Wiegen
              </Button>
            }
          >
            {weights === undefined ? (
              <SectionLoading />
            ) : weights.length === 0 ? (
              <EmptyState
                icon="weight"
                title="Noch kein Gewicht erfasst"
                description="Während der Trächtigkeit wiegen wir die Königin. Nach der Geburt nicht mehr — das ist so gewollt."
                action={
                  <Button icon="plus" onClick={() => setWeightSheet({ open: true })}>
                    Gewicht eintragen
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {weights.length >= 2 && (
                  <Card>
                    <WeightTrend points={weights} />
                  </Card>
                )}
                <List>
                  {[...weights].reverse().map((w, index, list) => {
                    const previous = list[index + 1];
                    const delta = previous ? w.grams - previous.grams : undefined;
                    return (
                      <ListRow
                        key={w.id}
                        leading={<Icon name="weight" size={20} className="text-text-faint" />}
                        title={formatGrams(w.grams)}
                        subtitle={[formatDateTime(w.at), w.note].filter(Boolean).join(' · ')}
                        trailing={delta != null ? formatGainG(delta) : undefined}
                        onClick={() => setWeightSheet({ open: true, id: w.id })}
                      />
                    );
                  })}
                </List>
              </div>
            )}
          </Section>
        )}

        {/* ---------------------------------------------------------- */}
        {/*  Zeitstrahl                                                 */}
        {/* ---------------------------------------------------------- */}
        <Section
          title="Zeitstrahl"
          description="Alles zu dieser Katze, neueste Einträge zuerst."
        >
          {/* Auf *alle* Quellen warten, die in den Zeitstrahl einfließen.
              Sonst erscheint kurz „Noch nichts passiert", obwohl z. B. ein
              Tierarzttermin existiert — und dauerhaft, falls eine der
              Abfragen scheitert. */}
          {heats === undefined ||
          tests === undefined ||
          litters === undefined ||
          appointments === undefined ||
          weights === undefined ||
          careTasks === undefined ? (
            <SectionLoading />
          ) : timeline.length === 0 ? (
            <EmptyState
              icon="list"
              title="Noch nichts passiert"
              description="Sobald ein Test, eine Rolligkeit, ein Wurf oder ein Termin erfasst ist, steht hier die vollständige Geschichte dieser Katze."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <List>
                {shownTimeline.map((e) => {
                  const href = e.href;
                  return (
                  <ListRow
                    key={e.id}
                    leading={
                      <span
                        className={[
                          'flex size-9 items-center justify-center rounded-full',
                          EVENT_TONE_CLASS[e.tone],
                        ].join(' ')}
                      >
                        <Icon name={e.icon} size={18} />
                      </span>
                    }
                    title={e.title}
                    subtitle={e.detail}
                    trailing={
                      <span className="flex flex-col items-end leading-tight">
                        <span>{formatDate(e.date)}</span>
                        {e.time && <span className="text-text-faint">{e.time}</span>}
                      </span>
                    }
                    onClick={href ? () => navigate(href) : undefined}
                    chevron={Boolean(href)}
                  />
                  );
                })}
              </List>
              {/* Aufklappen muss sich auch wieder zuklappen lassen —
                  sonst scrollt man bei einer alten Katze ewig. */}
              {timeline.length > 12 && (
                <Button
                  block
                  onClick={() => setFullTimeline((v) => !v)}
                  iconRight={fullTimeline ? 'chevron-up' : 'chevron-down'}
                >
                  {fullTimeline ? 'Weniger anzeigen' : `Alle ${timeline.length} Einträge anzeigen`}
                </Button>
              )}
            </div>
          )}
        </Section>
      </Stack>

      {/* Blätter */}
      <CatEditorSheet
        open={editorOpen}
        catId={cat.id}
        onClose={() => setEditorOpen(false)}
        onDeleted={() => navigate('/zucht', { replace: true })}
      />
      <HeatSheet
        open={heatSheet.open}
        catId={cat.id}
        entryId={heatSheet.id}
        onClose={() => setHeatSheet({ open: false })}
      />
      <HealthTestSheet
        open={testSheet.open}
        catId={cat.id}
        testId={testSheet.id}
        defaultKind={testSheet.kind}
        onClose={() => setTestSheet({ open: false })}
      />
      {settings.modules.weights && <CatWeightSheet
        open={weightSheet.open}
        catId={cat.id}
        entryId={weightSheet.id}
        defaultGrams={weightSheet.id ? undefined : lastWeight?.grams}
        onClose={() => setWeightSheet({ open: false })}
      />}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/*  Rolligkeit: Auswertung und Liste                                   */
/* ------------------------------------------------------------------ */

function HeatSummary({ analysis }: { analysis: ReturnType<typeof analyzeHeatCycles> }) {
  const { prediction, last, ongoing } = analysis;

  return (
    <div className="flex flex-col gap-2">
      {ongoing && (
        <Callout tone="accent" icon="refresh" title="Rollig">
          Seit {formatDate(last?.startDate)} — das Ende ist noch nicht eingetragen.
        </Callout>
      )}

      {prediction ? (
        <Callout
          tone={prediction.overdueDays > 0 ? 'warn' : 'accent'}
          icon="calendar"
          title={
            prediction.overdueDays > 0
              ? `Erwartet war der ${formatDate(prediction.date)}`
              : `Nächste Rolligkeit um den ${formatDate(prediction.date)}`
          }
        >
          <p>
            {prediction.overdueDays > 0
              ? `Seit ${prediction.overdueDays} ${prediction.overdueDays === 1 ? 'Tag' : 'Tagen'} überfällig. `
              : ''}
            Erfahrungsgemäß zwischen {formatDate(prediction.earliest)} und{' '}
            {formatDate(prediction.latest)}.
          </p>
          <p className="mt-1 text-text-faint">
            Schätzung aus {prediction.basedOnIntervals}{' '}
            {prediction.basedOnIntervals === 1 ? 'Abstand' : 'Abständen'} zwischen{' '}
            {prediction.basedOnCycles} Rolligkeiten.
          </p>
        </Callout>
      ) : (
        <Callout tone="neutral" icon="info" title="Noch keine Vorhersage">
          {analysis.summary} Erst ab drei Rolligkeiten lässt sich ein Zyklus erkennen — vorher
          wäre jede Zahl geraten.
        </Callout>
      )}

      {analysis.intervals.length > 0 && (
        <Card>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Mittel" value={days(analysis.averageDays)} />
            <Stat label="Median" value={days(analysis.medianDays)} />
            <Stat
              label="Spanne"
              value={
                analysis.minDays != null && analysis.maxDays != null
                  ? `${analysis.minDays}–${analysis.maxDays} T.`
                  : '—'
              }
            />
            <Stat label="Rolligkeiten" value={String(analysis.count)} />
            <Stat
              label="Dauer"
              value={days(analysis.averageDurationDays)}
            />
            <Stat
              label="Streuung"
              value={
                analysis.spreadDays != null ? `± ${Math.round(analysis.spreadDays)} T.` : '—'
              }
            />
          </dl>
        </Card>
      )}

      {analysis.mergedCount > 0 && (
        <p className="px-1 text-[0.8rem] text-text-faint">
          {analysis.mergedCount}{' '}
          {analysis.mergedCount === 1 ? 'Eintrag wurde' : 'Einträge wurden'} als Teil einer
          bereits erfassten Rolligkeit gewertet.
        </p>
      )}
    </div>
  );
}

function days(value?: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} T.`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.72rem] tracking-wide text-text-faint uppercase">{label}</dt>
      <dd className="text-[1rem] font-semibold text-text tabular">{value}</dd>
    </div>
  );
}

function HeatList({
  analysis,
  onEdit,
}: {
  analysis: ReturnType<typeof analyzeHeatCycles>;
  onEdit: (id: ID) => void;
}) {
  // Absteigend anzeigen, den Abstand aber zum jeweils vorherigen Eintrag rechnen.
  const rows = analysis.cycles
    .map((c, index) => ({ cycle: c, gap: index > 0 ? analysis.intervals[index - 1] : undefined }))
    .reverse();

  return (
    <List>
      {rows.map(({ cycle, gap }) => {
        const id = cycle.id;
        return (
          <ListRow
            key={id ?? cycle.startDate}
            leading={<Icon name="refresh" size={20} className="text-text-faint" />}
            title={formatDate(cycle.startDate)}
            subtitle={
              cycle.durationDays != null
                ? `${cycle.durationDays} ${cycle.durationDays === 1 ? 'Tag' : 'Tage'} · bis ${formatDate(cycle.endDate)}`
                : 'Ende nicht erfasst'
            }
            trailing={gap != null ? `+${gap} T.` : undefined}
            onClick={id ? () => onEdit(id) : undefined}
          />
        );
      })}
    </List>
  );
}

/* ------------------------------------------------------------------ */
/*  Gesundheitstests: Gruppe mit Historie                              */
/* ------------------------------------------------------------------ */

function HealthGroupRows({
  group,
  expanded,
  onToggle,
  onEdit,
}: {
  group: HealthTestGroup;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (id: ID) => void;
}) {
  const { latest, status } = group;

  return (
    <>
      <ListRow
        leading={
          <span
            className={[
              'flex size-9 items-center justify-center rounded-full',
              EVENT_TONE_CLASS[status.tone],
            ].join(' ')}
          >
            <Icon name={HEALTH_TEST_ICON[group.kind] ?? 'document'} size={18} />
          </span>
        }
        title={group.title}
        /* Gültigkeit und konkretes Fälligkeitsdatum gehören hierher — sonst
           muss man das Bearbeiten-Blatt öffnen, um zu sehen, wann der nächste
           Ultraschall ansteht. HCM und PKD laufen halbjährlich. */
        subtitle={[
          formatDate(latest.date),
          latest.result?.trim() || undefined,
          healthTestValidityLine(latest),
          status.text,
        ]
          .filter(Boolean)
          .join(' · ')}
        trailing={
          <Badge tone={status.tone}>{HEALTH_TEST_STATE_LABEL[status.state]}</Badge>
        }
        onClick={() => onEdit(latest.id)}
      />
      {group.history.length > 0 && (
        <ListRow
          title={
            expanded
              ? 'Frühere Ergebnisse ausblenden'
              : `${group.history.length} ${group.history.length === 1 ? 'früheres Ergebnis' : 'frühere Ergebnisse'}`
          }
          className="text-[0.88rem]"
          leading={
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              className="text-text-faint"
            />
          }
          chevron={false}
          onClick={onToggle}
        />
      )}
      {expanded &&
        group.history.map((h) => (
          <ListRow
            key={h.id}
            className="pl-12"
            title={formatDate(h.date)}
            subtitle={h.result?.trim() || 'ohne Ergebnis'}
            onClick={() => onEdit(h.id)}
          />
        ))}
    </>
  );
}
