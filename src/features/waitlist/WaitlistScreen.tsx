/**
 * Warteliste — Bildschirm /warteliste.
 *
 * Meist stehen hier drei bis vier Namen (F61). Deshalb keine Verwaltung für
 * Massen, sondern eine ruhige Liste: von Hand sortierbar, mit Suche, Filtern,
 * Papierkorb und dem Versand der Sammelnachricht.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  Screen,
  Stack,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import {
  DEFAULT_SETTINGS,
  INTEREST_STATUS_LABEL,
  WISH_SEX_LABEL,
  type ID,
  type Interest,
  type InterestStatus,
} from '../../types';
import { db } from '../../db/db';
import { dateOf, formatDate } from '../../lib/date';
import { formatMoneyShort } from '../../lib/format';
import {
  EMPTY_FILTER,
  filterInterests,
  formatPurgeHint,
  isFilterActive,
  moveAndResequence,
  shortNote,
  sortWaitlist,
  type SexFilter,
  type StatusFilter,
  type WaitlistFilter,
} from './order';
import {
  applySortUpdates,
  loadBroadcastRun,
  purgeExpiredTrash,
  purgeInterest,
  restoreInterest,
} from './store';
import { STATUS_CHAIN, STATUS_TONE } from './constants';
import { Chip, ChipDivider, ChipRow, LoadingList } from './shared';
import { InterestSheet } from './InterestSheet';
import { BroadcastBanner, BroadcastComposeSheet, BroadcastRunSheet } from './Broadcast';

/* ================================================================== */
/*  Eine Zeile                                                         */
/* ================================================================== */

function InterestRow({
  interest,
  lastContact,
  sortable,
  onOpen,
}: {
  interest: Interest;
  lastContact?: string;
  /** Ziehen ist nur in der ungefilterten Liste sinnvoll. */
  sortable: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: interest.id,
    disabled: !sortable,
  });

  // Nur senkrecht verschieben — seitliches Wandern wirkt auf dem Telefon
  // wie ein Bedienfehler. Das leichte Vergrößern beim Aufnehmen muss in
  // dieselbe Angabe, sonst überschreibt sie eine Klasse aus dem Stilsatz.
  const moved = transform ? `translate3d(0, ${transform.y}px, 0)` : '';
  const lifted = isDragging ? ' scale(1.02)' : '';
  const style: React.CSSProperties = {
    transform: moved || lifted ? `${moved}${lifted}`.trim() : undefined,
    transition,
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? 'relative' : undefined,
    // Langes Drücken darf auf iOS nicht die Auswahl-Lupe hervorholen.
    WebkitTouchCallout: 'none',
  };

  const note = shortNote(interest.notes);
  const details = [
    WISH_SEX_LABEL[interest.wishSex],
    interest.offeredPriceCents != null ? formatMoneyShort(interest.offeredPriceCents) : null,
    interest.city || null,
  ].filter(Boolean) as string[];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      className={[
        'flex items-stretch gap-1 border-b border-border bg-surface last:border-b-0',
        isDragging
          ? 'rounded-[var(--radius-card)] border-b-0 shadow-[var(--shadow-raised)] ring-2 ring-accent'
          : '',
      ].join(' ')}
    >
      {sortable && (
        <span
          aria-hidden="true"
          className={[
            'flex w-8 shrink-0 items-center justify-center',
            isDragging ? 'text-accent' : 'text-text-faint',
          ].join(' ')}
        >
          <Icon name="drag" size={18} />
        </span>
      )}
      <button
        type="button"
        onClick={onOpen}
        className={[
          'flex min-h-16 min-w-0 flex-1 flex-col justify-center gap-0.5 py-3 pr-3 text-left active:bg-surface-2',
          sortable ? '' : 'pl-4',
        ].join(' ')}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[0.97rem] font-medium text-text">
            {interest.name}
          </span>
          <Badge tone={STATUS_TONE[interest.status]}>
            {INTEREST_STATUS_LABEL[interest.status]}
          </Badge>
          <Icon name="chevron-right" size={17} className="shrink-0 text-text-faint" />
        </span>

        <span className="truncate text-[0.84rem] text-text-dim">{details.join(' · ')}</span>

        {note && <span className="line-clamp-2 text-[0.84rem] text-text-dim">„{note}"</span>}

        <span className="truncate text-[0.78rem] text-text-faint">
          {lastContact
            ? `Zuletzt Kontakt am ${formatDate(dateOf(lastContact))}`
            : 'Noch kein Kontakt festgehalten'}
        </span>
      </button>
    </div>
  );
}

/* ================================================================== */
/*  Papierkorb                                                         */
/* ================================================================== */

function TrashSection({ items }: { items: Interest[] }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  async function restore(item: Interest) {
    await restoreInterest(item.id);
    toast.show(`${item.name} ist zurück auf der Warteliste.`, {
      tone: 'ok',
      icon: 'check-circle',
    });
  }

  async function purge(item: Interest) {
    const ok = await confirm({
      title: `${item.name} endgültig löschen?`,
      message:
        'Der Eintrag und der gesamte Kontaktverlauf verschwinden für immer. Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Endgültig löschen',
      danger: true,
    });
    if (!ok) return;
    await purgeInterest(item.id);
    toast.show('Eintrag endgültig gelöscht.');
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
      >
        <Icon name="trash" size={19} className="shrink-0 text-text-faint" />
        <span className="min-w-0 flex-1 text-[0.95rem] font-medium text-text">
          Papierkorb{' '}
          <span className="font-normal text-text-dim">
            ({items.length} {items.length === 1 ? 'Eintrag' : 'Einträge'})
          </span>
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} className="text-text-faint" />
      </button>

      {open && (
        <div className="border-t border-border">
          <p className="px-4 py-3 text-[0.82rem] leading-relaxed text-text-dim">
            Abgesagte Einträge landen hier und werden nach 30 Tagen von selbst endgültig gelöscht.
          </p>
          {items.map((item) => (
            <div key={item.id} className="border-t border-border px-4 py-3">
              <p className="truncate text-[0.95rem] font-medium text-text">{item.name}</p>
              <p className="mt-0.5 text-[0.8rem] text-text-dim">
                {item.deletedAt ? `Gelöscht am ${formatDate(dateOf(item.deletedAt))} · ` : ''}
                {item.deletedAt ? formatPurgeHint(item.deletedAt) : ''}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" icon="refresh" onClick={() => void restore(item)}>
                  Zurückholen
                </Button>
                <Button size="sm" variant="ghost" icon="trash" onClick={() => void purge(item)}>
                  Endgültig
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Bildschirm                                                         */
/* ================================================================== */

export function WaitlistScreen() {
  const navigate = useNavigate();
  const toast = useToast();

  const all = useLiveQuery(() => db.interests.toArray(), []);
  const notes = useLiveQuery(() => db.interestNotes.toArray(), []);
  const broadcast = useLiveQuery(() => loadBroadcastRun(), []);
  // Bewusst direkt gelesen statt über getSettings(): getSettings legt beim
  // allerersten Start die Vorgaben an, und Dexie verbietet Schreibvorgänge
  // innerhalb einer liveQuery.
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);

  const [filter, setFilter] = useState<WaitlistFilter>(EMPTY_FILTER);
  const [newOpen, setNewOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<ID | null>(null);
  /** Reihenfolge direkt nach dem Ablegen, bis die Datenbank nachgezogen hat. */
  const [pendingOrder, setPendingOrder] = useState<ID[] | null>(null);
  const dragTouchedAt = useRef(0);

  // Fällige Papierkorb-Einträge beim Betreten der Liste aufräumen.
  useEffect(() => {
    void purgeExpiredTrash();
  }, []);

  const active = useMemo(
    () => (all ? sortWaitlist(all.filter((i) => !i.deletedAt)) : undefined),
    [all],
  );
  const trashed = useMemo(
    () =>
      all
        ? all
            .filter((i) => i.deletedAt)
            .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
        : undefined,
    [all],
  );

  const lastContactByInterest = useMemo(() => {
    const map = new Map<ID, string>();
    if (!notes) return map;
    for (const n of notes) {
      const current = map.get(n.interestId);
      if (!current || n.at.localeCompare(current) > 0) map.set(n.interestId, n.at);
    }
    return map;
  }, [notes]);

  const filtered = useMemo(
    () => (active ? filterInterests(active, filter) : undefined),
    [active, filter],
  );

  /** Nach dem Ablegen zeigt die Liste sofort die neue Reihenfolge. */
  const shown = useMemo(() => {
    if (!filtered) return undefined;
    if (!pendingOrder) return filtered;
    const byId = new Map(filtered.map((i) => [i.id, i]));
    const out: Interest[] = [];
    for (const id of pendingOrder) {
      const item = byId.get(id);
      if (item) {
        out.push(item);
        byId.delete(id);
      }
    }
    for (const rest of byId.values()) out.push(rest);
    return out;
  }, [filtered, pendingOrder]);

  useEffect(() => {
    if (!pendingOrder || !filtered) return;
    if (filtered.map((i) => i.id).join('|') === pendingOrder.join('|')) setPendingOrder(null);
  }, [filtered, pendingOrder]);

  // Beim Filtern gilt die zwischengespeicherte Reihenfolge nicht mehr —
  // sie bezieht sich immer auf die vollständige Liste.
  useEffect(() => {
    setPendingOrder(null);
  }, [filter]);

  const filterActive = isFilterActive(filter);
  const canSort = !filterActive && (shown?.length ?? 0) > 1;

  const sensors = useSensors(
    // Verzögerung vor dem Aufnehmen — sonst nimmt jede Wischbewegung
    // beim Scrollen versehentlich eine Zeile mit.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    dragTouchedAt.current = Date.now();
    setDraggingId(String(event.active.id));
    // Spürbare Rückmeldung, sofern das Gerät sie kennt.
    if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
  }

  async function handleDragEnd(event: DragEndEvent) {
    dragTouchedAt.current = Date.now();
    setDraggingId(null);
    const { active: dragged, over } = event;
    if (!over || !shown || dragged.id === over.id) return;

    const from = shown.findIndex((i) => i.id === dragged.id);
    const to = shown.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;

    const updates = moveAndResequence(shown, from, to);
    const nextOrder = [...shown];
    const [moved] = nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, moved);
    setPendingOrder(nextOrder.map((i) => i.id));

    try {
      await applySortUpdates(updates);
    } catch {
      setPendingOrder(null);
      toast.error('Die neue Reihenfolge ließ sich nicht speichern.');
    }
  }

  function openInterest(id: ID) {
    // Nach einem Ziehen darf der abschließende Fingerkontakt nicht als
    // Antippen durchgehen.
    if (Date.now() - dragTouchedAt.current < 400) return;
    navigate(`/warteliste/${id}`);
  }

  // Erst zeigen, wenn auch der Verlauf da ist — sonst stünde einen Wimpernschlag
  // lang „noch kein Kontakt" bei Leuten, mit denen längst geredet wurde.
  const loading = all === undefined || notes === undefined;
  const template = settings?.whatsappTemplate ?? DEFAULT_SETTINGS.whatsappTemplate ?? '';

  const toolbar = (
    <Stack gap="sm">
      <TextInput
        type="search"
        aria-label="Warteliste durchsuchen"
        placeholder="Name oder Notiz suchen"
        value={filter.query}
        onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
      />
      <ChipRow label="Wunschgeschlecht und Status">
        {(
          [
            ['all', 'Alle'],
            ['male', 'Kater'],
            ['female', 'Katze'],
          ] as [SexFilter, string][]
        ).map(([value, label]) => (
          <Chip
            key={value}
            active={filter.sex === value}
            onClick={() => setFilter((f) => ({ ...f, sex: value }))}
          >
            {label}
          </Chip>
        ))}
        <ChipDivider />
        {(['all', ...STATUS_CHAIN] as StatusFilter[]).map((value) => (
          <Chip
            key={value}
            active={filter.status === value}
            onClick={() => setFilter((f) => ({ ...f, status: value }))}
          >
            {value === 'all' ? 'Jeder Status' : INTEREST_STATUS_LABEL[value as InterestStatus]}
          </Chip>
        ))}
      </ChipRow>
    </Stack>
  );

  return (
    <Screen
      title="Warteliste"
      subtitle={
        active === undefined
          ? undefined
          : active.length === 0
            ? 'noch niemand eingetragen'
            : `${active.length} ${active.length === 1 ? 'Interessent' : 'Interessenten'}`
      }
      toolbar={toolbar}
      actions={
        <IconButton
          icon="whatsapp"
          label="Sammelnachricht"
          onClick={() => (broadcast ? setRunOpen(true) : setComposeOpen(true))}
        />
      }
    >
      <Stack gap="md">
        {broadcast && <BroadcastBanner run={broadcast} onOpen={() => setRunOpen(true)} />}

        {loading && <LoadingList label="Warteliste wird geladen …" />}

        {!loading && active && active.length === 0 && (
          <EmptyState
            icon="users"
            title="Noch niemand auf der Warteliste"
            description="Hier stehen die Leute, die ein Kitten möchten — mit allem, was ihr besprochen habt. Meist sind es drei bis vier gleichzeitig."
            action={
              <Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>
                Ersten Interessenten anlegen
              </Button>
            }
          />
        )}

        {!loading && active && active.length > 0 && shown && shown.length === 0 && (
          <EmptyState
            icon="search"
            title="Nichts gefunden"
            description="Zu dieser Suche und diesen Filtern passt gerade niemand."
            action={
              <Button icon="x" onClick={() => setFilter(EMPTY_FILTER)}>
                Filter zurücksetzen
              </Button>
            }
          />
        )}

        {!loading && shown && shown.length > 0 && (
          <>
            {filterActive && (
              <Callout tone="neutral" icon="info">
                Solange gefiltert wird, lässt sich die Reihenfolge nicht ändern — sonst würden
                ausgeblendete Einträge mitverschoben.
              </Callout>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={(e) => void handleDragEnd(e)}
              onDragCancel={() => {
                dragTouchedAt.current = Date.now();
                setDraggingId(null);
              }}
            >
              <SortableContext
                items={shown.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  className={[
                    'overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]',
                    draggingId ? 'overflow-visible' : '',
                  ].join(' ')}
                >
                  {shown.map((item) => (
                    <InterestRow
                      key={item.id}
                      interest={item}
                      lastContact={lastContactByInterest.get(item.id)}
                      sortable={canSort}
                      onOpen={() => openInterest(item.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {canSort && (
              <p className="px-1 text-[0.8rem] text-text-faint">
                Zum Umsortieren eine Zeile kurz gedrückt halten und verschieben. Die Reihenfolge ist
                ein Hinweis, kein Versprechen.
              </p>
            )}
          </>
        )}

        {trashed && trashed.length > 0 && <TrashSection items={trashed} />}
      </Stack>

      <Fab label="Interessent anlegen" onClick={() => setNewOpen(true)} />

      <InterestSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(created) => navigate(`/warteliste/${created.id}`)}
      />

      <BroadcastComposeSheet
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        interests={active ?? []}
        template={template}
        onStarted={() => setRunOpen(true)}
      />

      {broadcast && (
        <BroadcastRunSheet open={runOpen} onClose={() => setRunOpen(false)} run={broadcast} />
      )}
    </Screen>
  );
}
