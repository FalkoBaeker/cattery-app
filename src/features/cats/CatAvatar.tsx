import { initials } from '../../lib/format';
import { useAttachmentUrl } from './hooks';
import type { ID } from '../../types';

/**
 * Bild der Katze — oder, solange keines da ist, ihre Initialen.
 * Fotos bleiben ansonsten in der iPhone-Galerie (F99); hier liegt nur das
 * eine Profilbild.
 */
export function CatAvatar({
  name,
  photoAttachmentId,
  size = 44,
}: {
  name: string;
  photoAttachmentId?: ID;
  size?: number;
}) {
  const url = useAttachmentUrl(photoAttachmentId);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] border border-border bg-surface-2 font-semibold text-text-dim"
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.36)) }}
    >
      {url ? (
        <img
          src={url}
          alt={`Foto von ${name}`}
          className="size-full object-cover"
          draggable={false}
        />
      ) : (
        <span aria-hidden="true">{initials(name) || '?'}</span>
      )}
    </span>
  );
}
