import { describe, expect, it } from 'vitest';
import type { WeightEntry } from '../../types';
import { dateOf } from '../../lib/date';
import { entriesOnDate, localDateTime, monthCells, monthStart, suggestedTime } from './backfill';

function entry(id: string, date: string, time: string, grams = 100): WeightEntry {
  return { id, kittenId: 'k1', at: localDateTime(date, time)!, grams };
}

describe('Nachtragskalender', () => {
  it('beginnt Wochen montags und bildet auch Schaltjahre vollständig ab', () => {
    const cells = monthCells('2024-02-17');
    expect(monthStart('2024-02-17')).toBe('2024-02-01');
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells.filter(Boolean)).toHaveLength(29);
    expect(cells.length % 7).toBe(0);
  });

  it('verbindet Datum und Uhrzeit in lokaler Zeit ohne Tagesverschiebung', () => {
    const at = localDateTime('2026-03-29', '08:15');
    expect(at).not.toBeNull();
    expect(dateOf(at!)).toBe('2026-03-29');
    expect(new Date(at!).getHours()).toBe(8);
    expect(localDateTime('2026-03-29', '25:00')).toBeNull();
  });

  it('zeigt nur Messungen des gewählten Tages in richtiger Reihenfolge', () => {
    const entries = [
      entry('w2', '2026-03-03', '20:00', 110),
      entry('w3', '2026-03-04', '08:00', 115),
      entry('w1', '2026-03-03', '08:00', 100),
    ];
    expect(entriesOnDate(entries, '2026-03-03').map((value) => value.id)).toEqual(['w1', 'w2']);
  });

  it('schlägt erst morgens und danach abends vor', () => {
    expect(suggestedTime([])).toBe('08:00');
    expect(suggestedTime([entry('w1', '2026-03-03', '08:12')])).toBe('20:00');
    expect(suggestedTime([entry('w1', '2026-03-03', '20:12')])).toBe('08:00');
  });
});
