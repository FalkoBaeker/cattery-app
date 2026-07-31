/**
 * Der kurze Weg zum Dokument.
 *
 * Gedacht fürs Katzen- und Kittenprofil: ein Tipp, und der Impfpass liegt in
 * Vollbild vor — beim Tierarzt, ohne Netz. Gibt es noch keine Aufnahme,
 * führt derselbe Knopf direkt zur Kamera statt in eine Sackgasse.
 *
 * Andere Module binden ihn so ein:
 *
 *   <QuickDocButton kittenId={kitten.id} litterId={kitten.litterId}
 *                   kind="vaccination_card" block />
 */

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, List, ListRow, Sheet, type ButtonProps } from '../../ui';
import { db } from '../../db/db';
import { DOCUMENT_KIND_LABEL, type DocumentKind, type ID } from '../../types';
import { DocumentEditorSheet } from './DocumentEditorSheet';
import { DocumentViewer } from './DocumentViewer';
import { PageThumb } from './DocumentRow';

export interface QuickDocButtonProps {
  catId?: ID;
  kittenId?: ID;
  litterId?: ID;
  interestId?: ID;
  /** Ohne Angabe zählen alle Arten. */
  kind?: DocumentKind;
  /** Eigene Beschriftung; sonst die Bezeichnung der Art. */
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  block?: boolean;
  /** Auch dann anzeigen, wenn es noch nichts gibt (Vorgabe: ja). */
  showWhenEmpty?: boolean;
}

export function QuickDocButton({
  catId,
  kittenId,
  litterId,
  interestId,
  kind,
  label,
  variant = 'secondary',
  size = 'md',
  block,
  showWhenEmpty = true,
}: QuickDocButtonProps) {
  const [viewId, setViewId] = useState<ID | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  const all = useLiveQuery(() => db.documents.toArray(), []);

  const matches = useMemo(() => {
    if (!all) return undefined;
    return all
      .filter((doc) => (kind ? doc.kind === kind : true))
      .filter(
        (doc) =>
          (catId != null && doc.catId === catId) ||
          (kittenId != null && doc.kittenId === kittenId) ||
          (litterId != null && doc.litterId === litterId) ||
          (interestId != null && doc.interestId === interestId),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [all, kind, catId, kittenId, litterId, interestId]);

  const name = label ?? (kind ? DOCUMENT_KIND_LABEL[kind] : 'Dokumente');
  const count = matches?.length ?? 0;

  const defaults = { catId, kittenId, litterId, interestId, kind };

  if (matches === undefined) {
    return (
      <Button variant={variant} size={size} block={block} loading disabled>
        {name}
      </Button>
    );
  }

  if (count === 0 && !showWhenEmpty) return null;

  function onClick() {
    if (count === 0) setCaptureOpen(true);
    else if (count === 1) setViewId(matches![0].id);
    else setPickerOpen(true);
  }

  return (
    <>
      <Button
        variant={count === 0 ? 'secondary' : variant}
        size={size}
        block={block}
        icon={count === 0 ? 'camera' : 'document'}
        onClick={onClick}
      >
        {count === 0 ? `${name} aufnehmen` : count === 1 ? `${name} zeigen` : `${name} (${count})`}
      </Button>

      {viewId && <DocumentViewer documentId={viewId} onClose={() => setViewId(null)} />}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={name}>
        <List>
          {matches.map((doc) => (
            <ListRow
              key={doc.id}
              leading={<PageThumb attachmentId={doc.pageIds[0]} />}
              title={doc.title}
              subtitle={`${DOCUMENT_KIND_LABEL[doc.kind]} · ${doc.pageIds.length === 1 ? '1 Seite' : `${doc.pageIds.length} Seiten`}`}
              onClick={() => {
                setPickerOpen(false);
                setViewId(doc.id);
              }}
            />
          ))}
        </List>
        <div className="mt-4">
          <Button
            block
            icon="camera"
            onClick={() => {
              setPickerOpen(false);
              setCaptureOpen(true);
            }}
          >
            Weitere Seite aufnehmen
          </Button>
        </div>
      </Sheet>

      <DocumentEditorSheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        defaults={defaults}
        startWithCamera
        onSaved={async (id) => {
          // Nur zeigen, wenn wirklich eine Aufnahme dabei ist.
          const saved = await db.documents.get(id);
          if (saved && saved.pageIds.length > 0) setViewId(id);
        }}
      />
    </>
  );
}
