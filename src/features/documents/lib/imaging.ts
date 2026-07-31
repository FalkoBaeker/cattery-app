/**
 * Reine Rechenlogik für die Bildnachbearbeitung.
 *
 * Hier steckt kein Browser: keine Canvas, kein DOM. Damit lässt sich alles
 * prüfen, was erfahrungsgemäß schiefgeht — Seitenverhältnis, Hoch- und
 * Querformat, schon kleine Bilder, entartete Zuschnitte.
 *
 * Ein iPhone-Foto ist rund 4032 × 3024 Pixel und 4–5 MB groß. Ungefiltert
 * gespeichert wäre der Gerätespeicher nach wenigen Dokumenten voll. Deshalb
 * wird vor dem Speichern immer auf die längste Kante verkleinert.
 */

/** Längste Kante, auf die Fotos vor dem Speichern verkleinert werden. */
export const MAX_EDGE = 2000;

/** JPEG-Güte beim Speichern. 0,8 ist der übliche Kompromiss. */
export const JPEG_QUALITY = 0.8;

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ------------------------------------------------------------------ */
/*  Verkleinern                                                        */
/* ------------------------------------------------------------------ */

/**
 * Verkleinert so, dass die längste Kante höchstens `maxEdge` misst.
 * Vergrößert **nie** — ein bereits kleines Bild bleibt unverändert.
 * Das Seitenverhältnis bleibt erhalten, jede Kante bleibt mindestens 1 px.
 */
export function scaleToFit(size: Size, maxEdge: number = MAX_EDGE): Size {
  const w = Math.floor(size.width);
  const h = Math.floor(size.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 0, height: 0 };
  }
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) return { width: w, height: h };

  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };

  const factor = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * factor)),
    height: Math.max(1, Math.round(h * factor)),
  };
}

/** Schätzt, wie viele Bytes ein JPEG dieser Größe ungefähr belegt. */
export function estimateJpegBytes(size: Size, quality: number = JPEG_QUALITY): number {
  const pixels = Math.max(0, size.width) * Math.max(0, size.height);
  // Erfahrungswert: rund 0,3 Byte je Pixel bei Güte 0,8, linear mitskaliert.
  return Math.round(pixels * 0.3 * (quality / JPEG_QUALITY));
}

/* ------------------------------------------------------------------ */
/*  Drehen                                                             */
/* ------------------------------------------------------------------ */

export type Rotation = 0 | 90 | 180 | 270;

/** Bringt einen beliebigen Winkel auf 0/90/180/270. */
export function normalizeRotation(deg: number): Rotation {
  if (!Number.isFinite(deg)) return 0;
  const steps = ((Math.round(deg / 90) % 4) + 4) % 4;
  return (steps * 90) as Rotation;
}

/** Ein Vierteldrehung weiter (im Uhrzeigersinn). */
export function rotateStep(current: Rotation, steps = 1): Rotation {
  return normalizeRotation(current + steps * 90);
}

/** Bei 90°/270° tauschen Breite und Höhe die Plätze. */
export function rotatedSize(size: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/* ------------------------------------------------------------------ */
/*  Zuschneiden                                                        */
/* ------------------------------------------------------------------ */

/**
 * Zuschnitt in Anteilen des (bereits gedrehten) Bildes, jeweils 0…1.
 * Normalisiert gespeichert, damit ein Zuschnitt beim Drehen oder
 * Verkleinern nicht neu gerechnet werden muss.
 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

/** Kleinster zulässiger Zuschnitt — sonst zieht man versehentlich auf null. */
export const MIN_CROP = 0.06;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function isFullCrop(rect: CropRect): boolean {
  return rect.x <= 0.0001 && rect.y <= 0.0001 && rect.w >= 0.9999 && rect.h >= 0.9999;
}

/**
 * Bringt einen Zuschnitt in den gültigen Bereich: nie negativ, nie größer
 * als das Bild, nie kleiner als `minSize`. Negative Breiten werden gespiegelt.
 */
export function clampCropRect(rect: CropRect, minSize: number = MIN_CROP): CropRect {
  const min = Math.min(Math.max(minSize, 0.001), 1);

  let x = Number.isFinite(rect.x) ? rect.x : 0;
  let y = Number.isFinite(rect.y) ? rect.y : 0;
  let w = Number.isFinite(rect.w) ? rect.w : 1;
  let h = Number.isFinite(rect.h) ? rect.h : 1;

  // Negative Ausdehnung: Ecke spiegeln statt Unsinn weiterreichen.
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }

  w = Math.min(Math.max(w, min), 1);
  h = Math.min(Math.max(h, min), 1);
  x = clamp01(x);
  y = clamp01(y);
  if (x + w > 1) x = 1 - w;
  if (y + h > 1) y = 1 - h;

  return { x: clamp01(x), y: clamp01(y), w, h };
}

/** Rechteck aus zwei gezogenen Ecken. */
export function rectFromCorners(a: Point, b: Point, minSize: number = MIN_CROP): CropRect {
  const x0 = Math.min(clamp01(a.x), clamp01(b.x));
  const x1 = Math.max(clamp01(a.x), clamp01(b.x));
  const y0 = Math.min(clamp01(a.y), clamp01(b.y));
  const y1 = Math.max(clamp01(a.y), clamp01(b.y));
  return clampCropRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, minSize);
}

export type CornerKey = 'tl' | 'tr' | 'bl' | 'br';

export const CORNER_KEYS: CornerKey[] = ['tl', 'tr', 'bl', 'br'];

/** Die vier Ecken eines Zuschnitts in Anteilen — für die Ziehpunkte. */
export function cornerPoints(rect: CropRect): Record<CornerKey, Point> {
  return {
    tl: { x: rect.x, y: rect.y },
    tr: { x: rect.x + rect.w, y: rect.y },
    bl: { x: rect.x, y: rect.y + rect.h },
    br: { x: rect.x + rect.w, y: rect.y + rect.h },
  };
}

/**
 * Verschiebt eine Ecke. Die gegenüberliegende Ecke bleibt fest, das
 * Rechteck behält mindestens `minSize` Kantenlänge — auch wenn der Finger
 * über die gegenüberliegende Kante hinauszieht.
 */
export function moveCorner(
  rect: CropRect,
  corner: CornerKey,
  point: Point,
  minSize: number = MIN_CROP,
): CropRect {
  const base = clampCropRect(rect, minSize);
  const min = Math.min(Math.max(minSize, 0.001), 1);
  const left = base.x;
  const right = base.x + base.w;
  const top = base.y;
  const bottom = base.y + base.h;

  const px = clamp01(point.x);
  const py = clamp01(point.y);

  let x0 = left;
  let x1 = right;
  let y0 = top;
  let y1 = bottom;

  if (corner === 'tl' || corner === 'bl') x0 = Math.min(px, right - min);
  else x1 = Math.max(px, left + min);

  if (corner === 'tl' || corner === 'tr') y0 = Math.min(py, bottom - min);
  else y1 = Math.max(py, top + min);

  return clampCropRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, min);
}

/** Verschiebt das ganze Rechteck, ohne die Größe zu ändern. */
export function moveCrop(rect: CropRect, dx: number, dy: number): CropRect {
  const w = rect.w;
  const h = rect.h;
  const x = Math.min(Math.max(rect.x + dx, 0), Math.max(0, 1 - w));
  const y = Math.min(Math.max(rect.y + dy, 0), Math.max(0, 1 - h));
  return clampCropRect({ x, y, w, h });
}

/**
 * Rechnet den normalisierten Zuschnitt in ganzzahlige Bildpunkte um.
 * Das Ergebnis liegt garantiert innerhalb des Bildes und ist mindestens
 * 1 × 1 Pixel groß — sonst wirft `drawImage` auf iOS.
 */
export function cropToPixels(rect: CropRect, size: Size): PixelRect {
  const width = Math.max(1, Math.floor(size.width));
  const height = Math.max(1, Math.floor(size.height));
  const safe = clampCropRect(rect, 0.001);

  const x = Math.min(Math.max(0, Math.round(safe.x * width)), width - 1);
  const y = Math.min(Math.max(0, Math.round(safe.y * height)), height - 1);
  const w = Math.min(Math.max(1, Math.round(safe.w * width)), width - x);
  const h = Math.min(Math.max(1, Math.round(safe.h * height)), height - y);

  return { x, y, w, h };
}

/**
 * Endgültige Ausgabegröße: erst drehen, dann zuschneiden, dann verkleinern.
 * Genau diese Reihenfolge benutzt auch die Canvas-Ausgabe.
 */
export function outputSize(
  source: Size,
  rotation: Rotation,
  crop: CropRect,
  maxEdge: number = MAX_EDGE,
): Size {
  const rotated = rotatedSize(source, rotation);
  if (rotated.width <= 0 || rotated.height <= 0) return { width: 0, height: 0 };
  const px = cropToPixels(crop, rotated);
  return scaleToFit({ width: px.w, height: px.h }, maxEdge);
}

/* ------------------------------------------------------------------ */
/*  Helligkeit und Kontrast                                            */
/* ------------------------------------------------------------------ */

/** Vorgabewerte — 0 bedeutet „unverändert". */
export const NEUTRAL_TONE = { brightness: 0, contrast: 0 } as const;

/** Voreinstellung für abfotografiertes Papier: heller und kontrastreicher. */
export const PAPER_TONE = { brightness: 12, contrast: 35 } as const;

export interface ToneSettings {
  /** −100 … +100 */
  brightness: number;
  /** −100 … +100 */
  contrast: number;
}

export function isNeutralTone(tone: ToneSettings): boolean {
  return Math.round(tone.brightness) === 0 && Math.round(tone.contrast) === 0;
}

/**
 * Nachschlagetabelle für Helligkeit und Kontrast: 256 Einträge, einmal
 * gerechnet, dann je Bildpunkt nur noch nachgeschlagen. Das ist auf einem
 * iPhone deutlich schneller als eine Formel je Kanal.
 */
export function buildToneLut(brightness: number, contrast: number): Uint8ClampedArray {
  const b = Number.isFinite(brightness) ? Math.min(Math.max(brightness, -100), 100) : 0;
  const c = Number.isFinite(contrast) ? Math.min(Math.max(contrast, -100), 100) : 0;

  // Klassische Kontrastformel; bei c = 0 ist der Faktor exakt 1.
  const factor = (259 * (c + 255)) / (255 * (259 - c));

  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(factor * (i - 128) + 128 + b * 1.28);
  }
  return lut;
}
