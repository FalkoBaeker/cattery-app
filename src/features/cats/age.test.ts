import { describe, expect, it } from 'vitest';
import { catAgeLabel, fullMonthsBetween } from './age';

describe('fullMonthsBetween', () => {
  it('zählt nur vollendete Monate', () => {
    expect(fullMonthsBetween('2026-01-31', '2026-02-28')).toBe(0);
    expect(fullMonthsBetween('2026-01-31', '2026-03-31')).toBe(2);
    expect(fullMonthsBetween('2026-01-15', '2027-01-14')).toBe(11);
    expect(fullMonthsBetween('2026-01-15', '2027-01-15')).toBe(12);
  });
});

describe('catAgeLabel', () => {
  it('sagt ohne Wurfdatum ehrlich Bescheid', () => {
    expect(catAgeLabel(undefined, '2026-07-30')).toBe('Alter unbekannt');
    expect(catAgeLabel(null, '2026-07-30')).toBe('Alter unbekannt');
    expect(catAgeLabel('', '2026-07-30')).toBe('Alter unbekannt');
    expect(catAgeLabel('2026-02-31', '2026-07-30')).toBe('Alter unbekannt');
  });

  it('erkennt ein Wurfdatum in der Zukunft', () => {
    expect(catAgeLabel('2026-08-01', '2026-07-30')).toBe('Wurfdatum liegt in der Zukunft');
  });

  it('zählt die ersten Tage in Tagen', () => {
    expect(catAgeLabel('2026-07-30', '2026-07-30')).toBe('heute geboren');
    expect(catAgeLabel('2026-07-29', '2026-07-30')).toBe('1 Tag');
    expect(catAgeLabel('2026-07-01', '2026-07-30')).toBe('29 Tage');
  });

  it('zählt danach in Monaten', () => {
    expect(catAgeLabel('2026-06-29', '2026-07-30')).toBe('1 Monat');
    expect(catAgeLabel('2025-12-30', '2026-07-30')).toBe('7 Monate');
  });

  it('zählt ab einem Jahr in Jahren und Monaten', () => {
    expect(catAgeLabel('2025-07-30', '2026-07-30')).toBe('1 Jahr');
    expect(catAgeLabel('2020-03-03', '2026-07-30')).toBe('6 Jahre, 4 Monate');
    expect(catAgeLabel('2024-07-30', '2026-08-30')).toBe('2 Jahre, 1 Monat');
  });

  it('kommt mit dem 29. Februar zurecht', () => {
    expect(catAgeLabel('2024-02-29', '2025-02-28')).toBe('11 Monate');
    expect(catAgeLabel('2024-02-29', '2025-03-01')).toBe('1 Jahr');
  });
});
