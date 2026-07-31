import { describe, it, expect } from 'vitest';
import {
  buildToneLut,
  clampCropRect,
  cornerPoints,
  cropToPixels,
  estimateJpegBytes,
  FULL_CROP,
  isFullCrop,
  isNeutralTone,
  MAX_EDGE,
  moveCorner,
  moveCrop,
  normalizeRotation,
  outputSize,
  rectFromCorners,
  rotateStep,
  rotatedSize,
  scaleToFit,
} from './imaging';

describe('scaleToFit', () => {
  it('verkleinert ein Querformat-Foto vom iPhone auf 2000 px', () => {
    expect(scaleToFit({ width: 4032, height: 3024 }, 2000)).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it('verkleinert ein Hochformat-Foto und behält das Seitenverhältnis', () => {
    expect(scaleToFit({ width: 3024, height: 4032 }, 2000)).toEqual({
      width: 1500,
      height: 2000,
    });
  });

  it('vergrößert schon kleine Bilder nicht', () => {
    expect(scaleToFit({ width: 800, height: 600 }, 2000)).toEqual({ width: 800, height: 600 });
    expect(scaleToFit({ width: 2000, height: 1200 }, 2000)).toEqual({ width: 2000, height: 1200 });
  });

  it('behandelt Quadrate', () => {
    expect(scaleToFit({ width: 2400, height: 2400 }, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it('lässt auch bei extremem Seitenverhältnis mindestens 1 px stehen', () => {
    const out = scaleToFit({ width: 8000, height: 3 }, 2000);
    expect(out.width).toBe(2000);
    expect(out.height).toBe(1);
  });

  it('gibt bei unsinnigen Maßen 0 zurück statt NaN', () => {
    expect(scaleToFit({ width: 0, height: 500 }, 2000)).toEqual({ width: 0, height: 0 });
    expect(scaleToFit({ width: Number.NaN, height: 10 }, 2000)).toEqual({ width: 0, height: 0 });
  });

  it('benutzt ohne Angabe die Vorgabe von 2000 px', () => {
    expect(scaleToFit({ width: 4000, height: 4000 })).toEqual({ width: MAX_EDGE, height: MAX_EDGE });
  });

  it('schätzt die Dateigröße plausibel', () => {
    expect(estimateJpegBytes({ width: 2000, height: 1500 })).toBeGreaterThan(500_000);
    expect(estimateJpegBytes({ width: 0, height: 0 })).toBe(0);
  });
});

describe('Drehen', () => {
  it('normalisiert beliebige Winkel', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });

  it('dreht in Vierteln weiter', () => {
    expect(rotateStep(270)).toBe(0);
    expect(rotateStep(0, -1)).toBe(270);
  });

  it('tauscht Breite und Höhe bei 90 und 270 Grad', () => {
    const size = { width: 4032, height: 3024 };
    expect(rotatedSize(size, 0)).toEqual(size);
    expect(rotatedSize(size, 180)).toEqual(size);
    expect(rotatedSize(size, 90)).toEqual({ width: 3024, height: 4032 });
    expect(rotatedSize(size, 270)).toEqual({ width: 3024, height: 4032 });
  });
});

describe('clampCropRect', () => {
  it('lässt einen gültigen Zuschnitt unverändert', () => {
    const rect = { x: 0.1, y: 0.2, w: 0.5, h: 0.6 };
    expect(clampCropRect(rect)).toEqual(rect);
  });

  it('schiebt einen über den Rand ragenden Zuschnitt zurück', () => {
    expect(clampCropRect({ x: 0.8, y: 0.9, w: 0.5, h: 0.4 })).toEqual({
      x: 0.5,
      y: 0.6,
      w: 0.5,
      h: 0.4,
    });
  });

  it('spiegelt negative Ausdehnung statt sie durchzureichen', () => {
    const out = clampCropRect({ x: 0.6, y: 0.6, w: -0.3, h: -0.2 });
    expect(out.x).toBeCloseTo(0.3, 6);
    expect(out.w).toBeCloseTo(0.3, 6);
    expect(out.y).toBeCloseTo(0.4, 6);
    expect(out.h).toBeCloseTo(0.2, 6);
  });

  it('erzwingt eine Mindestgröße', () => {
    const out = clampCropRect({ x: 0.5, y: 0.5, w: 0, h: 0 }, 0.1);
    expect(out.w).toBe(0.1);
    expect(out.h).toBe(0.1);
  });

  it('rettet NaN-Werte', () => {
    const out = clampCropRect({ x: Number.NaN, y: 0, w: Number.NaN, h: 1 });
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.w)).toBe(true);
  });

  it('erkennt den vollen Zuschnitt', () => {
    expect(isFullCrop(FULL_CROP)).toBe(true);
    expect(isFullCrop({ x: 0, y: 0, w: 0.9, h: 1 })).toBe(false);
  });
});

describe('Ecken ziehen', () => {
  it('baut ein Rechteck aus zwei Ecken, egal in welcher Reihenfolge', () => {
    const a = rectFromCorners({ x: 0.7, y: 0.8 }, { x: 0.2, y: 0.1 });
    expect(a.x).toBeCloseTo(0.2, 6);
    expect(a.y).toBeCloseTo(0.1, 6);
    expect(a.w).toBeCloseTo(0.5, 6);
    expect(a.h).toBeCloseTo(0.7, 6);
  });

  it('liefert die vier Eckpunkte', () => {
    expect(cornerPoints({ x: 0.1, y: 0.2, w: 0.4, h: 0.3 })).toEqual({
      tl: { x: 0.1, y: 0.2 },
      tr: { x: 0.5, y: 0.2 },
      bl: { x: 0.1, y: 0.5 },
      br: { x: 0.5, y: 0.5 },
    });
  });

  it('hält die gegenüberliegende Ecke fest', () => {
    const start = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    const out = moveCorner(start, 'tl', { x: 0.4, y: 0.35 });
    expect(out.x).toBeCloseTo(0.4, 6);
    expect(out.y).toBeCloseTo(0.35, 6);
    // rechts/unten unverändert
    expect(out.x + out.w).toBeCloseTo(0.8, 6);
    expect(out.y + out.h).toBeCloseTo(0.8, 6);
  });

  it('lässt eine Ecke nicht über die gegenüberliegende hinaus', () => {
    const start = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    const out = moveCorner(start, 'tl', { x: 0.95, y: 0.95 }, 0.1);
    expect(out.w).toBeCloseTo(0.1, 6);
    expect(out.h).toBeCloseTo(0.1, 6);
    expect(out.x + out.w).toBeCloseTo(0.8, 6);
  });

  it('bleibt beim Ziehen über den Bildrand hinaus im Bild', () => {
    const out = moveCorner({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'br', { x: 5, y: -3 }, 0.1);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.y).toBeGreaterThanOrEqual(0);
    expect(out.x + out.w).toBeLessThanOrEqual(1.000001);
    expect(out.y + out.h).toBeLessThanOrEqual(1.000001);
  });

  it('verschiebt das Rechteck ohne Größenänderung und stoppt am Rand', () => {
    const start = { x: 0.5, y: 0.5, w: 0.4, h: 0.4 };
    const out = moveCrop(start, 0.5, 0.5);
    expect(out.w).toBeCloseTo(0.4, 6);
    expect(out.h).toBeCloseTo(0.4, 6);
    expect(out.x).toBeCloseTo(0.6, 6);
    expect(out.y).toBeCloseTo(0.6, 6);
  });
});

describe('cropToPixels', () => {
  it('rechnet Anteile in ganze Bildpunkte um', () => {
    expect(cropToPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, { width: 4000, height: 3000 })).toEqual(
      { x: 1000, y: 1500, w: 2000, h: 750 },
    );
  });

  it('bleibt bei vollem Zuschnitt exakt beim ganzen Bild', () => {
    expect(cropToPixels(FULL_CROP, { width: 4032, height: 3024 })).toEqual({
      x: 0,
      y: 0,
      w: 4032,
      h: 3024,
    });
  });

  it('läuft nie über den Bildrand hinaus', () => {
    const out = cropToPixels({ x: 0.99, y: 0.99, w: 0.5, h: 0.5 }, { width: 100, height: 100 });
    expect(out.x + out.w).toBeLessThanOrEqual(100);
    expect(out.y + out.h).toBeLessThanOrEqual(100);
  });

  it('liefert mindestens 1 x 1 Pixel', () => {
    const out = cropToPixels({ x: 0.5, y: 0.5, w: 0.001, h: 0.001 }, { width: 10, height: 10 });
    expect(out.w).toBeGreaterThanOrEqual(1);
    expect(out.h).toBeGreaterThanOrEqual(1);
  });
});

describe('outputSize', () => {
  it('dreht, schneidet zu und verkleinert in dieser Reihenfolge', () => {
    // 4032x3024, um 90 Grad gedreht -> 3024x4032, obere Hälfte -> 3024x2016,
    // danach auf 2000 px längste Kante -> 2000x1333.
    const out = outputSize(
      { width: 4032, height: 3024 },
      90,
      { x: 0, y: 0, w: 1, h: 0.5 },
      2000,
    );
    expect(out).toEqual({ width: 2000, height: 1333 });

    // Ohne Drehung ist die lange Kante die Breite.
    expect(outputSize({ width: 4032, height: 3024 }, 0, { x: 0, y: 0, w: 1, h: 0.5 }, 2000)).toEqual(
      { width: 2000, height: 750 },
    );
  });

  it('lässt ein kleines, unverändertes Bild in Ruhe', () => {
    expect(outputSize({ width: 900, height: 600 }, 0, FULL_CROP, 2000)).toEqual({
      width: 900,
      height: 600,
    });
  });

  it('verträgt ein leeres Bild', () => {
    expect(outputSize({ width: 0, height: 0 }, 90, FULL_CROP, 2000)).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe('buildToneLut', () => {
  it('ist bei 0/0 die Identität', () => {
    const lut = buildToneLut(0, 0);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(128);
    expect(lut[255]).toBe(255);
  });

  it('hebt die Helligkeit an', () => {
    const lut = buildToneLut(50, 0);
    expect(lut[0]).toBe(64);
    expect(lut[128]).toBe(192);
    expect(lut[255]).toBe(255); // bleibt im Wertebereich
  });

  it('senkt die Helligkeit und bleibt bei 0 stehen', () => {
    const lut = buildToneLut(-100, 0);
    expect(lut[0]).toBe(0);
    expect(lut[100]).toBe(0);
  });

  it('spreizt bei positivem Kontrast um die Mitte', () => {
    const lut = buildToneLut(0, 40);
    expect(lut[128]).toBe(128);
    expect(lut[200]).toBeGreaterThan(200);
    expect(lut[50]).toBeLessThan(50);
  });

  it('staucht bei negativem Kontrast zur Mitte hin', () => {
    const lut = buildToneLut(0, -40);
    expect(lut[255]).toBeLessThan(255);
    expect(lut[0]).toBeGreaterThan(0);
  });

  it('begrenzt Ausreißer statt durch null zu teilen', () => {
    const lut = buildToneLut(9999, 9999);
    expect(lut.length).toBe(256);
    for (const v of lut) expect(Number.isFinite(v)).toBe(true);
  });

  it('erkennt neutrale Einstellungen', () => {
    expect(isNeutralTone({ brightness: 0, contrast: 0 })).toBe(true);
    expect(isNeutralTone({ brightness: 0, contrast: 12 })).toBe(false);
  });
});
