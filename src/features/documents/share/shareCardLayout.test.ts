import { describe, it, expect } from 'vitest';
import {
  buildGreeting,
  buildShareCardModel,
  curveGeometry,
  formatDayCount,
  formatWeekHint,
} from './shareCardLayout';

const BOX = { x: 0, y: 0, width: 100, height: 100 };

describe('buildGreeting', () => {
  it('setzt den Namen in die Anrede', () => {
    expect(buildGreeting('Familie Schulz')).toBe('Hallo Familie Schulz,');
  });

  it('räumt Leerzeichen auf', () => {
    expect(buildGreeting('  Familie   Schulz  ')).toBe('Hallo Familie Schulz,');
  });

  it('kommt ohne Namen aus', () => {
    expect(buildGreeting(null)).toBe('Hallo,');
    expect(buildGreeting(undefined)).toBe('Hallo,');
    expect(buildGreeting('   ')).toBe('Hallo,');
  });
});

describe('Altersangaben', () => {
  it('schreibt den Tag, wie sie es schreibt', () => {
    expect(formatDayCount(24)).toBe('Tag 24');
    expect(formatDayCount(0)).toBe('Tag 0');
  });

  it('schweigt bei fehlendem oder unsinnigem Alter', () => {
    expect(formatDayCount(null)).toBe('');
    expect(formatDayCount(undefined)).toBe('');
    expect(formatDayCount(-3)).toBe('');
    expect(formatDayCount(Number.NaN)).toBe('');
  });

  it('nennt Wochen erst ab Tag 14', () => {
    expect(formatWeekHint(13)).toBe('');
    expect(formatWeekHint(14)).toBe('2 Wochen alt');
    expect(formatWeekHint(24)).toBe('3 Wochen, 3 Tage alt');
    expect(formatWeekHint(22)).toBe('3 Wochen, 1 Tag alt');
  });
});

describe('curveGeometry', () => {
  it('gibt bei leerer Liste nichts zurück', () => {
    expect(curveGeometry([], BOX)).toBeNull();
  });

  it('setzt einen einzelnen Punkt in die Mitte', () => {
    const geo = curveGeometry([{ date: '2026-03-03', grams: 120 }], BOX, 10);
    expect(geo).not.toBeNull();
    expect(geo!.path).toHaveLength(1);
    expect(geo!.path[0].x).toBeCloseTo(50, 6);
    expect(geo!.minGrams).toBe(120);
    expect(geo!.maxGrams).toBe(120);
  });

  it('zeichnet bei gleichen Werten eine waagerechte Linie', () => {
    const geo = curveGeometry(
      [
        { date: '2026-03-01', grams: 100 },
        { date: '2026-03-02', grams: 100 },
        { date: '2026-03-03', grams: 100 },
      ],
      BOX,
      10,
    );
    const ys = geo!.path.map((p) => p.y);
    expect(new Set(ys.map((y) => y.toFixed(6))).size).toBe(1);
  });

  it('steigt nach oben, wenn das Gewicht steigt', () => {
    const geo = curveGeometry(
      [
        { date: '2026-03-01', grams: 90 },
        { date: '2026-03-05', grams: 150 },
      ],
      BOX,
      10,
    );
    expect(geo!.path[1].y).toBeLessThan(geo!.path[0].y);
    expect(geo!.path[0].x).toBeCloseTo(10, 6);
    expect(geo!.path[1].x).toBeCloseTo(90, 6);
  });

  it('bildet Lücken beim Wiegen als echten Abstand ab', () => {
    const geo = curveGeometry(
      [
        { date: '2026-03-01', grams: 90 },
        { date: '2026-03-02', grams: 100 },
        { date: '2026-03-11', grams: 200 },
      ],
      BOX,
      0,
    );
    // 1 von 10 Tagen -> 10 % der Breite.
    expect(geo!.path[1].x).toBeCloseTo(10, 6);
    expect(geo!.path[2].x).toBeCloseTo(100, 6);
  });

  it('rechnet über den Sommerzeitwechsel richtig', () => {
    // 29.03.2026 ist in Deutschland der Umstellungstag.
    const geo = curveGeometry(
      [
        { date: '2026-03-28', grams: 100 },
        { date: '2026-03-29', grams: 110 },
        { date: '2026-03-30', grams: 120 },
      ],
      BOX,
      0,
    );
    expect(geo!.path[1].x).toBeCloseTo(50, 6);
    expect(geo!.path[2].x).toBeCloseTo(100, 6);
  });

  it('rechnet über den Schalttag richtig', () => {
    const geo = curveGeometry(
      [
        { date: '2028-02-28', grams: 100 },
        { date: '2028-02-29', grams: 110 },
        { date: '2028-03-01', grams: 120 },
      ],
      BOX,
      0,
    );
    expect(geo!.path[1].x).toBeCloseTo(50, 6);
  });

  it('sortiert unsortierte Eingaben und wirft Unsinn weg', () => {
    const geo = curveGeometry(
      [
        { date: '2026-03-05', grams: 150 },
        { date: '2026-03-01', grams: 90 },
        { date: '2026-03-03', grams: Number.NaN },
        { date: '2026-03-04', grams: 0 },
      ],
      BOX,
      0,
    );
    expect(geo!.path).toHaveLength(2);
    expect(geo!.path[0].x).toBeLessThan(geo!.path[1].x);
  });

  it('bleibt innerhalb des Kastens', () => {
    const geo = curveGeometry(
      [
        { date: '2026-03-01', grams: 80 },
        { date: '2026-03-10', grams: 300 },
      ],
      { x: 20, y: 40, width: 200, height: 60 },
      8,
    );
    for (const p of geo!.path) {
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThanOrEqual(220);
      expect(p.y).toBeGreaterThanOrEqual(40);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });
});

describe('buildShareCardModel', () => {
  it('setzt alle Zeilen zusammen', () => {
    const model = buildShareCardModel({
      interestName: 'Familie Schulz',
      kittenName: 'Mira',
      ageDays: 24,
      latestGrams: 412.4,
      message: '  Sie schnurrt schon.  ',
      catteryName: 'von der Blauen Wiese',
    });
    expect(model.greeting).toBe('Hallo Familie Schulz,');
    expect(model.kittenName).toBe('Mira');
    expect(model.dayCount).toBe('Tag 24');
    expect(model.weightText).toBe('412 g');
    expect(model.message).toBe('Sie schnurrt schon.');
    expect(model.footer).toBe('von der Blauen Wiese');
  });

  it('lässt die Anrede überschreiben', () => {
    const model = buildShareCardModel({
      interestName: 'Familie Schulz',
      greetingOverride: 'Liebe Anna,',
      kittenName: 'Mira',
    });
    expect(model.greeting).toBe('Liebe Anna,');
  });

  it('fällt bei leerer Überschreibung auf den Interessenten zurück', () => {
    const model = buildShareCardModel({
      interestName: 'Familie Schulz',
      greetingOverride: '   ',
      kittenName: 'Mira',
    });
    expect(model.greeting).toBe('Hallo Familie Schulz,');
  });

  it('kommt mit fast leeren Angaben zurecht', () => {
    const model = buildShareCardModel({ kittenName: '' });
    expect(model.kittenName).toBe('Unser Kitten');
    expect(model.dayCount).toBe('');
    expect(model.weightText).toBe('');
    expect(model.message).toBe('');
    expect(model.samples).toEqual([]);
  });

  it('zeigt kein Gewicht, wenn keines erfasst wurde', () => {
    expect(buildShareCardModel({ kittenName: 'Mira', latestGrams: 0 }).weightText).toBe('');
    expect(buildShareCardModel({ kittenName: 'Mira', latestGrams: null }).weightText).toBe('');
  });
});
