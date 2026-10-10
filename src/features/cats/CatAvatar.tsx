import { initials } from '../../lib/format';
import { useAttachmentUrl } from './hooks';
import type { ID } from '../../types';
import { BrandImage } from '../../ui/BrandImage';

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
      className="pearl-panel relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] border border-border bg-surface-2 font-semibold text-text-dim"
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
        <>
          <BrandImage name="breeding" className="size-[88%]" />
          <span aria-hidden="true" className="absolute right-0 bottom-0 flex min-w-4 items-center justify-center rounded-tl-md bg-surface/95 px-0.5 text-[0.6rem] leading-4 font-semibold text-accent">{initials(name) || '?'}</span>
        </>
      )}
    </span>
  );
}
