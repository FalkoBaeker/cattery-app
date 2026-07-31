import { describe, expect, it } from 'vitest';
import type {
  Appointment,
  CareTask,
  Cat,
  CatWeightEntry,
  HealthTest,
  HeatCycle,
  Litter,
} from '../../types';
import { fromLocalInputValue } from '../../lib/date';
import { buildCatTimeline } from './timeline';

const CAT: Pick<Cat, 'id' | 'birthDate' | 'breederName'> = {
  id: 'cat1',
  birthDate: '2020-05-04',
  breederName: 'von den Blauen Katzen',
};

const stamps = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

function heat(over: Partial<HeatCycle> = {}): HeatCycle {
  return { id: 'h1', catId: 'cat1', startDate: '2026-03-01', ...stamps, ...over };
}

function healthTest(over: Partial<HealthTest> = {}): HealthTest {
  return { id: 't1', catId: 'cat1', kind: 'hcm', date: '2026-02-01', ...stamps, ...over };
}

function litter(over: Partial<Litter> = {}): Litter {
  return { id: 'l1', motherId: 'cat1', status: 'born', ...stamps, ...over };
}

function appointment(over: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a1',
    kind: 'vet',
    startAt: fromLocalInputValue('2026-04-10T14:05'),
    remind24h: true,
    remind1h: false,
    ...stamps,
    ...over,
  };
}

function weight(over: Partial<CatWeightEntry> = {}): CatWeightEntry {
  return {
    id: 'w1',
    catId: 'cat1',
    at: fromLocalInputValue('2026-04-01T09:30'),
    grams: 4200,
    ...over,
  };
}

describe('buildCatTimeline', () => {
  it('liefert für eine leere Katze nichts', () => {
    expect(buildCatTimeline({ cat: { id: 'cat1' }, ref: '2026-07-30' })).toEqual([]);
  });

  it('nimmt die Geburt der Katze auf', () => {
    const events = buildCatTimeline({ cat: CAT, ref: '2026-07-30' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'birth',
      date: '2020-05-04',
      title: 'Geboren',
    });
    expect(events[0].detail).toContain('von den Blauen Katzen');
  });

  it('lässt die Geburt weg, wenn kein Wurfdatum bekannt ist', () => {
    const events = buildCatTimeline({ cat: { id: 'cat1' }, heats: [heat()], ref: '2026-07-30' });
    expect(events.map((e) => e.kind)).toEqual(['heat']);
  });

  it('beschreibt eine abgeschlossene und eine offene Rolligkeit', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      heats: [
        heat({ id: 'h1', startDate: '2026-03-01', endDate: '2026-03-05' }),
        heat({ id: 'h2', startDate: '2026-04-01', notes: 'sehr laut' }),
      ],
      ref: '2026-07-30',
    });
    expect(events[0].detail).toContain('sehr laut');
    expect(events[0].detail).toContain('Ende nicht erfasst');
    expect(events[1].detail).toContain('5 Tage');
  });

  it('fasst doppelt erfasste Rolligkeiten auch im Zeitstrahl zusammen', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      heats: [
        heat({ id: 'h1', startDate: '2026-03-01' }),
        heat({ id: 'h2', startDate: '2026-03-02' }),
      ],
      ref: '2026-07-30',
    });
    expect(events).toHaveLength(1);
  });

  it('zeigt zu einem Test Ergebnis und nächste Fälligkeit', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      tests: [healthTest({ result: 'ohne Befund', validMonths: 6 })],
      ref: '2026-03-01',
    });
    expect(events[0].title).toBe('HCM (Herzultraschall)');
    expect(events[0].detail).toBe('ohne Befund · nächste Fälligkeit 01.08.2026');
    expect(events[0].tone).toBe('ok');
  });

  it('markiert einen abgelaufenen Test auch im Zeitstrahl', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      tests: [healthTest({ validMonths: 6 })],
      ref: '2026-12-01',
    });
    expect(events[0].tone).toBe('alert');
  });

  it('nennt einen unbefristeten Test unbefristet', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      tests: [healthTest({ kind: 'genetic', label: 'PK-Def', result: 'frei' })],
      ref: '2026-03-01',
    });
    expect(events[0].title).toBe('Gentest: PK-Def');
    expect(events[0].detail).toBe('frei · unbefristet');
  });

  it('nimmt Deckung und Geburt eines Wurfes auf und verlinkt ihn', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      litters: [litter({ matingDate: '2026-01-01', birthDate: '2026-03-07' })],
      kittenCountByLitter: new Map([['l1', 5]]),
      ref: '2026-07-30',
    });
    expect(events.map((e) => e.title)).toEqual(['Wurf geboren', 'Gedeckt']);
    expect(events[0].detail).toBe('5 Kitten · als Mutter');
    expect(events[0].href).toBe('/zucht/wurf/l1');
  });

  it('erkennt die Katze als Vater eines Wurfes', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      litters: [litter({ motherId: 'andere', fatherId: 'cat1', birthDate: '2026-03-07' })],
      ref: '2026-07-30',
    });
    expect(events[0].detail).toContain('als Vater');
  });

  it('zeigt den erwarteten Geburtstermin, solange nichts geboren ist', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      litters: [litter({ status: 'pregnant', dueDate: '2026-08-20' })],
      ref: '2026-07-30',
    });
    expect(events[0].title).toBe('Geburtstermin erwartet');
    expect(events[0].detail).toContain('Trächtig');
  });

  it('nimmt Termine mit Uhrzeit auf', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      appointments: [appointment({ note: 'Ultraschall' })],
      ref: '2026-07-30',
    });
    expect(events[0]).toMatchObject({
      date: '2026-04-10',
      time: '14:05',
      title: 'Tierarzt',
      href: '/kalender/a1',
    });
    expect(events[0].detail).toBe('Ultraschall');
  });

  it('markiert abgesagte Termine', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      appointments: [appointment({ cancelledAt: '2026-04-01T10:00:00Z' })],
      ref: '2026-07-30',
    });
    expect(events[0].tone).toBe('alert');
    expect(events[0].detail).toBe('abgesagt');
  });

  it('nimmt Wiegungen auf', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      weights: [weight()],
      ref: '2026-07-30',
    });
    expect(events[0].title).toBe('Gewogen: 4.200 g');
    expect(events[0].time).toBe('09:30');
  });

  it('nimmt Aufgaben auf und zeigt erledigte am Erledigungstag', () => {
    const task: CareTask = {
      id: 'task1',
      kind: 'health_test',
      title: 'HCM-Kontrolle',
      dueDate: '2026-05-01',
      doneAt: '2026-05-04',
      catId: 'cat1',
      autoGenerated: false,
      ...stamps,
    };
    const events = buildCatTimeline({ cat: { id: 'cat1' }, careTasks: [task], ref: '2026-07-30' });
    expect(events[0].date).toBe('2026-05-04');
    expect(events[0].detail).toBe('erledigt');
  });

  it('sortiert alles chronologisch, neueste zuerst', () => {
    const events = buildCatTimeline({
      cat: CAT,
      heats: [heat({ startDate: '2026-03-01', endDate: '2026-03-05' })],
      tests: [healthTest({ date: '2026-02-01', validMonths: 6 })],
      litters: [litter({ matingDate: '2026-01-10', birthDate: '2026-03-16' })],
      appointments: [appointment()],
      weights: [weight()],
      ref: '2026-07-30',
    });
    const dates = events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe('2026-04-10');
    expect(dates[dates.length - 1]).toBe('2020-05-04');
  });

  it('überspringt kaputte Zeitangaben, statt abzustürzen', () => {
    const events = buildCatTimeline({
      cat: { id: 'cat1' },
      appointments: [appointment({ startAt: 'kein Datum' })],
      weights: [weight({ at: '' })],
      ref: '2026-07-30',
    });
    expect(events).toEqual([]);
  });
});
