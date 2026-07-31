/**
 * Dokument anlegen und bearbeiten.
 *
 * Erfassen läuft über `<input type="file" accept="image/*" capture>` — auf
 * iOS der verlässliche Weg zur Kamera. Jede Seite wird sofort verkleinert
 * (längste Kante 2000 px, JPEG 0,8); das Originalfoto bleibt in der Galerie.
 *
 * Pflichtfeld ist ausschließlich der Titel. Art, Verknüpfung, Notiz und sogar
 * die Seiten dürfen leer bleiben — auch für immer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Callout,
  ChoiceGrid,
  IconButton,
  List,
  ListRow,
  Section,
  Select,
  Sheet,
  Spinner,
  Switch,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { db, insert, patch, putAttachment, remove } from '../../db/db';
import {
  DOCUMENT_KIND_LABEL,
  kittenLabel,
  type DocumentKind,
  type DocumentRec,
  type ID,
} from '../../types';
import { formatBytes } from '../../lib/format';
import { formatDate } from '../../lib/date';
import { newId } from '../../lib/id';
import { processImage } from './imageProcessing';
import { PageEditor } from './PageEditor';

export interface DocumentLinks {
  catId?: ID;
  kittenId?: ID;
  litterId?: ID;
  interestId?: ID;
}

export interface DocumentEditorSheetProps {
  open: boolean;
  onClose: () => void;
  /** Vorhandenes Dokument bearbeiten. */
  documentId?: ID;
  /** Vorbelegung beim Anlegen. */
  defaults?: DocumentLinks & { kind?: DocumentKind; title?: string };
  /** Beim Öffnen direkt die Kamera anbieten. */
  startWithCamera?: boolean;
  onSaved?: (id: ID) => void;
}

interface EditorPage {
  key: string;
  attachmentId?: ID;
  blob: Blob;
  width?: number;
  height?: number;
  url: string;
  dirty: boolean;
}

const KIND_OPTIONS = (Object.keys(DOCUMENT_KIND_LABEL) as DocumentKind[]).map((k) => ({
  value: k,
  label: DOCUMENT_KIND_LABEL[k],
}));

export function DocumentEditorSheet({
  open,
  onClose,
  documentId,
  defaults,
  startWithCamera,
  onSaved,
}: DocumentEditorSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<EditorPage[]>([]);
  // Für Wettläufe: die Kamera-Verarbeitung kann fertig werden, nachdem das
  // Blatt schon geschlossen wurde — dann dürfen keine Seiten mehr in den
  // Zustand wandern, sonst lecken ihre Objekt-URLs bis zum nächsten Öffnen.
  const openRef = useRef(false);

  const [kind, setKind] = useState<DocumentKind>(defaults?.kind ?? 'vaccination_card');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [links, setLinks] = useState<DocumentLinks>({});
  const [customerVisible, setCustomerVisible] = useState(false);
  const [notes, setNotes] = useState('');
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [removedAttachments, setRemovedAttachments] = useState<ID[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [editingKey, setEditingKey] = useState<string | null>(null);

  pagesRef.current = pages;
  openRef.current = open;

  /* --- Auswahllisten -------------------------------------------------- */

  const options = useLiveQuery(async () => {
    const [cats, litters, kittens, interests] = await Promise.all([
      db.cats.toArray(),
      db.litters.toArray(),
      db.kittens.toArray(),
      db.interests.toArray(),
    ]);
    return { cats, litters, kittens, interests };
  }, []);

  const litterLabel = useMemo(() => {
    const map = new Map<ID, string>();
    if (!options) return map;
    const catName = new Map(options.cats.map((c) => [c.id, c.callName]));
    for (const litter of options.litters) {
      const mother = catName.get(litter.motherId) ?? 'Wurf';
      const date = litter.birthDate ?? litter.dueDate;
      map.set(litter.id, date ? `${mother}, ${formatDate(date)}` : mother);
    }
    return map;
  }, [options]);

  /* --- Laden ---------------------------------------------------------- */

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const created: string[] = [];
    setLoaded(false);
    setTitleError(undefined);
    setRemovedAttachments([]);

    async function load() {
      if (!documentId) {
        setKind(defaults?.kind ?? 'vaccination_card');
        setTitle(defaults?.title ?? '');
        setTitleTouched(Boolean(defaults?.title));
        setLinks({
          catId: defaults?.catId,
          kittenId: defaults?.kittenId,
          litterId: defaults?.litterId,
          interestId: defaults?.interestId,
        });
        setCustomerVisible(defaults?.kind === 'pedigree');
        setNotes('');
        setPages([]);
        setLoaded(true);
        return;
      }

      const doc = await db.documents.get(documentId);
      if (cancelled) return;
      if (!doc) {
        toast.error('Das Dokument gibt es nicht mehr.');
        onClose();
        return;
      }

      const attachments = await Promise.all(doc.pageIds.map((id) => db.attachments.get(id)));
      if (cancelled) return;

      const loadedPages: EditorPage[] = [];
      for (const attachment of attachments) {
        if (!attachment) continue;
        const url = URL.createObjectURL(attachment.blob);
        created.push(url);
        loadedPages.push({
          key: attachment.id,
          attachmentId: attachment.id,
          blob: attachment.blob,
          width: attachment.width,
          height: attachment.height,
          url,
          dirty: false,
        });
      }

      setKind(doc.kind);
      setTitle(doc.title);
      setTitleTouched(true);
      setLinks({
        catId: doc.catId,
        kittenId: doc.kittenId,
        litterId: doc.litterId,
        interestId: doc.interestId,
      });
      setCustomerVisible(doc.customerVisible);
      setNotes(doc.notes ?? '');
      setPages(loadedPages);
      setLoaded(true);
    }

    void load();

    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
    // `defaults` ist ein Objektliteral aus dem Aufrufer und ändert sich bei
    // jedem Rendern — bewusst nur beim Öffnen auswerten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  // Beim Schließen alle selbst erzeugten Objekt-URLs freigeben.
  useEffect(() => {
    if (open) return;
    for (const page of pagesRef.current) URL.revokeObjectURL(page.url);
    setPages([]);
  }, [open]);

  useEffect(() => {
    return () => {
      for (const page of pagesRef.current) URL.revokeObjectURL(page.url);
    };
  }, []);

  // Direkt die Kamera öffnen, wenn der Aufrufer das so wollte.
  useEffect(() => {
    if (open && loaded && startWithCamera && pagesRef.current.length === 0) {
      cameraInput.current?.click();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded]);

  /* --- Titelvorschlag -------------------------------------------------- */

  const suggestedTitle = useMemo(() => {
    const base = DOCUMENT_KIND_LABEL[kind];
    if (!options) return base;
    if (links.kittenId) {
      const kitten = options.kittens.find((k) => k.id === links.kittenId);
      if (kitten) return `${base} ${kittenLabel(kitten)}`;
    }
    if (links.catId) {
      const cat = options.cats.find((c) => c.id === links.catId);
      if (cat) return `${base} ${cat.callName}`;
    }
    if (links.interestId) {
      const interest = options.interests.find((i) => i.id === links.interestId);
      if (interest) return `${base} ${interest.name}`;
    }
    if (links.litterId) {
      const label = litterLabel.get(links.litterId);
      if (label) return `${base} ${label}`;
    }
    return base;
  }, [kind, links, options, litterLabel]);

  useEffect(() => {
    if (!titleTouched) setTitle(suggestedTitle);
  }, [suggestedTitle, titleTouched]);

  /* --- Seiten ---------------------------------------------------------- */

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    const added: EditorPage[] = [];
    let failed = 0;

    for (const file of Array.from(fileList)) {
      try {
        const result = await processImage(file, {
          rotation: 0,
          crop: { x: 0, y: 0, w: 1, h: 1 },
          tone: { brightness: 0, contrast: 0 },
        });
        added.push({
          key: newId(),
          blob: result.blob,
          width: result.width,
          height: result.height,
          url: URL.createObjectURL(result.blob),
          dirty: true,
        });
      } catch {
        failed += 1;
      }
    }

    // Wurde das Blatt inzwischen geschlossen, die fertigen Seiten wieder
    // wegwerfen — sonst tauchen sie beim nächsten Öffnen als Geister auf.
    if (!openRef.current) {
      for (const page of added) URL.revokeObjectURL(page.url);
      setBusy(false);
      return;
    }

    setPages((current) => [...current, ...added]);
    setBusy(false);

    if (failed > 0) {
      toast.error(
        failed === 1
          ? 'Eine Aufnahme konnte nicht gelesen werden.'
          : `${failed} Aufnahmen konnten nicht gelesen werden.`,
      );
    } else if (added.length > 0) {
      toast.success(added.length === 1 ? 'Seite hinzugefügt.' : `${added.length} Seiten hinzugefügt.`);
    }
  }

  function movePage(index: number, direction: -1 | 1) {
    setPages((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function removePage(index: number) {
    const page = pages[index];
    if (!page) return;
    const ok = await confirm({
      title: 'Seite entfernen?',
      message: 'Die Aufnahme wird beim Speichern gelöscht.',
      confirmLabel: 'Entfernen',
      danger: true,
    });
    if (!ok) return;
    if (page.attachmentId) setRemovedAttachments((list) => [...list, page.attachmentId!]);
    URL.revokeObjectURL(page.url);
    setPages((current) => current.filter((_, i) => i !== index));
  }

  function applyEdit(key: string, result: { blob: Blob; width: number; height: number }) {
    setPages((current) =>
      current.map((page) => {
        if (page.key !== key) return page;
        URL.revokeObjectURL(page.url);
        return {
          ...page,
          blob: result.blob,
          width: result.width,
          height: result.height,
          url: URL.createObjectURL(result.blob),
          dirty: true,
        };
      }),
    );
    setEditingKey(null);
  }

  /* --- Speichern ------------------------------------------------------- */

  async function onSave() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setTitleError('Bitte einen Titel angeben — das ist das einzige Pflichtfeld.');
      return;
    }

    setSaving(true);
    // Neu geschriebene Anhänge merken: schlägt das Speichern des Dokuments
    // danach fehl, werden sie wieder gelöscht — sonst bleiben verwaiste
    // Blobs in der Datenbank zurück.
    const written: ID[] = [];
    try {
      const pageIds: ID[] = [];
      for (const page of pages) {
        if (page.attachmentId && !page.dirty) {
          pageIds.push(page.attachmentId);
          continue;
        }
        const attachment = await putAttachment(page.blob, {
          width: page.width,
          height: page.height,
        });
        written.push(attachment.id);
        pageIds.push(attachment.id);
      }

      const data: Omit<DocumentRec, 'id' | 'createdAt' | 'updatedAt'> = {
        kind,
        title: cleanTitle,
        catId: links.catId,
        kittenId: links.kittenId,
        litterId: links.litterId,
        interestId: links.interestId,
        pageIds,
        customerVisible,
        notes: notes.trim() || undefined,
      };

      let savedId: ID;
      if (documentId) {
        await patch(db.documents, documentId, data);
        savedId = documentId;
      } else {
        const created = await insert(db.documents, data);
        savedId = created.id;
      }

      // Ersetzte und entfernte Aufnahmen wegräumen — sonst wächst die
      // Datenbank mit jeder Bearbeitung. Das Dokument selbst ist zu diesem
      // Zeitpunkt schon sicher gespeichert; scheitert nur das Aufräumen,
      // bleiben verwaiste Anhänge zurück, die die Wartung später einsammelt
      // (collectOrphanAttachments) — kein Grund, das Speichern als
      // gescheitert zu melden.
      try {
        const stale = new Set(removedAttachments);
        for (const page of pages) {
          if (page.attachmentId && page.dirty) stale.add(page.attachmentId);
        }
        for (const id of stale) {
          if (!pageIds.includes(id)) await remove(db.attachments, id);
        }
      } catch {
        // Bewusst still: siehe Kommentar oben.
      }

      toast.success(documentId ? 'Dokument gespeichert.' : 'Dokument angelegt.');
      onSaved?.(savedId);
      onClose();
    } catch {
      // Halb geschriebene Anhänge zurücknehmen, so gut es geht.
      for (const id of written) {
        try {
          await remove(db.attachments, id);
        } catch {
          // Bleibt einer stehen, sammelt ihn die Wartung ein.
        }
      }
      toast.error('Speichern nicht möglich. Vielleicht ist der Gerätespeicher voll.');
    } finally {
      setSaving(false);
    }
  }

  const totalBytes = pages.reduce((sum, page) => sum + page.blob.size, 0);
  const editingPage = pages.find((p) => p.key === editingKey) ?? null;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        tall
        title={documentId ? 'Dokument bearbeiten' : 'Dokument erfassen'}
        footer={
          <Button block variant="primary" onClick={onSave} loading={saving} disabled={busy}>
            Speichern
          </Button>
        }
      >
        {!loaded ? (
          <div className="flex min-h-40 items-center justify-center text-text-dim">
            <Spinner size={26} />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Seiten */}
            <Section
              title="Seiten"
              description={
                pages.length === 0
                  ? 'Noch keine Aufnahme'
                  : `${pages.length} ${pages.length === 1 ? 'Seite' : 'Seiten'} · ${formatBytes(totalBytes)}`
              }
            >
              {pages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {pages.map((page, index) => (
                    <div key={page.key} className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingKey(page.key)}
                        className="relative aspect-[3/4] overflow-hidden rounded-[var(--radius-field)] border border-border bg-surface-2"
                        aria-label={`Seite ${index + 1} bearbeiten`}
                      >
                        <img src={page.url} alt="" className="size-full object-cover" />
                        <span className="absolute bottom-1 left-1 min-w-5 rounded-md bg-black/70 px-1.5 py-px text-center text-[0.7rem] font-semibold text-white tabular">
                          {index + 1}
                        </span>
                      </button>
                      <div className="flex items-center justify-between">
                        {/* min-h-11: auch die kleinen Knöpfe brauchen 44 px Höhe. */}
                        <IconButton
                          icon="chevron-left"
                          label={`Seite ${index + 1} nach vorn`}
                          size="sm"
                          className="min-h-11"
                          disabled={index === 0}
                          onClick={() => movePage(index, -1)}
                        />
                        <IconButton
                          icon="trash"
                          label={`Seite ${index + 1} entfernen`}
                          size="sm"
                          variant="ghost"
                          className="min-h-11 text-alert"
                          onClick={() => void removePage(index)}
                        />
                        <IconButton
                          icon="chevron-right"
                          label={`Seite ${index + 1} nach hinten`}
                          size="sm"
                          className="min-h-11"
                          disabled={index === pages.length - 1}
                          onClick={() => movePage(index, 1)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  block
                  icon="camera"
                  loading={busy}
                  onClick={() => cameraInput.current?.click()}
                >
                  Aufnehmen
                </Button>
                <Button block icon="image" disabled={busy} onClick={() => libraryInput.current?.click()}>
                  Aus Galerie
                </Button>
              </div>

              {pages.length > 0 && (
                <p className="px-1 text-[0.8rem] text-text-faint">
                  Auf eine Seite tippen, um sie zuzuschneiden, zu drehen oder aufzuhellen.
                </p>
              )}

              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  void onFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={libraryInput}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void onFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </Section>

            {/* Angaben */}
            <ChoiceGrid<DocumentKind>
              label="Art"
              value={kind}
              onChange={setKind}
              options={KIND_OPTIONS}
              columns={2}
            />

            <TextInput
              label="Titel"
              required
              value={title}
              error={titleError}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
                if (titleError) setTitleError(undefined);
              }}
              placeholder={suggestedTitle}
            />

            <Section title="Verknüpfung" description="Alles freiwillig — ein Dokument darf für sich stehen.">
              <div className="flex flex-col gap-3">
                <Select
                  label="Katze"
                  placeholder="— keine —"
                  value={links.catId ?? ''}
                  onChange={(e) => setLinks((l) => ({ ...l, catId: e.target.value || undefined }))}
                  options={(options?.cats ?? []).map((c) => ({ value: c.id, label: c.callName }))}
                />
                <Select
                  label="Kitten"
                  placeholder="— keins —"
                  value={links.kittenId ?? ''}
                  onChange={(e) => setLinks((l) => ({ ...l, kittenId: e.target.value || undefined }))}
                  options={(options?.kittens ?? []).map((k) => ({
                    value: k.id,
                    label: `${kittenLabel(k)}${litterLabel.get(k.litterId) ? ` — ${litterLabel.get(k.litterId)}` : ''}`,
                  }))}
                />
                <Select
                  label="Wurf"
                  placeholder="— keiner —"
                  value={links.litterId ?? ''}
                  onChange={(e) => setLinks((l) => ({ ...l, litterId: e.target.value || undefined }))}
                  options={(options?.litters ?? []).map((l) => ({
                    value: l.id,
                    label: litterLabel.get(l.id) ?? 'Wurf',
                  }))}
                />
                <Select
                  label="Interessent"
                  placeholder="— keiner —"
                  value={links.interestId ?? ''}
                  onChange={(e) => setLinks((l) => ({ ...l, interestId: e.target.value || undefined }))}
                  options={(options?.interests ?? [])
                    .filter((i) => !i.deletedAt)
                    .map((i) => ({ value: i.id, label: i.name }))}
                />
              </div>
            </Section>

            <List>
              <Switch
                checked={customerVisible}
                onChange={setCustomerVisible}
                label="Für Interessenten sichtbar"
                description="Gedacht für die Stammbäume der Elterntiere."
              />
            </List>

            <TextArea
              label="Notiz"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Was man später wissen möchte …"
            />

            {pages.length === 0 && (
              <Callout tone="neutral" icon="info" title="Ohne Seiten geht es auch">
                Du kannst den Eintrag jetzt anlegen und die Aufnahmen später ergänzen.
              </Callout>
            )}

            {documentId && (
              <ListRow
                title="Dokument löschen"
                subtitle="Der Eintrag und alle Aufnahmen werden entfernt."
                danger
                chevron={false}
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Dokument löschen?',
                    message: `„${title}" und alle Aufnahmen werden endgültig gelöscht.`,
                    confirmLabel: 'Löschen',
                    danger: true,
                  });
                  if (!ok) return;
                  try {
                    // Erst den Eintrag löschen, dann die Anhänge: bricht es
                    // mittendrin ab, bleiben höchstens verwaiste Anhänge
                    // (die die Wartung einsammelt) — nie ein Dokument mit
                    // toten Verweisen.
                    const doc = await db.documents.get(documentId);
                    await remove(db.documents, documentId);
                    try {
                      for (const id of doc?.pageIds ?? []) await remove(db.attachments, id);
                    } catch {
                      // Der Eintrag ist weg — übrige Anhänge holt die Wartung.
                    }
                    toast.success('Dokument gelöscht.');
                    onClose();
                  } catch {
                    toast.error('Löschen nicht möglich. Bitte noch einmal versuchen.');
                  }
                }}
              />
            )}
          </div>
        )}
      </Sheet>

      <PageEditor
        open={editingPage !== null}
        blob={editingPage?.blob ?? null}
        onClose={() => setEditingKey(null)}
        onApply={(result) => editingKey && applyEdit(editingKey, result)}
      />
    </>
  );
}
