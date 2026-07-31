/**
 * Reine Rechenlogik für die Gewichtskurve.
 *
 * Bewusst ohne React und ohne Datenbank: Achsenteilung, Projektion der Punkte
 * und die Tagesmittel lassen sich so vollständig prüfen. Die Zeichenarbeit
 * selbst steckt in WeightChart.tsx und ist reines SVG — keine Bibliothek,
 * damit die App offline bleibt.
 *
 * Zwei Betriebsarten für die x-Achse:
 *  - `age`     — Alter in Tagen, wenn ein Geburtsdatum bekannt ist.
 *  - `elapsed` — Tage seit der ersten Wiegung, wenn es keines gibt.
 */

import type { ID, ISODate, ISODateTime, WeightEntry } from '../../types';
import { daysBetween, todayISO, toISODate } from '../../lib/date';
import { dailyAverages } from '../../domain/weight';
import { formatInt } from '../../lib/format';

export type WeightSample = Pick<WeightEntry, 'at' | 'grams'>;

/* ------------------------------------------------------------------ */
/*  Zeit                                                               */
/* ------------------------------------------------------------------ */

/**
 * Alter in Tagen (mit Nachkommastellen) zum Zeitpunkt `at`, bezogen auf das
 * Datum `base`.
 *
 * Absichtlich nicht über die Millisekunden-Differenz gerechnet: bei der
 * Sommerzeitumstellung hat ein Kalendertag 23 bzw. 25 Stunden, die Kurve
 * würde dadurch um eine halbe Stunde verrutschen. Stattdessen ganze
 * Kalendertage plus Tagesanteil der lokalen Uhrzeit.
 */
export function ageDaysAt(base: ISODate, at: ISODateTime): number {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return Number.NaN;
  const whole = daysBetween(base, toISODate(d));
  const seconds = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  return whole + seconds / 86_400;
}

/** Sortiert nach Zeit und wirft unbrauchbare Werte weg. */
export function sortSamples(entries: WeightSample[]): WeightSample[] {
  return entries
    .filter((e) => typeof e.at === 'string' && Number.isFinite(e.grams) && e.grams > 0)
    .map((e) => ({ at: e.at, grams: e.grams }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/* ------------------------------------------------------------------ */
/*  Achsenteilung                                                      */
/* ------------------------------------------------------------------ */

function roundTo(value: number, decimals = 6): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export interface AxisScale {
  lo: number;
  hi: number;
  step: number;
  ticks: number[];
}

/**
 * Kleinste Schrittweite aus der Liste, mit der der Bereich in höchstens
 * `targetTicks` Abschnitte zerfällt.
 */
export function pickStep(span: number, targetTicks: number, steps: number[]): number {
  const s = Number.isFinite(span) ? Math.abs(span) : 0;
  const target = Math.max(1, targetTicks);
  for (const candidate of steps) if (s / candidate <= target) return candidate;
  return steps[steps.length - 1];
}

/**
 * Schrittweiten der Achsen. Beide Listen enthalten ausschließlich ganze
 * Zahlen — mit 2,5-g-Schritten stünde an zwei Strichen dieselbe gerundete
 * Beschriftung.
 */
export const DAY_STEPS = [1, 2, 5, 7, 14, 21, 28, 56, 84];
export const GRAM_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

export function dayStep(spanDays: number, targetTicks = 5): number {
  return pickStep(spanDays, targetTicks, DAY_STEPS);
}

/** Gramm-Achse: runde, ganzzahlige Schritte, Bereich nach außen aufgerundet. */
export function gramAxis(min: number, max: number, targetTicks = 4): AxisScale {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : lo + 1;
  if (hi < lo) [lo, hi] = [hi, lo];

  if (hi - lo < 1e-9) {
    // Eine einzige Messung (oder lauter gleiche Werte): Bereich künstlich öffnen.
    const pad = Math.max(2, Math.abs(hi) * 0.05);
    lo -= pad;
    hi += pad;
  }

  const step = pickStep(hi - lo, targetTicks, GRAM_STEPS);
  // Untergrenze auf einem feineren Raster abrunden: bei 92–268 g soll die
  // Achse bei 90 g beginnen, nicht bei 50 g — sonst bleibt das untere
  // Drittel der Kurve leer.
  const fine = Math.max(1, Math.round(step / 5));
  const start = Math.floor(lo / fine) * fine;
  let end = start + Math.ceil((hi - start) / step) * step;
  if (end <= start) end = start + step;
  const count = Math.max(1, Math.round((end - start) / step));

  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(roundTo(start + i * step));
  return { lo: roundTo(start), hi: roundTo(end), step, ticks };
}

/** Bis zu drei Tage Vorlauf werden auf 0 heruntergezogen — die Geburt gehört ins Bild. */
const ZERO_SNAP_DAYS = 3;

/** Tages-Achse: ganzzahlige Schritte, beginnt bei 0, wenn die Daten nah am Anfang liegen. */
export function dayAxis(minDay: number, maxDay: number, targetTicks = 5): AxisScale {
  const lo0 = Number.isFinite(minDay) ? minDay : 0;
  const hi0 = Number.isFinite(maxDay) ? Math.max(maxDay, lo0) : lo0;
  // Negative Werte (Wiegung vor dem eingetragenen Geburtsdatum) bleiben sichtbar.
  const snapToZero = lo0 >= 0 && lo0 < ZERO_SNAP_DAYS;
  const step = dayStep(hi0 - (snapToZero ? 0 : lo0), targetTicks);
  const lo = snapToZero ? 0 : Math.floor(lo0 / step) * step;
  let hi = Math.ceil(hi0 / step) * step;
  if (hi <= lo) hi = lo + step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(roundTo(v));
  return { lo, hi, step, ticks };
}

/* ------------------------------------------------------------------ */
/*  Projektion                                                         */
/* ------------------------------------------------------------------ */

export interface ChartPlot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChartDomain {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function projectX(value: number, domain: ChartDomain, plot: ChartPlot): number {
  const span = domain.x1 - domain.x0;
  const t = span === 0 ? 0.5 : (value - domain.x0) / span;
  return roundTo(plot.x + t * plot.w, 2);
}

export function projectY(value: number, domain: ChartDomain, plot: ChartPlot): number {
  const span = domain.y1 - domain.y0;
  const t = span === 0 ? 0.5 : (value - domain.y0) / span;
  return roundTo(plot.y + plot.h - t * plot.h, 2);
}

/** Linienzug. Bei weniger als zwei Punkten gibt es keine Linie — nur einen Punkt. */
export function buildPath(points: { px: number; py: number }[]): string {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px} ${p.py}`).join(' ');
}

/* ------------------------------------------------------------------ */
/*  Tagesmittel                                                        */
/* ------------------------------------------------------------------ */

export interface DailyNode {
  date: ISODate;
  grams: number;
  /** Wie viele Einzelmessungen an diesem Tag zusammengefasst wurden. */
  count: number;
}

/**
 * Tagesmittel je Kalendertag inkl. Anzahl der Messungen.
 * Nutzt `dailyAverages` aus der Fachschicht und ergänzt nur die Zählung.
 */
export function dailyNodes(entries: WeightSample[]): DailyNode[] {
  const counts = new Map<ISODate, number>();
  for (const e of sortSamples(entries)) {
    const key = toISODate(new Date(e.at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return dailyAverages(entries).map((d) => ({
    date: d.date,
    grams: d.grams,
    count: counts.get(d.date) ?? 1,
  }));
}

/* ------------------------------------------------------------------ */
/*  Gesamtmodell                                                       */
/* ------------------------------------------------------------------ */

export interface ChartSeriesInput {
  kittenId: ID;
  label: string;
  /** Halsbandfarbe als Hex — die Kitten werden über die Farbe unterschieden. */
  hex: string;
  entries: WeightSample[];
}

export interface ChartDot {
  x: number;
  grams: number;
  px: number;
  py: number;
  at: ISODateTime;
}

export interface ChartNode {
  x: number;
  grams: number;
  px: number;
  py: number;
  count: number;
  date: ISODate;
}

export interface ChartSeriesModel {
  kittenId: ID;
  label: string;
  hex: string;
  /** true = kräftig zeichnen, false = blass im Hintergrund. */
  focus: boolean;
  path: string;
  nodes: ChartNode[];
  dots: ChartDot[];
  latestGrams?: number;
}

export interface ChartTick {
  value: number;
  /** Bildschirmkoordinate — x bei der Tages-Achse, y bei der Gramm-Achse. */
  pos: number;
  label: string;
}

export interface ChartModel {
  width: number;
  height: number;
  plot: ChartPlot;
  domain: ChartDomain;
  xTicks: ChartTick[];
  yTicks: ChartTick[];
  /** Reihenfolge zum Zeichnen: blasse Geschwister zuerst, betrachtetes Kitten zuletzt. */
  series: ChartSeriesModel[];
  totalMeasurements: number;
  xMode: 'age' | 'elapsed';
  xAxisLabel: string;
  /** Datum, das der x-Position 0 entspricht. */
  baseDate: ISODate;
}

export const CHART_PADDING = { top: 10, right: 10, bottom: 22, left: 38 };

export interface BuildChartOptions {
  series: ChartSeriesInput[];
  focusKittenId?: ID;
  /** Geburtsdatum des Wurfes. Fehlt es, zählt die Achse ab der ersten Wiegung. */
  birthDate?: ISODate;
  width?: number;
  height?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  /** Nur für Tests: heutiges Datum als Rückfallwert. */
  today?: ISODate;
}

export function buildChartModel({
  series,
  focusKittenId,
  birthDate,
  width = 340,
  height = 200,
  padding = CHART_PADDING,
  today,
}: BuildChartOptions): ChartModel {
  const plot: ChartPlot = {
    x: padding.left,
    y: padding.top,
    w: Math.max(10, width - padding.left - padding.right),
    h: Math.max(10, height - padding.top - padding.bottom),
  };

  const clean = series.map((s) => ({ ...s, entries: sortSamples(s.entries) }));
  const totalMeasurements = clean.reduce((n, s) => n + s.entries.length, 0);

  /* --- Bezugsdatum ------------------------------------------------- */
  let xMode: 'age' | 'elapsed' = 'age';
  let baseDate = birthDate;
  if (!baseDate) {
    xMode = 'elapsed';
    let earliest: ISODateTime | undefined;
    for (const s of clean) {
      const first = s.entries[0];
      if (first && (!earliest || first.at < earliest)) earliest = first.at;
    }
    baseDate = earliest ? toISODate(new Date(earliest)) : (today ?? todayISO());
  }

  /* --- Wertebereiche ----------------------------------------------- */
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const s of clean) {
    for (const e of s.entries) {
      const x = ageDaysAt(baseDate, e.at);
      if (!Number.isFinite(x)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (e.grams < minY) minY = e.grams;
      if (e.grams > maxY) maxY = e.grams;
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 7;
    minY = 80;
    maxY = 200;
  }

  const xAxis = dayAxis(minX, maxX);
  const yAxis = gramAxis(minY, maxY, 4);
  const domain: ChartDomain = { x0: xAxis.lo, x1: xAxis.hi, y0: yAxis.lo, y1: yAxis.hi };

  const xTicks: ChartTick[] = xAxis.ticks.map((v) => ({
    value: v,
    pos: projectX(v, domain, plot),
    label: formatInt(v),
  }));
  const yTicks: ChartTick[] = yAxis.ticks.map((v) => ({
    value: v,
    pos: projectY(v, domain, plot),
    label: formatInt(v),
  }));

  /* --- Reihen ------------------------------------------------------- */
  const models: ChartSeriesModel[] = clean.map((s) => {
    const dots: ChartDot[] = s.entries.map((e) => {
      const x = ageDaysAt(baseDate, e.at);
      return {
        x,
        grams: e.grams,
        px: projectX(x, domain, plot),
        py: projectY(e.grams, domain, plot),
        at: e.at,
      };
    });

    const nodes: ChartNode[] = dailyNodes(s.entries).map((n) => {
      const x = daysBetween(baseDate, n.date);
      return {
        x,
        grams: n.grams,
        px: projectX(x, domain, plot),
        py: projectY(n.grams, domain, plot),
        count: n.count,
        date: n.date,
      };
    });

    return {
      kittenId: s.kittenId,
      label: s.label,
      hex: s.hex,
      focus: focusKittenId ? s.kittenId === focusKittenId : true,
      path: buildPath(nodes),
      nodes,
      dots,
      latestGrams: s.entries.length ? s.entries[s.entries.length - 1].grams : undefined,
    };
  });

  // Blasse zuerst zeichnen, damit das betrachtete Kitten obenauf liegt.
  const ordered = [...models].sort((a, b) => Number(a.focus) - Number(b.focus));

  return {
    width,
    height,
    plot,
    domain,
    xTicks,
    yTicks,
    series: ordered,
    totalMeasurements,
    xMode,
    xAxisLabel: xMode === 'age' ? 'Alter in Tagen' : 'Tage seit der ersten Wiegung',
    baseDate,
  };
}
