/**
 * Bildverarbeitung im Browser — Canvas, sonst nichts.
 *
 * Ablauf beim Speichern einer Seite, immer in dieser Reihenfolge:
 *   1. drehen (0/90/180/270)
 *   2. zuschneiden
 *   3. auf die längste Kante verkleinern
 *   4. Helligkeit und Kontrast über eine Nachschlagetabelle anheben
 *   5. als JPEG ausgeben
 *
 * Alles in einem einzigen Zeichenschritt: ein zweites Zwischenbild in voller
 * Auflösung wäre auf dem iPhone rund 50 MB Arbeitsspeicher.
 *
 * Die Rechnerei dahinter steht in `lib/imaging.ts` und ist dort geprüft.
 */

import {
  buildToneLut,
  cropToPixels,
  isNeutralTone,
  JPEG_QUALITY,
  MAX_EDGE,
  rotatedSize,
  scaleToFit,
  type CropRect,
  type Rotation,
  type Size,
  type ToneSettings,
} from './lib/imaging';

/* ------------------------------------------------------------------ */
/*  Laden                                                              */
/* ------------------------------------------------------------------ */

export interface LoadedImage extends Size {
  source: CanvasImageSource;
  /** Gibt Bitmap bzw. Objekt-URL wieder frei. Immer aufrufen. */
  release: () => void;
}

/**
 * Lädt ein Bild aus einem Blob. Bevorzugt `createImageBitmap`, weil das die
 * EXIF-Ausrichtung des iPhones direkt anwendet — ohne das liegen Fotos auf
 * dem Kopf. Fällt sonst auf ein `<img>` zurück.
 */
export async function loadImage(blob: Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Manche HEIC-Varianten mag Safari nicht — dann der Weg über <img>.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/*  Zeichnen                                                           */
/* ------------------------------------------------------------------ */

export interface ProcessOptions {
  rotation: Rotation;
  crop: CropRect;
  tone: ToneSettings;
  maxEdge?: number;
  quality?: number;
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Die Bildbearbeitung ist auf diesem Gerät nicht verfügbar.');
  return ctx;
}

/**
 * Zeichnet Quelle → Zielcanvas mit Drehung, Zuschnitt und Skalierung.
 * Gibt die tatsächlich gezeichnete Größe zurück.
 */
export function drawTransformed(
  canvas: HTMLCanvasElement,
  image: LoadedImage,
  rotation: Rotation,
  crop: CropRect,
  maxEdge: number,
): Size {
  const rotated = rotatedSize({ width: image.width, height: image.height }, rotation);
  const px = cropToPixels(crop, rotated);
  const out = scaleToFit({ width: px.w, height: px.h }, maxEdge);

  canvas.width = Math.max(1, out.width);
  canvas.height = Math.max(1, out.height);

  const ctx = contextOf(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  // Ausgabe → Zuschnitt → gedrehtes Bild → Originalbild.
  ctx.scale(canvas.width / px.w, canvas.height / px.h);
  ctx.translate(-px.x, -px.y);

  switch (rotation) {
    case 90:
      ctx.translate(rotated.width, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 180:
      ctx.translate(rotated.width, rotated.height);
      ctx.rotate(Math.PI);
      break;
    case 270:
      ctx.translate(0, rotated.height);
      ctx.rotate(-Math.PI / 2);
      break;
    default:
      break;
  }

  ctx.drawImage(image.source, 0, 0, image.width, image.height);
  ctx.restore();

  return { width: canvas.width, height: canvas.height };
}

/** Wendet Helligkeit und Kontrast auf den bereits gezeichneten Canvas an. */
export function applyTone(canvas: HTMLCanvasElement, tone: ToneSettings): void {
  if (isNeutralTone(tone)) return;
  if (canvas.width === 0 || canvas.height === 0) return;

  const ctx = contextOf(canvas);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const lut = buildToneLut(tone.brightness, tone.contrast);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = lut[px[i]];
    px[i + 1] = lut[px[i + 1]];
    px[i + 2] = lut[px[i + 2]];
  }
  ctx.putImageData(data, 0, 0);
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/jpeg',
  quality = JPEG_QUALITY,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Das Bild konnte nicht gespeichert werden.'));
      },
      type,
      quality,
    );
  });
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Verarbeitet einen Foto-Blob zu einem gespeicherten JPEG. Das ist der Weg,
 * über den jede Seite in die Datenbank kommt — nie das Originalfoto.
 */
export async function processImage(blob: Blob, options: ProcessOptions): Promise<ProcessedImage> {
  const image = await loadImage(blob);
  try {
    const canvas = document.createElement('canvas');
    const size = drawTransformed(
      canvas,
      image,
      options.rotation,
      options.crop,
      options.maxEdge ?? MAX_EDGE,
    );
    applyTone(canvas, options.tone);
    const out = await canvasToBlob(canvas, 'image/jpeg', options.quality ?? JPEG_QUALITY);
    // Canvas möglichst früh freigeben — iOS hält Zeichenflächen sonst lange.
    canvas.width = 0;
    canvas.height = 0;
    return { blob: out, width: size.width, height: size.height };
  } finally {
    image.release();
  }
}

/** Kleines Vorschaubild für Listen. */
export async function makeThumbnail(blob: Blob, edge = 320): Promise<Blob> {
  const result = await processImage(blob, {
    rotation: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    tone: { brightness: 0, contrast: 0 },
    maxEdge: edge,
    quality: 0.7,
  });
  return result.blob;
}
