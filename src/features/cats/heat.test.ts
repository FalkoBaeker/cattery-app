import { describe, expect, it } from 'vitest';
import {
  MIN_CYCLES_FOR_PREDICTION,
  analyzeHeatCycles,
  isValidISODate,
  normalizeHeatCycles,
} from './heat';

describe('isValidISODate', () => {
  it('nimmt echte Datumsangaben an', () => {
    expect(isValidISODate('2026-03-03')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true);
  });

  it('lehnt Unmögliches und Unfug ab', () => {
    expect(isValidISODate('2026-02-31')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('03.03.2026')).toBe(false);
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate(null)).toBe(false);
    expect(isValidISODate(undefined)).toBe(false);
    expect(isValidISODate(20260303)).toBe(false);
  });
});

describe('normalizeHeatCycles', () => {
  it('kommt mit leerer und fehlender Liste zurecht', () => {
    expect(normalizeHeatCycles([]).cycles).toEqual([]);
    expect(normalizeHeatCycles(undefined).cycles).toEqual([]);
    expect(normalizeHeatCycles(null).cycles).toEqual([]);
  });

  it('sortiert Einträge in falscher Reihenfolge', () => {
    const { cycles } = normalizeHeatCycles([
      { id: 'c', startDate: '2026-03-01' },
      { id: 'a', startDate: '2026-01-01' },
      { id: 'b', startDate: '2026-02-01' },
    ]);
    expect(cycles.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('wirft Einträge ohne brauchbaren Beginn weg', () => {
    const { cycles, ignoredCount } = normalizeHeatCycles([
      { id: 'ok', startDate: '2026-01-01' },
      { id: 'leer', startDate: '' },
      { id: 'null', startDate: null },
      { id: 'fehlt' },
      { id: 'unmoeglich', startDate: '2026-02-31' },
    ]);
    expect(cycles).toHaveLength(1);
    expect(ignoredCount).toBe(4);
  });

  it('ignoriert ein Ende, das vor dem Beginn liegt', () => {
    const { cycles } = normalizeHeatCycles([{ startDate: '2026-03-10', endDate: '2026-03-01' }]);
    expect(cycles[0].endDate).toBeUndefined();
    expect(cycles[0].durationDays).toBeUndefined();
  });

  it('rechnet die Dauer einschließlich Beginn und Ende', () => {
    const { cycles } = normalizeHeatCycles([{ startDate: '2026-03-03', endDate: '2026-03-07' }]);
    expect(cycles[0].durationDays).toBe(5);
  });

  it('fasst überlappende Einträge zusammen', () => {
    const { cycles, mergedCount } = normalizeHeatCycles([
      { id: 'a', startDate: '2026-01-01', endDate: '2026-01-06' },
      { id: 'b', startDate: '2026-01-05', endDate: '2026-01-08' },
    ]);
    expect(cycles).toHaveLength(1);
    expect(mergedCount).toBe(1);
    expect(cycles[0]).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-01-08',
      durationDays: 8,
      merged: true,
    });
  });

  it('fasst zwei Einträge desselben Tages zusammen', () => {
    const { cycles, mergedCount } = normalizeHeatCycles([
      { startDate: '2026-01-01' },
      { startDate: '2026-01-01', endDate: '2026-01-05' },
    ]);
    expect(cycles).toHaveLength(1);
    expect(mergedCount).toBe(1);
    expect(cycles[0].endDate).toBe('2026-01-05');
  });

  it('lässt zwei offene Einträge dicht beieinander offen', () => {
    const { cycles } = normalizeHeatCycles([
      { startDate: '2026-03-01' },
      { startDate: '2026-03-02' },
    ]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].endDate).toBeUndefined();
  });

  it('trennt Einträge mit deutlichem Abstand', () => {
    const { cycles, mergedCount } = normalizeHeatCycles([
      { startDate: '2026-01-01', endDate: '2026-01-05' },
      { startDate: '2026-01-10' },
    ]);
    expect(cycles).toHaveLength(2);
    expect(mergedCount).toBe(0);
  });
});

describe('analyzeHeatCycles', () => {
  it('sagt bei null Einträgen ehrlich, dass nichts da ist', () => {
    const a = analyzeHeatCycles([], '2026-03-03');
    expect(a.count).toBe(0);
    expect(a.intervals).toEqual([]);
    expect(a.prediction).toBeUndefined();
    expect(a.last).toBeUndefined();
    expect(a.ongoing).toBe(false);
    expect(a.summary).toBe('Noch keine Rolligkeit erfasst.');
  });

  it('sagt bei einem Eintrag, dass es für einen Zyklus nicht reicht', () => {
    const a = analyzeHeatCycles([{ startDate: '2026-02-01' }], '2026-03-03');
    expect(a.count).toBe(1);
    expect(a.intervals).toEqual([]);
    expect(a.averageDays).toBeUndefined();
    expect(a.prediction).toBeUndefined();
    expect(a.summary).toContain('mindestens drei');
  });

  it('rechnet bei zwei Einträgen den Abstand, sagt aber nichts voraus', () => {
    const a = analyzeHeatCycles(
      [{ startDate: '2026-01-01' }, { startDate: '2026-01-22' }],
      '2026-02-01',
    );
    expect(a.intervals).toEqual([21]);
    expect(a.averageDays).toBe(21);
    expect(a.medianDays).toBe(21);
    expect(a.prediction).toBeUndefined();
    expect(a.summary).toContain('21 Tage');
  });

  it('sagt ab drei Zyklen den nächsten Beginn voraus', () => {
    const a = analyzeHeatCycles(
      [
        { startDate: '2026-01-01' },
        { startDate: '2026-01-22' },
        { startDate: '2026-02-12' },
      ],
      '2026-02-20',
    );
    expect(a.count).toBe(MIN_CYCLES_FOR_PREDICTION);
    expect(a.intervals).toEqual([21, 21]);
    expect(a.prediction).toMatchObject({
      date: '2026-03-05',
      earliest: '2026-03-05',
      latest: '2026-03-05',
      basedOnCycles: 3,
      basedOnIntervals: 2,
      overdueDays: 0,
    });
  });

  it('meldet einen überfälligen Termin', () => {
    const a = analyzeHeatCycles(
      [
        { startDate: '2026-01-01' },
        { startDate: '2026-01-22' },
        { startDate: '2026-02-12' },
      ],
      '2026-03-10',
    );
    expect(a.prediction?.overdueDays).toBe(5);
  });

  it('gibt eine Spanne aus dem kürzesten und längsten Abstand an', () => {
    const a = analyzeHeatCycles(
      [
        { startDate: '2026-01-01' },
        { startDate: '2026-01-19' },
        { startDate: '2026-02-12' },
        { startDate: '2026-03-05' },
      ],
      '2026-03-06',
    );
    expect(a.intervals).toEqual([18, 24, 21]);
    expect(a.medianDays).toBe(21);
    expect(a.minDays).toBe(18);
    expect(a.maxDays).toBe(24);
    expect(a.prediction).toMatchObject({
      date: '2026-03-26',
      earliest: '2026-03-23',
      latest: '2026-03-29',
      basedOnIntervals: 3,
    });
  });

  it('rechnet Mittelwert, Median und Streuung', () => {
    const a = analyzeHeatCycles(
      [
        { startDate: '2026-01-01' },
        { startDate: '2026-01-21' }, // 20
        { startDate: '2026-02-20' }, // 30
      ],
      '2026-02-21',
    );
    expect(a.intervals).toEqual([20, 30]);
    expect(a.averageDays).toBe(25);
    expect(a.medianDays).toBe(25);
    expect(a.spreadDays).toBe(5);
  });

  it('lässt sich vom Sommerzeitwechsel nicht stören', () => {
    // In Deutschland wird in der Nacht auf den 29.03.2026 umgestellt.
    const a = analyzeHeatCycles(
      [{ startDate: '2026-03-20' }, { startDate: '2026-04-10' }],
      '2026-04-11',
    );
    expect(a.intervals).toEqual([21]);
  });

  it('rechnet über den 29. Februar eines Schaltjahres', () => {
    const a = analyzeHeatCycles(
      [
        { startDate: '2028-01-10' },
        { startDate: '2028-01-31' },
        { startDate: '2028-02-21' },
      ],
      '2028-02-22',
    );
    expect(a.intervals).toEqual([21, 21]);
    expect(a.prediction?.date).toBe('2028-03-13');
  });

  it('erkennt eine laufende Rolligkeit ohne Ende', () => {
    const a = analyzeHeatCycles([{ startDate: '2026-03-01' }], '2026-03-04');
    expect(a.ongoing).toBe(true);
    expect(a.daysSinceLastStart).toBe(3);
  });

  it('hält einen alten offenen Eintrag nicht für laufend', () => {
    const a = analyzeHeatCycles([{ startDate: '2026-01-01' }], '2026-06-01');
    expect(a.ongoing).toBe(false);
  });

  it('hält eine abgeschlossene Rolligkeit nicht für laufend', () => {
    const a = analyzeHeatCycles(
      [{ startDate: '2026-03-01', endDate: '2026-03-05' }],
      '2026-03-06',
    );
    expect(a.ongoing).toBe(false);
  });

  it('rechnet die mittlere Dauer nur aus Einträgen mit Ende', () => {
    const a = analyzeHeatCycles(
      [
        { startDate: '2026-01-01', endDate: '2026-01-05' }, // 5 Tage
        { startDate: '2026-02-01', endDate: '2026-02-07' }, // 7 Tage
        { startDate: '2026-03-01' }, // ohne Ende
      ],
      '2026-03-02',
    );
    expect(a.averageDurationDays).toBe(6);
  });

  it('verzerrt den Zyklus nicht durch einen doppelt erfassten Eintrag', () => {
    const a = analyzeHeatCycles(
      [
        { startDate: '2026-01-01' },
        { startDate: '2026-01-02' }, // versehentlich zweimal eingetragen
        { startDate: '2026-01-22' },
        { startDate: '2026-02-12' },
      ],
      '2026-02-13',
    );
    expect(a.count).toBe(3);
    expect(a.mergedCount).toBe(1);
    expect(a.intervals).toEqual([21, 21]);
  });

  it('zählt unbrauchbare Einträge, ohne die Auswertung zu verlieren', () => {
    const a = analyzeHeatCycles(
      [{ startDate: '2026-01-01' }, { startDate: 'unsinn' }],
      '2026-01-02',
    );
    expect(a.count).toBe(1);
    expect(a.ignoredCount).toBe(1);
  });
});
