import { describe, expect, it } from 'vitest';
import { analyzeWeights, dailyAverages, gainPerDay, litterAverageWeight } from './weight';
import { DEFAULT_SETTINGS } from '../types';

const T = DEFAULT_SETTINGS.weight; // gut ab 7, beobachten ab 6, Sorgenkind unter 80 g

/** Bequemer Erzeuger: Tag-Offset in Tagen ab dem 03.03.2026, 08:00 Uhr. */
function w(dayOffset: number, grams: number, hour = 8) {
  const d = new Date(2026, 2, 3, hour, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return { at: d.toISOString(), grams };
}

describe('gainPerDay', () => {
  it('braucht mindestens zwei Messungen', () => {
    expect(gainPerDay([w(0, 90)])).toBeUndefined();
    expect(gainPerDay([])).toBeUndefined();
  });

  it('rechnet über den echten Zeitabstand, nicht über Kalendertage', () => {
    const r = gainPerDay([w(0, 100), w(2, 120)]);
    expect(r?.value).toBeCloseTo(10, 5);
    expect(r?.days).toBeCloseTo(2, 5);
  });

  it('geht über mehrere Messungen am selben Tag hinweg zurück', () => {
    // Zwei Messungen am selben Tag ergäben sonst eine Division durch fast null.
    const r = gainPerDay([w(0, 100), w(2, 118, 8), w(2, 122, 20)]);
    expect(r).toBeDefined();
    expect(r!.days).toBeGreaterThan(1);
    expect(Number.isFinite(r!.value)).toBe(true);
  });

  it('liefert nichts, wenn alle Messungen auf denselben Zeitpunkt fallen', () => {
    expect(gainPerDay([w(0, 100, 8), w(0, 102, 8)])).toBeUndefined();
  });

  it('kommt mit Lücken zurecht', () => {
    const r = gainPerDay([w(0, 100), w(7, 170)]);
    expect(r?.value).toBeCloseTo(10, 5);
  });

  it('erkennt Gewichtsverlust', () => {
    const r = gainPerDay([w(0, 120), w(1, 112)]);
    expect(r?.value).toBeLessThan(0);
  });
});

describe('analyzeWeights', () => {
  it('meldet fehlende Daten', () => {
    const a = analyzeWeights([], T);
    expect(a.level).toBe('unknown');
    expect(a.latest).toBeUndefined();
  });

  it('braucht für eine Bewertung eine zweite Wiegung', () => {
    const a = analyzeWeights([w(0, 90)], T);
    expect(a.level).toBe('unknown');
    expect(a.reasons.join(' ')).toContain('zweite Wiegung');
    expect(a.latest?.grams).toBe(90);
  });

  it('stuft gute Zunahme als in Ordnung ein', () => {
    const a = analyzeWeights([w(0, 90), w(1, 101), w(2, 112)], T);
    expect(a.level).toBe('ok');
    expect(a.gainPerDay).toBeCloseTo(11, 1);
  });

  it('stuft Zunahme zwischen 6 und 7 g als beobachten ein', () => {
    const a = analyzeWeights([w(0, 100), w(2, 113)], T); // 6,5 g/Tag
    expect(a.level).toBe('watch');
  });

  it('stuft Zunahme unter 6 g als auffällig ein', () => {
    const a = analyzeWeights([w(0, 100), w(2, 108)], T); // 4 g/Tag
    expect(a.level).toBe('concern');
  });

  it('stuft Gewichtsverlust als kritisch ein', () => {
    const a = analyzeWeights([w(0, 120), w(1, 112)], T);
    expect(a.level).toBe('critical');
    expect(a.reasons.join(' ')).toContain('Gewichtsverlust');
  });

  it('stuft Stillstand als kritisch ein', () => {
    const a = analyzeWeights([w(0, 120), w(2, 120)], T);
    expect(a.level).toBe('critical');
  });

  it('meldet ein nicht wieder erreichtes Geburtsgewicht nach 48 Stunden', () => {
    const a = analyzeWeights([w(0, 95), w(1, 92), w(2, 93)], T, {
      birthWeightG: 95,
      ageDays: 2,
    });
    expect(a.level).toBe('critical');
    expect(a.reasons.join(' ')).toContain('Geburtsgewicht');
  });

  it('meldet das nicht vor Ablauf von 48 Stunden', () => {
    const a = analyzeWeights([w(0, 95), w(1, 96)], T, { birthWeightG: 95, ageDays: 1 });
    expect(a.reasons.join(' ')).not.toContain('noch nicht wieder erreicht');
  });

  it('markiert ein Geburtsgewicht unter 80 g als auffällig', () => {
    const a = analyzeWeights([w(0, 74), w(1, 85), w(2, 96)], T, { birthWeightG: 74 });
    expect(a.level).toBe('concern');
    expect(a.reasons.join(' ')).toContain('unter 80 g');
  });

  it('markiert deutlichen Rückstand zum Wurfdurchschnitt', () => {
    const a = analyzeWeights([w(0, 90), w(1, 101), w(2, 112)], T, { litterAverageG: 150 });
    expect(a.level).toBe('concern');
    expect(a.reasons.join(' ')).toContain('unter dem Wurfdurchschnitt');
  });

  it('lässt einen geringen Rückstand zum Wurfdurchschnitt durchgehen', () => {
    const a = analyzeWeights([w(0, 90), w(1, 101), w(2, 112)], T, { litterAverageG: 120 });
    expect(a.level).toBe('ok');
  });

  it('Gewichtsverlust bleibt kritisch, auch wenn andere Punkte auffällig sind', () => {
    const a = analyzeWeights([w(0, 120), w(1, 110)], T, {
      birthWeightG: 70,
      litterAverageG: 200,
    });
    expect(a.level).toBe('critical');
  });

  it('rechnet die Zunahme seit Geburt in Prozent', () => {
    const a = analyzeWeights([w(0, 100), w(5, 200)], T, { birthWeightG: 100 });
    expect(a.gainSinceBirthRatio).toBeCloseTo(1, 5);
  });

  it('nennt den Unterschied zur vorherigen Messung', () => {
    const a = analyzeWeights([w(0, 100), w(1, 111)], T);
    expect(a.lastChangeG).toBe(11);
  });

  it('ignoriert unsinnige Messwerte', () => {
    const a = analyzeWeights(
      [w(0, 100), { at: w(1, 0).at, grams: 0 }, { at: w(2, 0).at, grams: Number.NaN }, w(3, 133)],
      T,
    );
    expect(a.latest?.grams).toBe(133);
    expect(a.level).toBe('ok');
  });

  it('sortiert unsortierte Eingaben', () => {
    const a = analyzeWeights([w(2, 112), w(0, 90), w(1, 101)], T);
    expect(a.latest?.grams).toBe(112);
    expect(a.level).toBe('ok');
  });
});

describe('litterAverageWeight', () => {
  it('mittelt die jeweils letzten Messungen', () => {
    const m = new Map([
      ['a', [w(0, 100), w(2, 140)]],
      ['b', [w(0, 100), w(2, 160)]],
    ]);
    expect(litterAverageWeight(m)).toBe(150);
  });

  it('lässt das betrachtete Kitten außen vor', () => {
    const m = new Map([
      ['a', [w(2, 100)]],
      ['b', [w(2, 200)]],
    ]);
    expect(litterAverageWeight(m, 'a')).toBe(200);
  });

  it('ignoriert Kitten ohne Messung', () => {
    const m = new Map([
      ['a', [w(2, 100)]],
      ['b', []],
    ]);
    expect(litterAverageWeight(m)).toBe(100);
  });

  it('liefert nichts, wenn niemand gewogen wurde', () => {
    expect(litterAverageWeight(new Map([['a', []]]))).toBeUndefined();
  });
});

describe('dailyAverages', () => {
  it('fasst mehrere Messungen eines Tages zusammen', () => {
    const r = dailyAverages([w(0, 100, 7), w(0, 110, 20), w(1, 130, 8)]);
    expect(r).toHaveLength(2);
    expect(r[0].grams).toBe(105);
    expect(r[1].grams).toBe(130);
  });

  it('liefert die Tage in aufsteigender Reihenfolge', () => {
    const r = dailyAverages([w(3, 150), w(0, 100), w(1, 120)]);
    expect(r.map((x) => x.date)).toEqual(['2026-03-03', '2026-03-04', '2026-03-06']);
  });
});
