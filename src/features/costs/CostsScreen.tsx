/**
 * Kosten und Erlöse.
 *
 * Bewusst schlicht: keine Steuerlogik, keine Umsatzsteuer, keine Belegpflicht.
 * Die eine Frage, die beantwortet werden soll, ist „hat sich der Wurf
 * gerechnet" — dazu die laufenden Kosten je Zuchttier.
 */

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Badge,
  Button,
  Callout,
  Card,
  ChoiceGrid,
  ColorDot,
  EmptyState,
  Fab,
  Icon,
  List,
  ListRow,
  MoneyInput,
  Screen,
  Section,
  Segmented,
  Select,
  Sheet,
  Spinner,
  Stack,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { db, insert, patch, remove } from '../../db/db';
import { COST_CATEGORY_LABEL, collarColor, kittenLabel } from '../../types';
import type { Cat, CostCategory, CostEntry, ID, Kitten, Litter, RevenueEntry } from '../../types';
import { formatDate, todayISO } from '../../lib/date';
import { formatMoney } from '../../lib/format';
import { litterName } from '../dashboard/dashboard';
import {
  sortEntriesNewestFirst,
  summarizeAll,
  summarizeByCategory,
  summarizeCats,
  summarizeKittenRevenues,
  summarizeLitters,
  sumCents,
  unassignedCosts,
  unassignedRevenues,
  type CategoryBucket,
} from './costs';

/* ------------------------------------------------------------------ */
/*  Daten                                                              */
/* ------------------------------------------------------------------ */

interface CostsData {
  cats: Cat[];
  litters: Litter[];
  kittens: Kitten[];
  costs: CostEntry[];
  revenues: RevenueEntry[];
}

function useCostsData(): CostsData | undefined {
  return useLiveQuery(async () => {
    const [cats, litters, kittens, costs, revenues] = await Promise.all([
      db.cats.toArray(),
      db.litters.toArray(),
      db.kittens.toArray(),
      db.costs.toArray(),
      db.revenues.toArray(),
    ]);
    return { cats, litters, kittens, costs, revenues };
  }, []);
}

const CATEGORY_ORDER: CostCategory[] = [
  'vet',
  'emergency',
  'medication',
  'vaccination',
  'neutering',
  'stud_fee',
  'food',
  'registration',
  'equipment',
  'other',
];

/* ------------------------------------------------------------------ */
/*  Bearbeitungszustand                                                */
/* ------------------------------------------------------------------ */

type EntryKind = 'cost' | 'revenue';

interface EditorState {
  kind: EntryKind;
  id?: ID;
  date: string;
  category: CostCategory;
  amountCents: number | null;
  litterId: string;
  kittenId: string;
  catId: string;
  note: string;
}

function emptyEditor(kind: EntryKind, preset: Partial<EditorState> = {}): EditorState {
  return {
    kind,
    date: todayISO(),
    category: 'vet',
    amountCents: null,
    litterId: '',
    kittenId: '',
    catId: '',
    note: '',
    ...preset,
  };
}

type View =
  | { mode: 'list' }
  | { mode: 'litter'; id: ID }
  | { mode: 'cat'; id: ID }
  | { mode: 'unassigned' };

/* ------------------------------------------------------------------ */
/*  Bildschirm                                                         */
/* ------------------------------------------------------------------ */

export function CostsScreen() {
  const data = useCostsData();
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<'litters' | 'cats'>('litters');
  const [view, setView] = useState<View>({ mode: 'list' });
  const [editor, setEditor] = useState<EditorState | null>(null);

  const catsById = useMemo(
    () => new Map((data?.cats ?? []).map((c) => [c.id, c])),
    [data],
  );
  const littersById = useMemo(
    () => new Map((data?.litters ?? []).map((l) => [l.id, l])),
    [data],
  );
  const kittenToLitter = useMemo(
    () => new Map((data?.kittens ?? []).map((k) => [k.id, k.litterId])),
    [data],
  );

  /* --- Laden -------------------------------------------------------- */

  if (!data) {
    return (
      <Screen title="Kosten" back>
        <div className="flex flex-col items-center gap-3 py-16 text-text-faint">
          <Spinner size={26} />
          <p className="text-sm">Einen Moment …</p>
        </div>
      </Screen>
    );
  }

  const { cats, litters, kittens, costs, revenues } = data;

  /* --- Speichern und Löschen ---------------------------------------- */

  async function save(state: EditorState) {
    if (state.amountCents == null || !Number.isFinite(state.amountCents)) {
      toast.error('Bitte einen Betrag eintragen.');
      return;
    }
    const date = state.date || todayISO();
    const common = {
      date,
      amountCents: Math.round(state.amountCents),
      litterId: state.litterId || undefined,
      kittenId: state.kittenId || undefined,
      note: state.note.trim() || undefined,
    };

    try {
      if (state.kind === 'cost') {
        const payload = { ...common, category: state.category, catId: state.catId || undefined };
        if (state.id) await patch(db.costs, state.id, payload);
        else await insert(db.costs, payload);
      } else {
        if (state.id) await patch(db.revenues, state.id, common);
        else await insert(db.revenues, common);
      }
      setEditor(null);
      toast.success(state.id ? 'Gespeichert.' : 'Eingetragen.');
    } catch {
      toast.error('Das konnte nicht gespeichert werden.');
    }
  }

  async function removeEntry(state: EditorState) {
    if (!state.id) return;
    const ok = await confirm({
      title: state.kind === 'cost' ? 'Kosten löschen?' : 'Erlös löschen?',
      message: 'Der Eintrag wird endgültig entfernt.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    try {
      if (state.kind === 'cost') await remove(db.costs, state.id);
      else await remove(db.revenues, state.id);
      setEditor(null);
      toast.success('Gelöscht.');
    } catch {
      toast.error('Der Eintrag konnte nicht gelöscht werden.');
    }
  }

  /* --- Erfassungsblatt, in jeder Ansicht erreichbar ------------------ */

  const entrySheet = (
    <EntrySheet
      state={editor}
      onChange={setEditor}
      onClose={() => setEditor(null)}
      onSave={save}
      onDelete={removeEntry}
      litters={data.litters}
      kittens={data.kittens}
      cats={data.cats.filter((c) => c.isOwn)}
      catsById={catsById}
    />
  );

  /* --- Detailansichten ---------------------------------------------- */

  if (view.mode === 'litter') {
    const litter = littersById.get(view.id);
    // Der Wurf wurde inzwischen gelöscht — zurück zur Übersicht.
    if (!litter) {
      setView({ mode: 'list' });
      return null;
    }
    const own = costs.filter(
      (c) => c.litterId === litter.id || (c.kittenId && kittenToLitter.get(c.kittenId) === litter.id),
    );
    const rev = revenues.filter(
      (r) => r.litterId === litter.id || (r.kittenId && kittenToLitter.get(r.kittenId) === litter.id),
    );
    return (
      <>
        <DetailScreen
          title={litterName(litter, catsById)}
          subtitle={litter.birthDate ? `Geboren am ${formatDate(litter.birthDate)}` : undefined}
          onBack={() => setView({ mode: 'list' })}
          costs={own}
          revenues={rev}
          kittens={kittens}
          showResult
          onAddCost={() => setEditor(emptyEditor('cost', { litterId: litter.id }))}
          onAddRevenue={() => setEditor(emptyEditor('revenue', { litterId: litter.id }))}
          onEdit={setEditor}
        />
        {entrySheet}
      </>
    );
  }

  if (view.mode === 'cat') {
    const cat = catsById.get(view.id);
    if (!cat) {
      setView({ mode: 'list' });
      return null;
    }
    const own = costs.filter((c) => c.catId === cat.id);
    return (
      <>
        <DetailScreen
          title={cat.callName}
          subtitle="Laufende Kosten, wurfübergreifend"
          onBack={() => setView({ mode: 'list' })}
          costs={own}
          revenues={[]}
          kittens={kittens}
          onAddCost={() => setEditor(emptyEditor('cost', { catId: cat.id }))}
          onEdit={setEditor}
        />
        {entrySheet}
      </>
    );
  }

  if (view.mode === 'unassigned') {
    return (
      <>
        <DetailScreen
          title="Ohne Zuordnung"
          subtitle="Belege, die zu keinem Wurf und keinem Tier gehören"
          onBack={() => setView({ mode: 'list' })}
          costs={unassignedCosts(costs)}
          revenues={unassignedRevenues(revenues)}
          kittens={kittens}
          onAddCost={() => setEditor(emptyEditor('cost'))}
          onAddRevenue={() => setEditor(emptyEditor('revenue'))}
          onEdit={setEditor}
        />
        {entrySheet}
      </>
    );
  }

  /* --- Übersicht ----------------------------------------------------- */

  const sortedLitters = [...litters].sort((a, b) =>
    (b.birthDate ?? b.dueDate ?? '').localeCompare(a.birthDate ?? a.dueDate ?? ''),
  );
  const finances = summarizeLitters(
    sortedLitters.map((l) => l.id),
    costs,
    revenues,
    kittenToLitter,
  );
  const catFinances = summarizeCats(costs);
  const overall = summarizeAll(costs, revenues);
  const loose = unassignedCosts(costs);
  const looseRevenues = unassignedRevenues(revenues);

  const ownCats = cats.filter((c) => c.isOwn);
  const catsWithNumbers = [...ownCats].sort(
    (a, b) =>
      (catFinances.get(b.id)?.totalCents ?? 0) - (catFinances.get(a.id)?.totalCents ?? 0) ||
      a.callName.localeCompare(b.callName, 'de'),
  );

  const nothingAtAll = costs.length === 0 && revenues.length === 0;

  return (
    <Screen
      title="Kosten"
      back
      toolbar={
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'litters', label: 'Würfe' },
            { value: 'cats', label: 'Zuchttiere' },
          ]}
        />
      }
    >
      <Stack gap="lg">
        {nothingAtAll ? (
          <EmptyState
            icon="euro"
            title="Noch keine Kosten erfasst"
            description="Tierarzt, Futter, Impfungen, Deckgebühr — und später die Erlöse je Kitten. Am Ende steht je Wurf eine schlichte Rechnung."
            action={
              <Button variant="primary" icon="plus" onClick={() => setEditor(emptyEditor('cost'))}>
                Ersten Beleg erfassen
              </Button>
            }
          />
        ) : (
          <>
            <TotalsCard
              costCents={overall.costCents}
              revenueCents={overall.revenueCents}
              label="Alles zusammen"
            />

            {tab === 'litters' && (
              <>
                {sortedLitters.length === 0 ? (
                  <EmptyState
                    icon="paw"
                    title="Noch kein Wurf angelegt"
                    description="Kosten lassen sich trotzdem erfassen — sie landen dann unter „Ohne Zuordnung“."
                  />
                ) : (
                  <Section title="Je Wurf">
                    <List>
                      {sortedLitters.map((l) => {
                        const f = finances.get(l.id);
                        return (
                          <ListRow
                            key={l.id}
                            leading={
                              <span className="text-text-faint">
                                <Icon name="paw" size={20} />
                              </span>
                            }
                            title={litterName(l, catsById)}
                            subtitle={
                              f && (f.costCount > 0 || f.revenueCount > 0)
                                ? `Kosten ${formatMoney(f.costCents)} · Erlöse ${formatMoney(f.revenueCents)}`
                                : 'Noch nichts erfasst'
                            }
                            trailing={<Result cents={f?.resultCents ?? 0} muted={!f || (f.costCount === 0 && f.revenueCount === 0)} />}
                            onClick={() => setView({ mode: 'litter', id: l.id })}
                          />
                        );
                      })}
                    </List>
                  </Section>
                )}

                {(loose.length > 0 || looseRevenues.length > 0) && (
                  <Section title="Ohne Zuordnung">
                    <List>
                      <ListRow
                        leading={
                          <span className="text-text-faint">
                            <Icon name="folder" size={20} />
                          </span>
                        }
                        title="Allgemeine Belege"
                        subtitle={`${loose.length + looseRevenues.length} Einträge`}
                        trailing={formatMoney(sumCents(loose))}
                        onClick={() => setView({ mode: 'unassigned' })}
                      />
                    </List>
                  </Section>
                )}
              </>
            )}

            {tab === 'cats' && (
              <Section
                title="Je Zuchttier"
                description="Was ein Tier laufend kostet — unabhängig vom Wurf."
              >
                {catsWithNumbers.length === 0 ? (
                  <EmptyState
                    icon="cat"
                    title="Noch keine Zuchttiere angelegt"
                    description="Sobald Königinnen und Kater eingetragen sind, lassen sich Kosten direkt an ihnen erfassen."
                  />
                ) : (
                  <List>
                    {catsWithNumbers.map((c) => {
                      const f = catFinances.get(c.id);
                      return (
                        <ListRow
                          key={c.id}
                          leading={
                            <span className="text-text-faint">
                              <Icon name="cat" size={20} />
                            </span>
                          }
                          title={c.callName}
                          subtitle={
                            f
                              ? `${f.count} ${f.count === 1 ? 'Beleg' : 'Belege'}${f.firstDate ? ` seit ${formatDate(f.firstDate)}` : ''}`
                              : 'Noch nichts erfasst'
                          }
                          trailing={
                            <span className={f ? 'text-text' : 'text-text-faint'}>
                              {formatMoney(f?.totalCents ?? 0)}
                            </span>
                          }
                          onClick={() => setView({ mode: 'cat', id: c.id })}
                        />
                      );
                    })}
                  </List>
                )}
              </Section>
            )}

            <Callout tone="neutral" icon="info">
              Diese Aufstellung ist eine Merkhilfe, keine Buchhaltung. Für das Finanzamt
              taugt sie ausdrücklich nicht.
            </Callout>
          </>
        )}
      </Stack>

      <Fab label="Beleg erfassen" onClick={() => setEditor(emptyEditor('cost'))} />

      {entrySheet}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/*  Detailansicht (Wurf, Tier, Ohne Zuordnung)                         */
/* ------------------------------------------------------------------ */

function DetailScreen({
  title,
  subtitle,
  onBack,
  costs,
  revenues,
  kittens,
  showResult,
  onAddCost,
  onAddRevenue,
  onEdit,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  costs: CostEntry[];
  revenues: RevenueEntry[];
  kittens: Kitten[];
  showResult?: boolean;
  onAddCost: () => void;
  onAddRevenue?: () => void;
  onEdit: (state: EditorState) => void;
}) {
  const kittensById = useMemo(() => new Map(kittens.map((k) => [k.id, k])), [kittens]);
  const buckets = summarizeByCategory(costs);
  const costTotal = sumCents(costs);
  const revenueTotal = sumCents(revenues);
  const kittenRevenues = [...summarizeKittenRevenues(revenues).values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  );

  const entries = [
    ...costs.map((c) => ({ kind: 'cost' as const, entry: c })),
    ...revenues.map((r) => ({ kind: 'revenue' as const, entry: r })),
  ];
  const sorted = sortEntriesNewestFirst(entries.map((e) => ({ ...e, ...e.entry })));

  return (
    <Screen title={title} subtitle={subtitle} back={onBack}>
      <Stack gap="lg">
        <TotalsCard
          costCents={costTotal}
          revenueCents={revenueTotal}
          label={showResult ? 'Ergebnis' : 'Summe'}
          hideResult={!showResult}
        />

        <div className="flex gap-2">
          <Button block icon="plus" onClick={onAddCost}>
            Kosten
          </Button>
          {onAddRevenue && (
            <Button block icon="plus" onClick={onAddRevenue}>
              Erlös
            </Button>
          )}
        </div>

        {buckets.length > 0 && (
          <Section title="Nach Kategorie">
            <CategoryBars buckets={buckets} total={costTotal} />
          </Section>
        )}

        {kittenRevenues.length > 0 && (
          <Section title="Erlöse je Kitten">
            <List>
              {kittenRevenues.map((kr) => {
                const k = kittensById.get(kr.kittenId);
                return (
                  <ListRow
                    key={kr.kittenId}
                    leading={
                      k ? (
                        <ColorDot hex={collarColor(k.collarColor).hex} size={16} />
                      ) : (
                        <span className="text-text-faint">
                          <Icon name="paw" size={20} />
                        </span>
                      )
                    }
                    title={k ? kittenLabel(k) : 'Nicht mehr vorhandenes Kitten'}
                    subtitle={`${kr.count} ${kr.count === 1 ? 'Eintrag' : 'Einträge'}`}
                    trailing={
                      <span className="text-ok">+{formatMoney(kr.totalCents)}</span>
                    }
                  />
                );
              })}
            </List>
          </Section>
        )}

        <Section title="Belege">
          {sorted.length === 0 ? (
            <EmptyState
              icon="document"
              title="Noch nichts erfasst"
              description="Jeder Beleg braucht nur einen Betrag. Datum, Kategorie und Notiz dürfen leer bleiben."
              action={
                <Button variant="primary" icon="plus" onClick={onAddCost}>
                  Kosten erfassen
                </Button>
              }
            />
          ) : (
            <List>
              {sorted.map((row) => {
                const isCost = row.kind === 'cost';
                const cost = isCost ? (row.entry as CostEntry) : null;
                const kitten = row.entry.kittenId
                  ? kittensById.get(row.entry.kittenId)
                  : undefined;
                const parts = [
                  formatDate(row.entry.date),
                  kitten ? kittenLabel(kitten) : undefined,
                  row.entry.note,
                ].filter(Boolean) as string[];
                return (
                  <ListRow
                    key={`${row.kind}-${row.entry.id}`}
                    leading={
                      <span className={isCost ? 'text-text-faint' : 'text-ok'}>
                        <Icon name={isCost ? 'euro' : 'check-circle'} size={20} />
                      </span>
                    }
                    title={cost ? COST_CATEGORY_LABEL[cost.category] : 'Erlös'}
                    subtitle={parts.join(' · ')}
                    trailing={
                      <span className={isCost ? 'text-text' : 'text-ok'}>
                        {isCost ? '' : '+'}
                        {formatMoney(row.entry.amountCents)}
                      </span>
                    }
                    onClick={() =>
                      onEdit({
                        kind: row.kind,
                        id: row.entry.id,
                        date: row.entry.date,
                        category: cost?.category ?? 'other',
                        amountCents: row.entry.amountCents,
                        litterId: row.entry.litterId ?? '',
                        kittenId: row.entry.kittenId ?? '',
                        catId: cost?.catId ?? '',
                        note: row.entry.note ?? '',
                      })
                    }
                  />
                );
              })}
            </List>
          )}
        </Section>
      </Stack>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/*  Anzeigebausteine                                                   */
/* ------------------------------------------------------------------ */

function TotalsCard({
  costCents,
  revenueCents,
  label,
  hideResult,
}: {
  costCents: number;
  revenueCents: number;
  label: string;
  hideResult?: boolean;
}) {
  const result = revenueCents - costCents;
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.9rem] text-text-dim">Kosten</span>
          <span className="text-[1.05rem] font-semibold text-text tabular">
            {formatMoney(costCents)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.9rem] text-text-dim">Erlöse</span>
          <span className="text-[1.05rem] font-semibold text-text tabular">
            {formatMoney(revenueCents)}
          </span>
        </div>
        {!hideResult && (
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <span className="text-[0.9rem] font-medium text-text">{label}</span>
            <span
              className={[
                'text-[1.15rem] font-semibold tabular',
                result < 0 ? 'text-alert' : 'text-ok',
              ].join(' ')}
            >
              {result > 0 ? '+' : ''}
              {formatMoney(result)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

function CategoryBars({ buckets, total }: { buckets: CategoryBucket[]; total: number }) {
  const max = Math.max(1, ...buckets.map((b) => Math.abs(b.totalCents)));
  return (
    <Card>
      <ul className="flex flex-col gap-3">
        {buckets.map((b) => (
          <li key={b.category} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[0.9rem] text-text">{b.label}</span>
              <span className="shrink-0 text-[0.9rem] text-text-dim tabular">
                {formatMoney(b.totalCents)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.round((Math.abs(b.totalCents) / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {total !== 0 && (
        <p className="mt-3 text-[0.8rem] text-text-faint">
          Zusammen {formatMoney(total)} in {buckets.length}{' '}
          {buckets.length === 1 ? 'Kategorie' : 'Kategorien'}.
        </p>
      )}
    </Card>
  );
}

function Result({ cents, muted }: { cents: number; muted?: boolean }) {
  if (muted) return <span className="text-text-faint">—</span>;
  return (
    <Badge tone={cents < 0 ? 'alert' : 'ok'}>
      {cents > 0 ? '+' : ''}
      {formatMoney(cents)}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Erfassungsblatt                                                    */
/* ------------------------------------------------------------------ */

function EntrySheet({
  state,
  onChange,
  onClose,
  onSave,
  onDelete,
  litters,
  kittens,
  cats,
  catsById,
}: {
  state: EditorState | null;
  onChange: (s: EditorState) => void;
  onClose: () => void;
  onSave: (s: EditorState) => void;
  onDelete: (s: EditorState) => void;
  litters: Litter[];
  kittens: Kitten[];
  cats: Cat[];
  catsById: Map<ID, Cat>;
}) {
  const open = state !== null;
  const isCost = state?.kind === 'cost';

  const litterOptions = useMemo(
    () =>
      [...litters]
        .sort((a, b) => (b.birthDate ?? '').localeCompare(a.birthDate ?? ''))
        .map((l) => ({ value: l.id, label: litterName(l, catsById) })),
    [litters, catsById],
  );

  const kittenOptions = useMemo(() => {
    const pool = state?.litterId ? kittens.filter((k) => k.litterId === state.litterId) : kittens;
    return pool.map((k) => ({ value: k.id, label: kittenLabel(k) }));
  }, [kittens, state?.litterId]);

  if (!state) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={state.id ? 'Beleg bearbeiten' : 'Beleg erfassen'}
      tall
      footer={
        <div className="flex flex-col gap-2">
          <Button block variant="primary" size="lg" onClick={() => onSave(state)}>
            Speichern
          </Button>
          {state.id && (
            <Button block variant="ghost" icon="trash" onClick={() => onDelete(state)}>
              Löschen
            </Button>
          )}
        </div>
      }
    >
      <Stack gap="md">
        {!state.id && (
          <Segmented
            value={state.kind}
            onChange={(kind) => onChange({ ...state, kind })}
            options={[
              { value: 'cost', label: 'Kosten' },
              { value: 'revenue', label: 'Erlös' },
            ]}
          />
        )}

        <MoneyInput
          label="Betrag"
          required
          valueCents={state.amountCents}
          onValueChange={(amountCents) => onChange({ ...state, amountCents })}
          hint="Das einzige Pflichtfeld. Gutschriften mit Minus davor."
        />

        <TextInput
          label="Datum"
          type="date"
          value={state.date}
          onChange={(e) => onChange({ ...state, date: e.target.value })}
        />

        {isCost && (
          <ChoiceGrid
            label="Kategorie"
            value={state.category}
            onChange={(category) => onChange({ ...state, category })}
            options={CATEGORY_ORDER.map((c) => ({ value: c, label: COST_CATEGORY_LABEL[c] }))}
          />
        )}

        <Select
          label="Wurf"
          placeholder="— kein Wurf —"
          value={state.litterId}
          options={litterOptions}
          onChange={(e) => onChange({ ...state, litterId: e.target.value, kittenId: '' })}
        />

        {kittenOptions.length > 0 && (
          <Select
            label="Kitten"
            placeholder="— kein einzelnes Kitten —"
            value={state.kittenId}
            options={kittenOptions}
            onChange={(e) => onChange({ ...state, kittenId: e.target.value })}
          />
        )}

        {isCost && cats.length > 0 && (
          <Select
            label="Zuchttier"
            placeholder="— kein Zuchttier —"
            hint="Für laufende Kosten, die zu keinem Wurf gehören."
            value={state.catId}
            options={cats.map((c) => ({ value: c.id, label: c.callName }))}
            onChange={(e) => onChange({ ...state, catId: e.target.value })}
          />
        )}

        <TextArea
          label="Notiz"
          rows={3}
          value={state.note}
          onChange={(e) => onChange({ ...state, note: e.target.value })}
          placeholder="z. B. Rechnung Tierklinik"
        />
      </Stack>
    </Sheet>
  );
}
