import { describe, expect, it } from 'vitest';
import { checkLitterPause, dueState, isActionable, planCareTasks } from './schedule';
import { DEFAULT_SETTINGS, type Kitten } from '../types';
import { addDays, addMonths, daysBetween } from '../lib/date';

const plan = DEFAULT_SETTINGS.schedule;

function kitten(over: Partial<Kitten> = {}): Kitten {
  return {
    id: over.id ?? 'k1',
    litterId: 'l1',
    collarColor: 'red',
    sex: 'female',
    stillborn: false,
    saleStatus: 'available',
    createdAt: '2026-03-03T00:00:00Z',
    updatedAt: '2026-03-03T00:00:00Z',
    ...over,
  };
}

describe('planCareTasks', () => {
  it('erzeugt ohne Geburtsdatum nichts', () => {
    expect(planCareTasks({ birthDate: undefined }, [kitten()], plan)).toEqual([]);
  });

  it('legt den vollständigen Fahrplan aus dem Geburtsdatum an', () => {
    const tasks = planCareTasks({ birthDate: '2026-03-03' }, [kitten()], plan);
    const byKey = Object.fromEntries(tasks.map((t) => [t.planKey, t.dueDate]));

    // 03.03.2026 + 4 Wochen = 31.03.2026
    expect(byKey['deworming:1']).toBe('2026-03-31');
    expect(byKey['deworming:2']).toBe('2026-04-14');
    expect(byKey['deworming:3']).toBe('2026-04-28');
    expect(byKey['vaccination:1']).toBe('2026-04-28');
    expect(byKey['chip']).toBe('2026-04-28');
    expect(byKey['neuter:k1']).toBe('2026-05-12');
    expect(byKey['litter_registration']).toBe('2026-05-12');
    expect(byKey['vaccination:2']).toBe('2026-05-26');
    expect(byKey['handover_allowed']).toBe('2026-05-26');
  });

  it('plant keine Kastration bei Zuchtnutzungsvorbehalt', () => {
    const tasks = planCareTasks(
      { birthDate: '2026-03-03' },
      [
        kitten({ id: 'a', saleStatus: 'sold' }),
        kitten({ id: 'b', saleStatus: 'sold_breeding_reserved' }),
      ],
      plan,
    );
    const neuterKeys = tasks.filter((t) => t.kind === 'neuter').map((t) => t.planKey);
    expect(neuterKeys).toEqual(['neuter:a']);
  });

  it('überspringt tote und totgeborene Kitten vollständig', () => {
    const tasks = planCareTasks(
      { birthDate: '2026-03-03' },
      [
        kitten({ id: 'a' }),
        kitten({ id: 'b', stillborn: true }),
        kitten({ id: 'c', saleStatus: 'deceased' }),
      ],
      plan,
    );
    expect(tasks.filter((t) => t.kind === 'neuter').map((t) => t.kittenId)).toEqual(['a']);
  });

  it('kommt mit einem Wurf ohne Kitten zurecht', () => {
    const tasks = planCareTasks({ birthDate: '2026-03-03' }, [], plan);
    expect(tasks.some((t) => t.kind === 'neuter')).toBe(false);
    // Wurfweite Aufgaben entstehen trotzdem.
    expect(tasks.some((t) => t.planKey === 'litter_registration')).toBe(true);
  });

  it('liefert die Aufgaben nach Fälligkeit sortiert', () => {
    const tasks = planCareTasks({ birthDate: '2026-03-03' }, [kitten()], plan);
    const dates = tasks.map((t) => t.dueDate);
    expect([...dates].sort()).toEqual(dates);
  });

  it('rechnet über den Sommerzeitwechsel hinweg korrekt', () => {
    // Wurf am 22.03.2026, Zeitumstellung in Deutschland am 29.03.2026.
    const tasks = planCareTasks({ birthDate: '2026-03-22' }, [kitten()], plan);
    const dew1 = tasks.find((t) => t.planKey === 'deworming:1');
    expect(dew1?.dueDate).toBe('2026-04-19'); // exakt 28 Tage später
  });

  it('rechnet über den Jahreswechsel hinweg korrekt', () => {
    const tasks = planCareTasks({ birthDate: '2026-12-20' }, [kitten()], plan);
    expect(tasks.find((t) => t.planKey === 'handover_allowed')?.dueDate).toBe('2027-03-14');
  });
});

describe('dueState', () => {
  const today = '2026-05-01';

  it('erkennt überfällig, heute, bald und später', () => {
    expect(dueState({ dueDate: '2026-04-28' }, plan, today)).toBe('overdue');
    expect(dueState({ dueDate: today }, plan, today)).toBe('today');
    expect(dueState({ dueDate: '2026-05-04' }, plan, today)).toBe('soon');
    expect(dueState({ dueDate: '2026-05-20' }, plan, today)).toBe('upcoming');
  });

  it('erledigte Aufgaben sind nie fällig', () => {
    expect(dueState({ dueDate: '2026-01-01', doneAt: '2026-01-01' }, plan, today)).toBe('done');
    expect(isActionable({ dueDate: '2026-01-01', doneAt: '2026-01-01' }, plan, today)).toBe(false);
  });

  it('die Vorlaufzeit stammt aus den Einstellungen', () => {
    const strict = { ...plan, reminderLeadDays: 1 };
    expect(dueState({ dueDate: '2026-05-04' }, strict, today)).toBe('upcoming');
    expect(dueState({ dueDate: '2026-05-02' }, strict, today)).toBe('soon');
  });
});

describe('checkLitterPause', () => {
  const limit = 3;
  const months = 24;

  it('erlaubt den ersten Wurf', () => {
    const r = checkLitterPause([], '2026-06-01', limit, months);
    expect(r.allowed).toBe(true);
    expect(r.countInWindow).toBe(1);
  });

  it('erlaubt den dritten Wurf und meldet das erreichte Limit', () => {
    const r = checkLitterPause(['2025-01-10', '2025-09-10'], '2026-06-01', limit, months);
    expect(r.allowed).toBe(true);
    expect(r.countInWindow).toBe(3);
    expect(r.message).toContain('Limit erreicht');
  });

  it('verbietet den vierten Wurf im Zeitfenster', () => {
    const r = checkLitterPause(
      ['2025-01-10', '2025-09-10', '2026-02-01'],
      '2026-06-01',
      limit,
      months,
    );
    expect(r.allowed).toBe(false);
    expect(r.countInWindow).toBe(4);
    expect(r.freeFrom).toBeDefined();
  });

  it('zählt Würfe außerhalb des Fensters nicht mit', () => {
    // 2022 liegt weit außerhalb von 24 Monaten.
    const r = checkLitterPause(['2022-01-01', '2025-09-10'], '2026-06-01', limit, months);
    expect(r.countInWindow).toBe(2);
    expect(r.allowed).toBe(true);
  });

  it('ignoriert Würfe, die nach dem geplanten Datum liegen', () => {
    const r = checkLitterPause(['2027-01-01'], '2026-06-01', limit, months);
    expect(r.countInWindow).toBe(1);
  });

  it('nennt ein Freigabedatum, das nach dem ältesten zählenden Wurf liegt', () => {
    const r = checkLitterPause(
      ['2025-01-10', '2025-09-10', '2026-02-01'],
      '2026-06-01',
      limit,
      months,
    );
    expect(r.freeFrom).toBeDefined();
    // Nach diesem Datum wäre wieder Platz.
    const check = checkLitterPause(
      ['2025-01-10', '2025-09-10', '2026-02-01'],
      r.freeFrom!,
      limit,
      months,
    );
    expect(check.allowed).toBe(true);
  });
});

describe('Datumshelfer, auf die sich der Fahrplan verlässt', () => {
  it('addiert Monate über das Monatsende hinweg korrekt', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // Schaltjahr
    expect(addMonths('2026-08-31', 18)).toBe('2028-02-29');
  });

  it('zählt Tage über den Sommerzeitwechsel korrekt', () => {
    // 29.03.2026: Umstellung auf Sommerzeit — der Tag hat nur 23 Stunden.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    // 25.10.2026: Rückstellung — 25 Stunden.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });
});
