/**
 * Bilder verkleinern, bevor sie in die Datenbank wandern.
 *
 * Ein Foto aus dem iPhone hat leicht 4 MB. Für ein Profilbild reicht die
 * lange Kante von 1200 Punkten — sonst füllt sich der Gerätespeicher, und
 * iOS wirft im Zweifel die ganze Datenbank weg.
 *
 * Läuft die Umwandlung schief (alter Browser, ungewöhnliches Format), wird
 * die Datei unverändert zurückgegeben. Lieber groß als gar nicht.
 */

export interface ScaledImage {
  blob: Blob;
  width?: number;
  height?: number;
}

export async function downscaleImage(
  file: Blob,
  maxEdge = 1200,
  quality = 0.82,
): Promise<ScaledImage> {
  try {
    if (typeof createImageBitmap !== 'function') return { blob: file };
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file };
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    return out ? { blob: out, width, height } : { blob: file };
  } catch {
    return { blob: file };
  }
}
