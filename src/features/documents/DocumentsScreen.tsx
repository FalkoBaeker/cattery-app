/**
 * Bildschirm „Dokumente" (Route /mehr/dokumente).
 *
 * Alles wird abfotografiert (F91): Stammbäume, Impfpässe, Testergebnisse,
 * Verträge, Rechnungen. Wichtig ist vor allem eins — der Impfpass muss
 * offline und in Vollbild zu zeigen sein (F93).
 */

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Callout, EmptyState, Fab, Icon, List, Screen, Section, Spinner, TextInput } from '../../ui';
import { db, storageEstimate } from '../../db/db';
import { DOCUMENT_KIND_LABEL, kittenLabel, type DocumentKind, type ID } from '../../types';
import { formatBytes } from '../../lib/format';
import { formatDate } from '../../lib/date';
import { DocumentEditorSheet } from './DocumentEditorSheet';
import { DocumentViewer } from './DocumentViewer';
import { DocumentRow } from './DocumentRow';

type Filter = DocumentKind | 'all';

const KIND_ORDER: DocumentKind[] = [
  'vaccination_card',
  'pedigree',
  'health_test',
  'contract',
  'invoice',
  'other',
];

export function DocumentsScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<ID | undefined>();
  const [viewId, setViewId] = useState<ID | null>(null);

  const docs = useLiveQuery(() => db.documents.toArray(), []);
  const context = useLiveQuery(async () => {
    const [cats, kittens, litters, interests] = await Promise.all([
      db.cats.toArray(),
      db.kittens.toArray(),
      db.litters.toArray(),
      db.interests.toArray(),
    ]);
    return { cats, kittens, litters, interests };
  }, []);

  /* --- Speicherbelegung ------------------------------------------------ */

  const [storage, setStorage] = useState<{ usage: number; quota: number } | null | undefined>(
    undefined,
  );
  useEffect(() => {
    let cancelled = false;
    void storageEstimate().then((value) => {
      if (!cancelled) setStorage(value);
    });
    return () => {
      cancelled = true;
    };
  }, [docs]);

  /* --- Beschriftung der Verknüpfung ------------------------------------ */

  const labelFor = useMemo(() => {
    if (!context) return () => undefined as string | undefined;
    const cats = new Map(context.cats.map((c) => [c.id, c.callName]));
    const kittens = new Map(context.kittens.map((k) => [k.id, kittenLabel(k)]));
    const litters = new Map(
      context.litters.map((l) => {
        const mother = cats.get(l.motherId) ?? 'Wurf';
        const date = l.birthDate ?? l.dueDate;
        return [l.id, date ? `${mother}, ${formatDate(date)}` : mother] as const;
      }),
    );
    const interests = new Map(context.interests.map((i) => [i.id, i.name]));

    return (doc: { catId?: ID; kittenId?: ID; litterId?: ID; interestId?: ID }) =>
      (doc.kittenId && kittens.get(doc.kittenId)) ||
      (doc.catId && cats.get(doc.catId)) ||
      (doc.litterId && litters.get(doc.litterId)) ||
      (doc.interestId && interests.get(doc.interestId)) ||
      undefined;
  }, [context]);

  /* --- Filtern und Gruppieren ------------------------------------------ */

  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!docs) return undefined;
    return docs
      .filter((doc) => (filter === 'all' ? true : doc.kind === filter))
      .filter((doc) => {
        if (!needle) return true;
        const haystack = [doc.title, DOCUMENT_KIND_LABEL[doc.kind], labelFor(doc) ?? '', doc.notes ?? '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [docs, filter, needle, labelFor]);

  const groups = useMemo(() => {
    if (!visible) return undefined;
    return KIND_ORDER.map((kind) => ({
      kind,
      items: visible.filter((doc) => doc.kind === kind),
    })).filter((group) => group.items.length > 0);
  }, [visible]);

  const availableKinds = useMemo(() => {
    if (!docs) return [];
    return KIND_ORDER.filter((kind) => docs.some((doc) => doc.kind === kind));
  }, [docs]);

  function openNew() {
    setEditId(undefined);
    setEditorOpen(true);
  }

  const loading = docs === undefined;
  const empty = !loading && docs.length === 0;

  return (
    <Screen
      title="Dokumente"
      back
      subtitle={docs ? `${docs.length} ${docs.length === 1 ? 'Eintrag' : 'Einträge'}` : undefined}
      toolbar={
        empty ? undefined : (
          <div className="flex flex-col gap-2">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen …"
              inputMode="search"
              aria-label="Dokumente durchsuchen"
            />
            {availableKinds.length > 1 && (
              <div className="scroll-x no-scrollbar -mx-1 flex gap-1.5 px-1 pb-0.5">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                  Alle
                </FilterChip>
                {availableKinds.map((kind) => (
                  <FilterChip
                    key={kind}
                    active={filter === kind}
                    onClick={() => setFilter(filter === kind ? 'all' : kind)}
                  >
                    {DOCUMENT_KIND_LABEL[kind]}
                  </FilterChip>
                ))}
              </div>
            )}
          </div>
        )
      }
    >
      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-text-dim">
          <Spinner size={26} />
        </div>
      ) : empty ? (
        <div className="flex flex-col gap-4">
          <EmptyState
            icon="camera"
            title="Noch keine Dokumente"
            description="Fotografiere Impfpässe, Stammbäume, Testergebnisse und Rechnungen ab. Dann hast du sie beim Tierarzt dabei — auch ohne Netz."
            action={
              <Button variant="primary" icon="camera" onClick={openNew}>
                Erstes Dokument aufnehmen
              </Button>
            }
          />
          <Callout tone="neutral" icon="info" title="Warum das hilft">
            Der Impfpass liegt zu Hause, der Termin ist jetzt: In der App liegt er in
            Vollbild bereit und lässt sich vergrößern.
          </Callout>
        </div>
      ) : visible && visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nichts gefunden"
          description={
            needle
              ? `Zu „${query.trim()}" gibt es keinen Eintrag. Vielleicht hilft ein anderes Wort.`
              : 'In dieser Art liegt noch nichts. Nimm ein Dokument auf oder wähle „Alle".'
          }
          action={
            <Button
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Auswahl zurücksetzen
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups?.map((group) => (
            <Section key={group.kind} title={DOCUMENT_KIND_LABEL[group.kind]}>
              <List>
                {group.items.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    contextLabel={labelFor(doc)}
                    onOpen={() => {
                      if (doc.pageIds.length === 0) {
                        setEditId(doc.id);
                        setEditorOpen(true);
                      } else {
                        setViewId(doc.id);
                      }
                    }}
                    onEdit={() => {
                      setEditId(doc.id);
                      setEditorOpen(true);
                    }}
                  />
                ))}
              </List>
            </Section>
          ))}

          <StorageNote storage={storage} />
        </div>
      )}

      {!empty && <Fab icon="camera" label="Dokument aufnehmen" onClick={openNew} />}

      <DocumentEditorSheet
        open={editorOpen}
        documentId={editId}
        onClose={() => {
          setEditorOpen(false);
          setEditId(undefined);
        }}
      />

      {viewId && <DocumentViewer documentId={viewId} onClose={() => setViewId(null)} />}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'min-h-11 shrink-0 rounded-full border px-3.5 text-[0.85rem] font-medium whitespace-nowrap',
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border bg-surface text-text-dim active:bg-surface-2',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function StorageNote({ storage }: { storage: { usage: number; quota: number } | null | undefined }) {
  if (storage === undefined) return null;
  if (storage === null) {
    return (
      <p className="px-1 text-[0.8rem] text-text-faint">
        Der belegte Speicher lässt sich auf diesem Gerät nicht auslesen.
      </p>
    );
  }

  const percent = storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;
  const tight = percent >= 80;

  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex items-center justify-between text-[0.8rem] text-text-dim">
        <span className="flex items-center gap-1.5">
          <Icon name="folder" size={15} />
          Belegter Speicher
        </span>
        <span className="tabular">
          {formatBytes(storage.usage)}
          {storage.quota > 0 && ` von ${formatBytes(storage.quota)}`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={['h-full rounded-full', tight ? 'bg-warn' : 'bg-accent'].join(' ')}
          style={{ width: `${Math.max(percent, 1)}%` }}
        />
      </div>
      {tight && (
        <p className="text-[0.8rem] text-warn">
          Der Speicher wird knapp. Alte Aufnahmen löschen schafft Platz.
        </p>
      )}
    </div>
  );
}
