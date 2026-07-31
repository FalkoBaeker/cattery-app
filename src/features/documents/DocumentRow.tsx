/**
 * Eine Zeile in der Dokumentliste.
 *
 * Bewusst zweigeteilt: die große Fläche öffnet den Betrachter (der häufige
 * Fall — „zeig mir den Impfpass"), der kleine Knopf rechts öffnet die
 * Bearbeitung. Beide Ziele sind mindestens 44 px hoch.
 */

import { Badge, Icon, IconButton } from '../../ui';
import { DOCUMENT_KIND_LABEL, type DocumentRec } from '../../types';
import { useAttachmentUrl } from './useObjectUrls';

export function PageThumb({ attachmentId }: { attachmentId?: string }) {
  const { url, loading } = useAttachmentUrl(attachmentId);

  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[0.6rem] border border-border bg-surface-2 text-text-faint">
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : loading ? (
        <span className="size-full animate-pulse bg-surface-3" />
      ) : (
        <Icon name="document" size={20} />
      )}
    </span>
  );
}

export function DocumentRow({
  doc,
  contextLabel,
  onOpen,
  onEdit,
}: {
  doc: DocumentRec;
  contextLabel?: string;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const pageCount = doc.pageIds.length;
  const subtitleParts = [DOCUMENT_KIND_LABEL[doc.kind]];
  if (contextLabel) subtitleParts.push(contextLabel);
  subtitleParts.push(pageCount === 1 ? '1 Seite' : `${pageCount} Seiten`);

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2"
      >
        <PageThumb attachmentId={doc.pageIds[0]} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[0.97rem] font-medium text-text">{doc.title}</span>
          <span className="truncate text-[0.83rem] text-text-dim">{subtitleParts.join(' · ')}</span>
        </span>
        {doc.customerVisible && (
          <Badge tone="accent" icon="eye">
            sichtbar
          </Badge>
        )}
      </button>
      <span className="pr-2">
        {/* min-h/min-w 11: 44-px-Ziel trotz kleiner Optik. */}
        <IconButton
          icon="edit"
          label={`${doc.title} bearbeiten`}
          size="sm"
          className="min-h-11 min-w-11"
          onClick={onEdit}
        />
      </span>
    </div>
  );
}
