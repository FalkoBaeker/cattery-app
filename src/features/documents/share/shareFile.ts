/**
 * Datei teilen — mit Rückfallweg.
 *
 * Auf dem iPhone öffnet `navigator.share` das Teilen-Blatt von iOS, aus dem
 * WhatsApp direkt erreichbar ist. Wo das nicht geht (Rechner, älteres Safari,
 * Datei-Typ nicht erlaubt), wird die Datei heruntergeladen. Auf keinen Fall
 * darf der Knopf einfach nichts tun.
 */

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Löst einen Download aus. Die Objekt-URL wird sofort wieder freigegeben. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari braucht die URL noch einen Moment, bevor der Download startet.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(file: File): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return true;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Teilt die Datei über das System-Blatt; klappt das nicht, wird sie
 * heruntergeladen. `cancelled` heißt: die Nutzerin hat abgebrochen — dann
 * bitte keine Fehlermeldung zeigen.
 */
export async function shareOrDownload(
  blob: Blob,
  fileName: string,
  title?: string,
  text?: string,
): Promise<ShareOutcome> {
  const file = new File([blob], fileName, {
    type: blob.type || 'application/octet-stream',
    lastModified: Date.now(),
  });

  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Alles andere: still auf den Download ausweichen.
    }
  }

  downloadBlob(blob, fileName);
  return 'downloaded';
}
