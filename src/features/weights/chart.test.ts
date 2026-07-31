import { describe, expect, it } from 'vitest';
import {
  ageDaysAt,
  buildChartModel,
  buildPath,
  dailyNodes,
  dayAxis,
  dayStep,
  gramAxis,
  projectX,
  projectY,
  sortSamples,
  type ChartSeriesInput,
  type WeightSample,
} from './chart';

/** Lokaler Zeitpunkt als ISO-String mit Z — so, wie die Datenbank ihn speichert. */
function at(y: number, m: number, d: number, h = 8, min = 0): string {
  return new Date(y, m - 1, d, h, min, 0).toISOString();
}

function sample(y: number, m: number, d: number, h: number, grams: number): WeightSample {
  return { at: at(y, m, d, h), grams };
}

describe('ageDaysAt', () => {
  it('zählt ganze Tage plus Tagesanteil', () => {
    expect(ageDaysAt('2026-03-01', at(2026, 3, 1, 0, 0))).toBe(0);
    expect(ageDaysAt('2026-03-01', at(2026, 3, 1, 12, 0))).toBeCloseTo(0.5, 6);
    expect(ageDaysAt('2026-03-01', at(2026, 3, 13, 6, 0))).toBeCloseTo(12.25, 6);
  });

  it('bleibt bei der Sommerzeitumstellung korrekt', () => {
    // In Deutschland wird in der Nacht auf den 29.03.2026 umgestellt.
    // Der 29.03. hat nur 23 Stunden — als Alter zählt trotzdem ein ganzer Tag.
    expect(ageDaysAt('2026-03-27', at(2026, 3, 29, 12, 0))).toBeCloseTo(2.5, 6);
    // Rückstellung Ende Oktober: der 25.10.2026 hat 25 Stunden.
    expect(ageDaysAt('2026-10-23', at(2026, 10, 25, 12, 0))).toBeCloseTo(2.5, 6);
  });

  it('kommt über den Monatswechsel und durch das Schaltjahr', () => {
    expect(ageDaysAt('2026-01-31', at(2026, 2, 1, 0, 0))).toBe(1);
    expect(ageDaysAt('2028-02-28', at(2028, 3, 1, 0, 0))).toBe(2); // 2028 ist ein Schaltjahr
    expect(ageDaysAt('2027-02-28', at(2027, 3, 1, 0, 0))).toBe(1);
  });

  it('liefert NaN bei unbrauchbarem Zeitpunkt', () => {
    expect(Number.isNaN(ageDaysAt('2026-03-01', 'kaputt'))).toBe(true);
  });
});

describe('gramAxis', () => {
  it('benutzt ausschließlich ganzzahlige Schritte', () => {
    // 2,5-g-Schritte würden zweimal dieselbe gerundete Beschriftung ergeben.
    for (const [lo, hi] of [
      [95, 105],
      [92, 268],
      [80, 1200],
      [88, 91],
    ]) {
      const a = gramAxis(lo, hi, 4);
      expect(Number.isInteger(a.step)).toBe(true);
      expect(a.ticks.every((t) => Number.isInteger(t))).toBe(true);
      expect(new Set(a.ticks).size).toBe(a.ticks.length);
    }
  });

  it('erweitert den Bereich auf runde Grenzen', () => {
    const a = gramAxis(92, 268, 4);
    expect(a.lo).toBeLessThanOrEqual(92);
    expect(a.hi).toBeGreaterThanOrEqual(268);
    expect(a.ticks[0]).toBe(a.lo);
    expect(a.ticks[a.ticks.length - 1]).toBe(a.hi);
    // Schritte sind gleichmäßig.
    for (let i = 1; i < a.ticks.length; i++) {
      expect(a.ticks[i] - a.ticks[i - 1]).toBeCloseTo(a.step, 6);
    }
  });

  it('legt die Untergrenze eng an die Daten, statt ein leeres Drittel zu lassen', () => {
    // Bei 92–268 g begann die Achse früher bei 50 g — das untere Drittel blieb leer.
    const a = gramAxis(92, 268, 4);
    expect(a.lo).toBe(90);
    expect(a.lo).toBeLessThanOrEqual(92);
    // Der Leerraum unterhalb der Daten bleibt kleiner als eine Schrittweite.
    expect(92 - a.lo).toBeLessThan(a.step);
    expect(a.hi).toBeGreaterThanOrEqual(268);
  });

  it('öffnet den Bereich, wenn alle Werte gleich sind', () => {
    const a = gramAxis(120, 120);
    expect(a.hi).toBeGreaterThan(a.lo);
    expect(a.ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('verträgt vertauschte Grenzen und Unsinn', () => {
    const a = gramAxis(300, 100);
    expect(a.lo).toBeLessThan(a.hi);
    const b = gramAxis(Number.NaN, Number.NaN);
    expect(b.ticks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('dayStep / dayAxis', () => {
  it('wählt ganze Tage, ab drei Wochen Wochenschritte', () => {
    expect(dayStep(4)).toBe(1);
    expect(dayStep(14)).toBe(5);
    expect(dayStep(30)).toBe(7);
    expect(dayStep(70)).toBe(14);
  });

  it('beginnt bei 0, wenn die ersten Messungen nah an der Geburt liegen', () => {
    const a = dayAxis(0, 12);
    expect(a.lo).toBe(0);
    expect(a.hi).toBeGreaterThanOrEqual(12);
    expect(a.ticks.every((t) => Number.isInteger(t))).toBe(true);
  });

  it('behält den Ausschnitt, wenn erst spät gewogen wurde', () => {
    const a = dayAxis(56, 70);
    expect(a.lo).toBeGreaterThan(0);
    expect(a.lo).toBeLessThanOrEqual(56);
  });

  it('erzeugt auch bei einer einzigen Messung eine Achse', () => {
    const a = dayAxis(3, 3);
    expect(a.hi).toBeGreaterThan(a.lo);
    expect(a.ticks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Projektion', () => {
  const plot = { x: 40, y: 10, w: 200, h: 100 };
  const domain = { x0: 0, x1: 20, y0: 100, y1: 300 };

  it('bildet den Anfang links und das Ende rechts ab', () => {
    expect(projectX(0, domain, plot)).toBe(40);
    expect(projectX(20, domain, plot)).toBe(240);
    expect(projectX(10, domain, plot)).toBe(140);
  });

  it('bildet kleine Werte unten und große oben ab', () => {
    expect(projectY(100, domain, plot)).toBe(110);
    expect(projectY(300, domain, plot)).toBe(10);
    expect(projectY(200, domain, plot)).toBe(60);
  });

  it('stürzt bei entartetem Bereich nicht ab', () => {
    const flat = { x0: 5, x1: 5, y0: 1, y1: 1 };
    expect(Number.isFinite(projectX(5, flat, plot))).toBe(true);
    expect(Number.isFinite(projectY(1, flat, plot))).toBe(true);
  });
});

describe('buildPath', () => {
  it('erzeugt keinen Pfad bei null oder einem Punkt', () => {
    expect(buildPath([])).toBe('');
    expect(buildPath([{ px: 1, py: 2 }])).toBe('');
  });

  it('verbindet mehrere Punkte', () => {
    expect(buildPath([{ px: 1, py: 2 }, { px: 3, py: 4 }])).toBe('M1 2 L3 4');
  });
});

describe('dailyNodes', () => {
  it('mittelt mehrere Messungen desselben Tages', () => {
    const nodes = dailyNodes([
      sample(2026, 3, 3, 8, 100),
      sample(2026, 3, 3, 20, 110),
      sample(2026, 3, 4, 8, 118),
    ]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].grams).toBe(105);
    expect(nodes[0].count).toBe(2);
    expect(nodes[1].count).toBe(1);
  });

  it('lässt Lücken einfach aus, statt sie zu erfinden', () => {
    const nodes = dailyNodes([sample(2026, 3, 3, 8, 100), sample(2026, 3, 9, 8, 160)]);
    expect(nodes.map((n) => n.date)).toEqual(['2026-03-03', '2026-03-09']);
  });

  it('ist bei leerer Liste leer', () => {
    expect(dailyNodes([])).toEqual([]);
  });
});

describe('sortSamples', () => {
  it('sortiert und wirft unbrauchbare Werte weg', () => {
    const list = sortSamples([
      sample(2026, 3, 4, 8, 120),
      sample(2026, 3, 3, 8, 100),
      { at: at(2026, 3, 5, 8), grams: 0 },
      { at: at(2026, 3, 6, 8), grams: Number.NaN },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].grams).toBe(100);
  });
});

/* ------------------------------------------------------------------ */

function series(id: string, grams: number[], startDay = 3): ChartSeriesInput {
  return {
    kittenId: id,
    label: id,
    hex: '#3b82f6',
    entries: grams.map((g, i) => sample(2026, 3, startDay + i, 8, g)),
  };
}

describe('buildChartModel', () => {
  const birthDate = '2026-03-03';

  it('meldet einen leeren Zustand, wenn nichts gewogen wurde', () => {
    const m = buildChartModel({ series: [], birthDate, today: '2026-03-10' });
    expect(m.totalMeasurements).toBe(0);
    expect(m.series).toEqual([]);
    expect(m.xTicks.length).toBeGreaterThan(0);
  });

  it('zeichnet bei einer einzigen Messung einen Punkt und keine Linie', () => {
    const m = buildChartModel({ series: [series('a', [95])], birthDate });
    expect(m.totalMeasurements).toBe(1);
    expect(m.series[0].path).toBe('');
    expect(m.series[0].dots).toHaveLength(1);
    expect(m.series[0].nodes).toHaveLength(1);
    expect(Number.isFinite(m.series[0].dots[0].px)).toBe(true);
    expect(Number.isFinite(m.series[0].dots[0].py)).toBe(true);
  });

  it('zeichnet zwei Messungen desselben Tages als sichtbare Linie', () => {
    const m = buildChartModel({
      series: [
        {
          kittenId: 'a',
          label: 'Rot',
          hex: '#e5484d',
          entries: [sample(2026, 3, 3, 8, 95), sample(2026, 3, 3, 20, 101)],
        },
      ],
      birthDate,
    });
    expect(m.series[0].nodes).toHaveLength(1);
    expect(m.series[0].dots).toHaveLength(2);
    expect(m.series[0].path).toContain('L');
  });

  it('legt alle Punkte innerhalb der Zeichenfläche ab', () => {
    const m = buildChartModel({
      series: [series('a', [92, 105, 118, 130, 145])],
      birthDate,
      width: 340,
      height: 200,
    });
    const { plot } = m;
    for (const dot of m.series[0].dots) {
      expect(dot.px).toBeGreaterThanOrEqual(plot.x - 0.01);
      expect(dot.px).toBeLessThanOrEqual(plot.x + plot.w + 0.01);
      expect(dot.py).toBeGreaterThanOrEqual(plot.y - 0.01);
      expect(dot.py).toBeLessThanOrEqual(plot.y + plot.h + 0.01);
    }
  });

  it('hebt das betrachtete Kitten hervor und zeichnet es zuletzt', () => {
    const m = buildChartModel({
      series: [series('a', [92, 105]), series('b', [95, 108]), series('c', [90, 99])],
      focusKittenId: 'b',
      birthDate,
    });
    expect(m.series[m.series.length - 1].kittenId).toBe('b');
    expect(m.series.filter((s) => s.focus).map((s) => s.kittenId)).toEqual(['b']);
  });

  it('behandelt ohne Auswahl alle Reihen gleich stark', () => {
    const m = buildChartModel({ series: [series('a', [92]), series('b', [95])], birthDate });
    expect(m.series.every((s) => s.focus)).toBe(true);
  });

  it('bleibt mit neun Kitten lesbar: eine Reihe je Kitten, gemeinsame Achse', () => {
    const many = Array.from({ length: 9 }, (_, i) => series(`k${i}`, [90 + i, 100 + i, 112 + i]));
    const m = buildChartModel({ series: many, focusKittenId: 'k4', birthDate });
    expect(m.series).toHaveLength(9);
    expect(m.totalMeasurements).toBe(27);
    expect(m.yTicks.length).toBeLessThanOrEqual(7);
    expect(m.xTicks.length).toBeLessThanOrEqual(8);
    expect(m.domain.y0).toBeLessThanOrEqual(90);
    expect(m.domain.y1).toBeGreaterThanOrEqual(120);
  });

  it('verkraftet Lücken und mehrere Messungen am Tag', () => {
    const m = buildChartModel({
      series: [
        {
          kittenId: 'a',
          label: 'Rot',
          hex: '#e5484d',
          entries: [
            sample(2026, 3, 3, 8, 92),
            sample(2026, 3, 3, 20, 98),
            // 4. und 5. März übersprungen
            sample(2026, 3, 6, 9, 130),
          ],
        },
      ],
      birthDate,
    });
    expect(m.series[0].dots).toHaveLength(3);
    expect(m.series[0].nodes).toHaveLength(2);
    expect(m.series[0].nodes[0].grams).toBe(95);
    expect(m.series[0].nodes[0].count).toBe(2);
  });

  it('zählt ohne Geburtsdatum ab der ersten Wiegung', () => {
    const m = buildChartModel({ series: [series('a', [300, 320], 10)] });
    expect(m.xMode).toBe('elapsed');
    expect(m.baseDate).toBe('2026-03-10');
    expect(m.xAxisLabel).toBe('Tage seit der ersten Wiegung');
    expect(m.series[0].nodes[0].x).toBe(0);
  });

  it('nennt die Achse mit Geburtsdatum „Alter in Tagen"', () => {
    const m = buildChartModel({ series: [series('a', [92])], birthDate });
    expect(m.xMode).toBe('age');
    expect(m.xAxisLabel).toBe('Alter in Tagen');
    expect(m.baseDate).toBe(birthDate);
  });

  it('merkt sich das jeweils letzte Gewicht je Reihe', () => {
    const m = buildChartModel({ series: [series('a', [92, 140])], birthDate });
    expect(m.series[0].latestGrams).toBe(140);
  });
});
