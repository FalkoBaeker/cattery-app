import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../types';
import {
  analyzeKitten,
  dayOfLife,
  dayOfLifeLabel,
  dayProgress,
  deltaToPrevious,
  latestDelta,
  measurementsOn,
  nextFocusId,
  parseGrams,
  previousSample,
} from './weighing';
import type { WeightSample } from './chart';

const T = DEFAULT_SETTINGS.weight;

function at(y: number, m: number, d: number, h = 8, min = 0): string {
  return new Date(y, m - 1, d, h, min, 0).toISOString();
}

function sample(y: number, m: number, d: number, h: number, grams: number): WeightSample {
  return { at: at(y, m, d, h), grams };
}

/* ------------------------------------------------------------------ */

describe('parseGrams', () => {
  it('nimmt reine Zahlen', () => {
    expect(parseGrams('245')).toEqual({ ok: true, grams: 245 });
    expect(parseGrams(' 92 ')).toEqual({ ok: true, grams: 92 });
  });

  it('nimmt „245 g" und Kommastellen und rundet auf ganze Gramm', () => {
    expect(parseGrams('245 g')).toEqual({ ok: true, grams: 245 });
    expect(parseGrams('245,4')).toEqual({ ok: true, grams: 245 });
    expect(parseGrams('245,6')).toEqual({ ok: true, grams: 246 });
  });

  it('meldet leere Eingaben auf Deutsch', () => {
    const r = parseGrams('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Bitte ein Gewicht eingeben.');
  });

  it('weist Buchstaben und unmögliche Werte ab', () => {
    expect(parseGrams('abc').ok).toBe(false);
    expect(parseGrams('0').ok).toBe(false);
    expect(parseGrams('-40').ok).toBe(false);
    expect(parseGrams('99999').ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe('nextFocusId', () => {
  const nine = Array.from({ length: 9 }, (_, i) => `k${i}`);

  it('springt zum nächsten Kitten', () => {
    expect(nextFocusId(['a', 'b', 'c'], 'a', new Set(['a']))).toBe('b');
  });

  it('überspringt bereits erfasste Kitten', () => {
    expect(nextFocusId(['a', 'b', 'c'], 'a', new Set(['a', 'b']))).toBe('c');
  });

  it('läuft am Ende der Liste wieder nach oben', () => {
    expect(nextFocusId(['a', 'b', 'c'], 'c', new Set(['c']))).toBe('a');
  });

  it('gibt null zurück, wenn alle erfasst sind', () => {
    expect(nextFocusId(['a', 'b', 'c'], 'c', new Set(['a', 'b', 'c']))).toBeNull();
  });

  /**
   * In Woche 1–2 wird zweimal täglich gewogen. Die Kette darf sich deshalb
   * am *Durchgang* orientieren, niemals am Tagesfortschritt — sonst wäre
   * abends jedes Kitten schon „erledigt" und die Kette bräche sofort ab.
   */
  it('trägt den zweiten Durchgang desselben Tages vollständig durch', () => {
    const ids = ['a', 'b', 'c'];

    // Morgens: alle drei erfasst.
    const morgens = new Set<string>();
    let current: string | null = null;
    for (let i = 0; i < 3; i++) {
      const next: string | null = nextFocusId(ids, current, morgens);
      expect(next).not.toBeNull();
      morgens.add(next as string);
      current = next;
    }
    expect(nextFocusId(ids, current, morgens)).toBeNull();

    // Abends: neuer Durchgang, leere Menge — die Kette läuft wieder komplett.
    const abends = new Set<string>();
    const gesehen: string[] = [];
    current = null;
    for (let i = 0; i < 3; i++) {
      const next: string | null = nextFocusId(ids, current, abends);
      expect(next).not.toBeNull();
      gesehen.push(next as string);
      abends.add(next as string);
      current = next;
    }
    expect(gesehen).toEqual(['a', 'b', 'c']);
  });

  it('kommt mit einem einzigen Kitten zurecht', () => {
    expect(nextFocusId(['a'], 'a', new Set(['a']))).toBeNull();
    expect(nextFocusId(['a'], 'a', new Set())).toBe('a');
  });

  it('ist bei leerer Liste null', () => {
    expect(nextFocusId([], 'a')).toBeNull();
  });

  it('beginnt ohne aktuelles Kitten vorne', () => {
    expect(nextFocusId(['a', 'b'], null)).toBe('a');
    expect(nextFocusId(['a', 'b'], null, new Set(['a']))).toBe('b');
  });

  it('führt bei neun Kitten einmal komplett durch', () => {
    const done = new Set<string>();
    const seen: string[] = [];
    let current: string | null = null;
    for (let i = 0; i < 9; i++) {
      const next: string | null = nextFocusId(nine, current, done);
      expect(next).not.toBeNull();
      seen.push(next as string);
      done.add(next as string);
      current = next;
    }
    expect(seen).toEqual(nine);
    expect(nextFocusId(nine, current, done)).toBeNull();
  });

  it('ignoriert ein unbekanntes aktuelles Kitten', () => {
    expect(nextFocusId(['a', 'b'], 'weg')).toBe('a');
  });
});

/* ------------------------------------------------------------------ */

describe('previousSample / deltaToPrevious', () => {
  const entries = [sample(2026, 3, 3, 8, 92), sample(2026, 3, 3, 20, 98), sample(2026, 3, 4, 8, 105)];

  it('findet die Messung davor', () => {
    expect(previousSample(entries, at(2026, 3, 4, 20))?.grams).toBe(105);
    expect(previousSample(entries, at(2026, 3, 3, 12))?.grams).toBe(92);
  });

  it('hat vor der ersten Messung keine Vorgängerin', () => {
    expect(previousSample(entries, at(2026, 3, 3, 1))).toBeUndefined();
    expect(deltaToPrevious([], at(2026, 3, 3, 8), 92)).toBeUndefined();
  });

  it('rechnet den Unterschied über den echten Zeitabstand', () => {
    const d = deltaToPrevious(entries, at(2026, 3, 4, 20), 116);
    expect(d?.grams).toBe(11);
    expect(d?.hours).toBeCloseTo(12, 6);
    expect(d?.perDay).toBeCloseTo(22, 6);
  });

  it('rechnet bei zwei Messungen kurz hintereinander nicht auf den Tag hoch', () => {
    const d = deltaToPrevious(entries, at(2026, 3, 4, 9), 107);
    expect(d?.grams).toBe(2);
    expect(d?.perDay).toBeUndefined();
  });

  it('zeigt auch eine Abnahme', () => {
    const d = deltaToPrevious(entries, at(2026, 3, 5, 8), 99);
    expect(d?.grams).toBe(-6);
  });

  it('liefert den Unterschied der jüngsten Messung', () => {
    expect(latestDelta(entries)?.grams).toBe(7);
    expect(latestDelta([sample(2026, 3, 3, 8, 92)])).toBeUndefined();
    expect(latestDelta([])).toBeUndefined();
  });

  it('gibt bei exakt gleichem Zeitstempel der zweiten Messung eine Vorgängerin', () => {
    // Zwei Messungen zum selben Zeitpunkt (z. B. Nachtrag mit derselben Uhrzeit):
    // die zweite darf nicht als „erste" erscheinen.
    const zeitpunkt = at(2026, 3, 4, 8);
    const d = deltaToPrevious([{ at: zeitpunkt, grams: 105 }], zeitpunkt, 108);
    expect(d?.grams).toBe(3);
    expect(d?.hours).toBe(0);
    expect(d?.perDay).toBeUndefined();

    // Auch die jüngste Messung findet ihre zeitgleiche Zwillingsmessung.
    const zwilling = latestDelta([
      sample(2026, 3, 3, 8, 92),
      { at: zeitpunkt, grams: 105 },
      { at: zeitpunkt, grams: 108 },
    ]);
    expect(zwilling?.grams).toBe(3);
  });
});

/* ------------------------------------------------------------------ */

describe('Tagesfortschritt', () => {
  it('zählt mehrere Messungen desselben Tages einzeln', () => {
    const list = [sample(2026, 3, 3, 8, 92), sample(2026, 3, 3, 20, 98), sample(2026, 3, 4, 8, 105)];
    expect(measurementsOn(list, '2026-03-03')).toBe(2);
    expect(measurementsOn(list, '2026-03-05')).toBe(0);
  });

  it('meldet, wie viele Kitten heute schon dran waren', () => {
    const map = new Map<string, WeightSample[]>([
      ['a', [sample(2026, 3, 3, 8, 92), sample(2026, 3, 3, 19, 96)]],
      ['b', [sample(2026, 3, 2, 8, 90)]],
      ['c', []],
    ]);
    const p = dayProgress(['a', 'b', 'c'], map, '2026-03-03');
    expect(p.done).toBe(1);
    expect(p.total).toBe(3);
    expect(p.doneIds).toEqual(['a']);
    expect(p.measurements).toBe(2);
  });

  it('ist bei leerem Wurf nicht kaputt', () => {
    const p = dayProgress([], new Map(), '2026-03-03');
    expect(p).toEqual({ done: 0, total: 0, doneIds: [], measurements: 0 });
  });
});

/* ------------------------------------------------------------------ */

describe('dayOfLife', () => {
  it('zählt den Geburtstag als Tag 0', () => {
    expect(dayOfLife('2026-03-03', '2026-03-03')).toBe(0);
    expect(dayOfLife('2026-03-03', '2026-03-15')).toBe(12);
  });

  it('bleibt über die Zeitumstellung und den Monatswechsel korrekt', () => {
    expect(dayOfLife('2026-03-27', '2026-03-30')).toBe(3);
    expect(dayOfLife('2026-01-31', '2026-02-01')).toBe(1);
    expect(dayOfLife('2028-02-27', '2028-03-01')).toBe(3); // Schaltjahr
  });

  it('ist ohne Geburtsdatum undefined', () => {
    expect(dayOfLife(undefined, '2026-03-03')).toBeUndefined();
  });
});

describe('dayOfLifeLabel', () => {
  it('beschriftet normale Lebenstage', () => {
    expect(dayOfLifeLabel('2026-03-03', '2026-03-15')).toBe('Tag 12');
  });

  it('sagt bei Geburtsdatum in der Zukunft „Noch nicht geboren" statt „Tag -5"', () => {
    expect(dayOfLifeLabel('2026-08-05', '2026-07-31')).toBe('Noch nicht geboren');
  });

  it('benennt das fehlende Geburtsdatum', () => {
    expect(dayOfLifeLabel(undefined, '2026-03-03')).toBe('Ohne Geburtsdatum');
  });
});

/* ------------------------------------------------------------------ */

describe('analyzeKitten', () => {
  it('meldet ohne Messung „Keine Daten"', () => {
    const a = analyzeKitten({ kittenId: 'a', entries: [], thresholds: T });
    expect(a.level).toBe('unknown');
    expect(a.currentG).toBeUndefined();
    expect(a.reasons.length).toBeGreaterThan(0);
  });

  it('braucht für eine Bewertung eine zweite Wiegung', () => {
    const a = analyzeKitten({
      kittenId: 'a',
      entries: [sample(2026, 3, 3, 8, 95)],
      birthDate: '2026-03-03',
      thresholds: T,
    });
    expect(a.level).toBe('unknown');
    expect(a.currentG).toBe(95);
    expect(a.ageDays).toBeCloseTo(0.333, 2);
  });

  it('bewertet gute Zunahme als in Ordnung', () => {
    const a = analyzeKitten({
      kittenId: 'a',
      entries: [sample(2026, 3, 3, 8, 95), sample(2026, 3, 4, 8, 106), sample(2026, 3, 5, 8, 118)],
      birthWeightG: 95,
      birthDate: '2026-03-03',
      thresholds: T,
    });
    expect(a.level).toBe('ok');
    expect(a.gainPerDay).toBeGreaterThan(T.goodGainG);
    expect(a.ageDays).toBeCloseTo(2.333, 2);
  });

  it('rechnet die Zunahme seit Geburt in Prozent', () => {
    const a = analyzeKitten({
      kittenId: 'a',
      entries: [sample(2026, 3, 3, 8, 90), sample(2026, 3, 13, 8, 180)],
      birthWeightG: 90,
      birthDate: '2026-03-03',
      thresholds: T,
    });
    expect(a.gainSinceBirthRatio).toBeCloseTo(1, 6);
  });

  it('erkennt ein Sorgenkind am Geburtsgewicht unter 80 g', () => {
    const a = analyzeKitten({
      kittenId: 'a',
      entries: [sample(2026, 3, 3, 8, 74), sample(2026, 3, 4, 8, 84)],
      birthWeightG: 74,
      birthDate: '2026-03-03',
      thresholds: T,
    });
    expect(a.level).toBe('concern');
    expect(a.reasons.join(' ')).toContain('80');
  });

  it('vergleicht mit dem Wurfdurchschnitt ohne das eigene Gewicht', () => {
    const litter = new Map<string, WeightSample[]>([
      ['a', [sample(2026, 3, 5, 8, 120)]],
      ['b', [sample(2026, 3, 5, 8, 200)]],
      ['c', [sample(2026, 3, 5, 8, 200)]],
    ]);
    const a = analyzeKitten({
      kittenId: 'a',
      entries: [sample(2026, 3, 3, 8, 95), sample(2026, 3, 5, 8, 120)],
      litterEntries: litter,
      birthDate: '2026-03-03',
      thresholds: T,
    });
    expect(a.litterAverageG).toBe(200);
    expect(a.level).toBe('concern');
  });

  it('vergleicht nicht, wenn es keine Geschwister mit Messung gibt', () => {
    const litter = new Map<string, WeightSample[]>([['a', [sample(2026, 3, 5, 8, 120)]]]);
    const a = analyzeKitten({
      kittenId: 'a',
      entries: [sample(2026, 3, 3, 8, 95), sample(2026, 3, 5, 8, 120)],
      litterEntries: litter,
      thresholds: T,
    });
    expect(a.litterAverageG).toBeUndefined();
  });

  it('meldet Gewichtsverlust als kritisch', () => {
    const a = analyzeKitten({
      kittenId: 'a',
      entries: [sample(2026, 3, 3, 8, 100), sample(2026, 3, 5, 8, 92)],
      birthWeightG: 100,
      birthDate: '2026-03-03',
      thresholds: T,
    });
    expect(a.level).toBe('critical');
  });

  it('kommt ohne Geburtsdatum aus', () => {
    const a = analyzeKitten({
      kittenId: 'a',
      entries: [sample(2026, 3, 3, 8, 95), sample(2026, 3, 4, 8, 106)],
      thresholds: T,
    });
    expect(a.ageDays).toBeUndefined();
    expect(a.level).toBe('ok');
  });

  it('lässt sich von mehreren Messungen am selben Tag nicht aus der Ruhe bringen', () => {
    const a = analyzeKitten({
      kittenId: 'a',
      entries: [
        sample(2026, 3, 3, 8, 95),
        sample(2026, 3, 3, 20, 99),
        sample(2026, 3, 4, 8, 106),
        sample(2026, 3, 4, 20, 110),
      ],
      birthWeightG: 95,
      birthDate: '2026-03-03',
      thresholds: T,
    });
    expect(a.gainPerDay).toBeGreaterThan(0);
    expect(a.lastChangeG).toBe(4);
  });
});
