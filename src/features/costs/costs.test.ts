import { describe, expect, it } from 'vitest';
import {
  litterIdOf,
  sortEntriesNewestFirst,
  sumCents,
  summarizeAll,
  summarizeByCategory,
  summarizeCats,
  summarizeKittenRevenues,
  summarizeLitter,
  summarizeLitters,
  unassignedCosts,
  unassignedRevenues,
} from './costs';
import type { CostEntry, RevenueEntry } from '../../types';

const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

let counter = 0;
function cost(over: Partial<CostEntry> = {}): CostEntry {
  counter += 1;
  return {
    id: `c${counter}`,
    date: '2026-03-01',
    category: 'vet',
    amountCents: 10_000,
    ...STAMP,
    ...over,
  };
}

function revenue(over: Partial<RevenueEntry> = {}): RevenueEntry {
  counter += 1;
  return {
    id: `r${counter}`,
    date: '2026-06-01',
    amountCents: 250_000,
    ...STAMP,
    ...over,
  };
}

describe('sumCents', () => {
  it('summiert eine leere Liste zu null', () => {
    expect(sumCents([])).toBe(0);
  });

  it('summiert Ganzzahlen in Cent', () => {
    expect(sumCents([{ amountCents: 1999 }, { amountCents: 1 }])).toBe(2000);
  });

  it('überspringt fehlende und kaputte Werte', () => {
    expect(
      sumCents([{ amountCents: 500 }, { amountCents: null }, { amountCents: Number.NaN }, {}]),
    ).toBe(500);
  });

  it('verrechnet Gutschriften als negative Beträge', () => {
    expect(sumCents([{ amountCents: 5000 }, { amountCents: -2000 }])).toBe(3000);
  });
});

describe('litterIdOf', () => {
  const map = new Map([['kit-1', 'litter-9']]);

  it('bevorzugt den ausdrücklich gewählten Wurf', () => {
    expect(litterIdOf({ litterId: 'litter-1', kittenId: 'kit-1' }, map)).toBe('litter-1');
  });

  it('leitet den Wurf über das Kitten ab', () => {
    expect(litterIdOf({ kittenId: 'kit-1' }, map)).toBe('litter-9');
  });

  it('bleibt ohne Zuordnung leer', () => {
    expect(litterIdOf({}, map)).toBeUndefined();
    expect(litterIdOf({ kittenId: 'unbekannt' }, map)).toBeUndefined();
  });
});

describe('summarizeByCategory', () => {
  it('liefert für eine leere Liste nichts', () => {
    expect(summarizeByCategory([])).toEqual([]);
  });

  it('bündelt gleiche Kategorien und sortiert nach Betrag', () => {
    const result = summarizeByCategory([
      cost({ category: 'food', amountCents: 3000 }),
      cost({ category: 'vet', amountCents: 12_000 }),
      cost({ category: 'vet', amountCents: 8_000 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ category: 'vet', totalCents: 20_000, count: 2 });
    expect(result[0].label).toBe('Tierarzt');
    expect(result[1]).toMatchObject({ category: 'food', totalCents: 3000, count: 1 });
  });
});

describe('summarizeLitter', () => {
  it('bleibt bei leeren Listen bei null', () => {
    const f = summarizeLitter('litter-1', [], []);
    expect(f).toMatchObject({
      costCents: 0,
      revenueCents: 0,
      resultCents: 0,
      costCount: 0,
      revenueCount: 0,
    });
    expect(f.byCategory).toEqual([]);
  });

  it('rechnet Kosten, Erlöse und Ergebnis', () => {
    const f = summarizeLitter(
      'litter-1',
      [
        cost({ litterId: 'litter-1', amountCents: 40_000, category: 'vet' }),
        cost({ litterId: 'litter-1', amountCents: 15_000, category: 'food' }),
        cost({ litterId: 'litter-2', amountCents: 99_000 }),
      ],
      [
        revenue({ litterId: 'litter-1', amountCents: 250_000 }),
        revenue({ litterId: 'litter-2', amountCents: 250_000 }),
      ],
    );
    expect(f.costCents).toBe(55_000);
    expect(f.revenueCents).toBe(250_000);
    expect(f.resultCents).toBe(195_000);
    expect(f.costCount).toBe(2);
  });

  it('zeigt ein negatives Ergebnis, wenn draufgelegt wurde', () => {
    const f = summarizeLitter(
      'litter-1',
      [cost({ litterId: 'litter-1', amountCents: 300_000 })],
      [revenue({ litterId: 'litter-1', amountCents: 250_000 })],
    );
    expect(f.resultCents).toBe(-50_000);
  });

  it('zieht Kosten am Kitten zum Wurf des Kittens', () => {
    const kittenToLitter = new Map([['kit-1', 'litter-1']]);
    const f = summarizeLitter(
      'litter-1',
      [cost({ kittenId: 'kit-1', amountCents: 7_500, category: 'neutering' })],
      [revenue({ kittenId: 'kit-1', amountCents: 250_000 })],
      kittenToLitter,
    );
    expect(f.costCents).toBe(7_500);
    expect(f.revenueCents).toBe(250_000);
  });

  it('ignoriert Belege ohne Zuordnung', () => {
    const f = summarizeLitter('litter-1', [cost({ amountCents: 5_000 })], []);
    expect(f.costCents).toBe(0);
  });
});

describe('summarizeLitters', () => {
  it('liefert auch für Würfe ohne Belege einen Eintrag', () => {
    const map = summarizeLitters(['a', 'b'], [], []);
    expect(map.size).toBe(2);
    expect(map.get('b')).toMatchObject({ costCents: 0, resultCents: 0 });
  });

  it('verteilt Belege auf die richtigen Würfe', () => {
    const map = summarizeLitters(
      ['a', 'b'],
      [
        cost({ litterId: 'a', amountCents: 1000 }),
        cost({ litterId: 'b', amountCents: 2000 }),
        cost({ litterId: 'unbekannt', amountCents: 9999 }),
      ],
      [revenue({ litterId: 'a', amountCents: 5000 })],
    );
    expect(map.get('a')).toMatchObject({ costCents: 1000, revenueCents: 5000, resultCents: 4000 });
    expect(map.get('b')).toMatchObject({ costCents: 2000, revenueCents: 0, resultCents: -2000 });
  });

  it('kommt mit einer leeren Wurfliste zurecht', () => {
    expect(summarizeLitters([], [cost({ litterId: 'a' })], []).size).toBe(0);
  });
});

describe('summarizeCats', () => {
  it('bleibt leer, wenn keine Kosten am Tier hängen', () => {
    expect(summarizeCats([cost({ litterId: 'a' })]).size).toBe(0);
  });

  it('summiert je Tier und merkt sich den Zeitraum', () => {
    const map = summarizeCats([
      cost({ catId: 'cat-1', date: '2025-11-04', amountCents: 12_000, category: 'vet' }),
      cost({ catId: 'cat-1', date: '2026-02-28', amountCents: 8_000, category: 'food' }),
      cost({ catId: 'cat-2', date: '2026-01-01', amountCents: 5_000 }),
    ]);
    expect(map.get('cat-1')).toMatchObject({
      totalCents: 20_000,
      count: 2,
      firstDate: '2025-11-04',
      lastDate: '2026-02-28',
    });
    expect(map.get('cat-1')?.byCategory).toHaveLength(2);
    expect(map.get('cat-2')?.totalCents).toBe(5_000);
  });
});

describe('summarizeKittenRevenues', () => {
  it('summiert Erlöse je Kitten', () => {
    const map = summarizeKittenRevenues([
      revenue({ kittenId: 'k1', amountCents: 50_000 }),
      revenue({ kittenId: 'k1', amountCents: 200_000 }),
      revenue({ kittenId: 'k2', amountCents: 250_000 }),
      revenue({ litterId: 'l1', amountCents: 1_000 }),
    ]);
    expect(map.get('k1')).toMatchObject({ totalCents: 250_000, count: 2 });
    expect(map.get('k2')?.totalCents).toBe(250_000);
    expect(map.size).toBe(2);
  });

  it('bleibt bei leerer Liste leer', () => {
    expect(summarizeKittenRevenues([]).size).toBe(0);
  });
});

describe('nicht zugeordnete Belege', () => {
  it('findet Kosten ohne jede Zuordnung', () => {
    const list = [cost({ amountCents: 1000 }), cost({ litterId: 'a' }), cost({ catId: 'c' })];
    expect(unassignedCosts(list)).toHaveLength(1);
  });

  it('findet Erlöse ohne jede Zuordnung', () => {
    expect(unassignedRevenues([revenue(), revenue({ litterId: 'a' })])).toHaveLength(1);
  });
});

describe('summarizeAll', () => {
  it('rechnet das Gesamtbild', () => {
    const all = summarizeAll(
      [cost({ amountCents: 10_000 }), cost({ amountCents: 5_000 })],
      [revenue({ amountCents: 250_000 })],
    );
    expect(all).toEqual({
      costCents: 15_000,
      revenueCents: 250_000,
      resultCents: 235_000,
      costCount: 2,
      revenueCount: 1,
    });
  });

  it('bleibt bei leeren Listen bei null', () => {
    expect(summarizeAll([], [])).toMatchObject({ costCents: 0, revenueCents: 0, resultCents: 0 });
  });
});

describe('sortEntriesNewestFirst', () => {
  it('sortiert jüngste zuerst', () => {
    const list = [
      cost({ id: 'a', date: '2026-01-31' }),
      cost({ id: 'b', date: '2026-02-01' }),
      cost({ id: 'c', date: '2025-12-31' }),
    ];
    expect(sortEntriesNewestFirst(list).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('verändert die Ausgangsliste nicht', () => {
    const list = [cost({ id: 'a', date: '2026-01-01' }), cost({ id: 'b', date: '2026-02-01' })];
    sortEntriesNewestFirst(list);
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('kommt mit einer leeren Liste zurecht', () => {
    expect(sortEntriesNewestFirst([])).toEqual([]);
  });
});
