/**
 * Reine Layout-Rechnung für das WhatsApp-Bild.
 *
 * Kein Canvas, kein DOM — nur Zahlen und Texte. Die eigentliche Zeichnung
 * in `renderShareCard.ts` benutzt ausschließlich das, was hier herauskommt.
 */

import type { ISODate } from '../../../types';
import { daysBetween } from '../../../lib/date';

/* ------------------------------------------------------------------ */
/*  Texte                                                              */
/* ------------------------------------------------------------------ */

/**
 * Anrede aus dem Namen des Interessenten. Ohne Namen bleibt es beim
 * schlichten „Hallo," — nie „Hallo undefined,".
 */
export function buildGreeting(name?: string | null): string {
  const clean = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'Hallo,';
  return `Hallo ${clean},`;
}

/** „Tag 24" — das Alter, wie sie es in ihren Nachrichten schreibt. */
export function formatDayCount(ageDays?: number | null): string {
  if (ageDays == null || !Number.isFinite(ageDays) || ageDays < 0) return '';
  return `Tag ${Math.floor(ageDays)}`;
}

/** Zusatzzeile mit Wochen, sobald das interessanter ist als der Tag. */
export function formatWeekHint(ageDays?: number | null): string {
  if (ageDays == null || !Number.isFinite(ageDays) || ageDays < 14) return '';
  const weeks = Math.floor(ageDays / 7);
  const rest = Math.floor(ageDays) % 7;
  if (rest === 0) return `${weeks} Wochen alt`;
  return `${weeks} Wochen, ${rest} ${rest === 1 ? 'Tag' : 'Tage'} alt`;
}

/* ------------------------------------------------------------------ */
/*  Gewichtskurve                                                      */
/* ------------------------------------------------------------------ */

export interface CurveSample {
  /** Reines Datum, „YYYY-MM-DD". */
  date: ISODate;
  grams: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CurveGeometry {
  /** Bildpunkte der Kurve, in Zeichenreihenfolge. */
  path: { x: number; y: number }[];
  minGrams: number;
  maxGrams: number;
  /** Grundlinie für die gefüllte Fläche. */
  baseY: number;
}

/**
 * Rechnet Messwerte in Bildpunkte um.
 *
 *  - Leere Liste -> null (der Aufrufer lässt die Kurve dann weg).
 *  - Ein einzelner Punkt -> mittig, damit kein Strich ins Nichts geht.
 *  - Lauter gleiche Werte -> waagerechte Linie auf halber Höhe.
 *  - Lücken beim Wiegen -> die x-Achse folgt dem echten Zeitabstand,
 *    nicht der Reihenfolge. Sonst lügt die Kurve.
 */
export function curveGeometry(
  samples: CurveSample[],
  box: Box,
  padding = 8,
): CurveGeometry | null {
  const points = samples
    .filter((s) => s.date && Number.isFinite(s.grams) && s.grams > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) return null;

  const innerX = box.x + padding;
  const innerY = box.y + padding;
  const innerW = Math.max(1, box.width - padding * 2);
  const innerH = Math.max(1, box.height - padding * 2);

  const values = points.map((p) => p.grams);
  const minGrams = Math.min(...values);
  const maxGrams = Math.max(...values);
  const span = maxGrams - minGrams;

  const first = points[0].date;
  const totalDays = daysBetween(first, points[points.length - 1].date);

  const path = points.map((p, i) => {
    const t =
      points.length === 1 ? 0.5 : totalDays > 0 ? daysBetween(first, p.date) / totalDays : i / (points.length - 1);
    const v = span > 0 ? (p.grams - minGrams) / span : 0.5;
    return {
      x: innerX + t * innerW,
      // Kopfhöhe lassen: die Kurve füllt nur 85 % des Kastens.
      y: innerY + innerH - (0.08 + v * 0.84) * innerH,
    };
  });

  return { path, minGrams, maxGrams, baseY: box.y + box.height - padding };
}

/* ------------------------------------------------------------------ */
/*  Gesamtmodell                                                       */
/* ------------------------------------------------------------------ */

export interface ShareCardModel {
  greeting: string;
  kittenName: string;
  dayCount: string;
  weekHint: string;
  weightText: string;
  message: string;
  footer: string;
  samples: CurveSample[];
}

export interface ShareCardInput {
  interestName?: string | null;
  greetingOverride?: string | null;
  kittenName: string;
  ageDays?: number | null;
  latestGrams?: number | null;
  message?: string | null;
  catteryName?: string | null;
  samples?: CurveSample[];
}

/** Baut die fertigen Zeilen. Alles außer dem Kittennamen darf fehlen. */
export function buildShareCardModel(input: ShareCardInput): ShareCardModel {
  const override = (input.greetingOverride ?? '').trim();

  return {
    greeting: override || buildGreeting(input.interestName),
    kittenName: (input.kittenName ?? '').trim() || 'Unser Kitten',
    dayCount: formatDayCount(input.ageDays),
    weekHint: formatWeekHint(input.ageDays),
    weightText:
      input.latestGrams != null && Number.isFinite(input.latestGrams) && input.latestGrams > 0
        ? `${Math.round(input.latestGrams)} g`
        : '',
    message: (input.message ?? '').trim(),
    footer: (input.catteryName ?? '').trim(),
    samples: input.samples ?? [],
  };
}
