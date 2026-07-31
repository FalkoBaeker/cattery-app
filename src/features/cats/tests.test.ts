import { describe, expect, it } from 'vitest';
import type { HealthTest } from '../../types';
import {
  DUE_SOON_DAYS,
  computeNextDueDate,
  healthTestGroupKey,
  healthTestStatus,
  healthTestTitle,
  summarizeHealthTests,
} from './tests';

function test(over: Partial<HealthTest> = {}): HealthTest {
  return {
    id: over.id ?? 't1',
    catId: 'c1',
    kind: 'hcm',
    date: '2026-01-01',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    ...over,
  };
}

describe('computeNextDueDate', () => {
  it('rechnet Monate ab dem Testdatum', () => {
    expect(computeNextDueDate('2026-03-03', 6)).toBe('2026-09-03');
    expect(computeNextDueDate('2026-03-03', 12)).toBe('2027-03-03');
  });

  it('beachtet das Monatsende: 31.08. + 6 Monate = 28.02.', () => {
    expect(computeNextDueDate('2026-08-31', 6)).toBe('2027-02-28');
  });

  it('trifft im Schaltjahr den 29. Februar', () => {
    expect(computeNextDueDate('2027-08-31', 6)).toBe('2028-02-29');
    expect(computeNextDueDate('2027-08-29', 6)).toBe('2028-02-29');
  });

  it('rechnet vom 29. Februar in ein Nicht-Schaltjahr', () => {
    expect(computeNextDueDate('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('beachtet das Monatsende auch bei einem Monat', () => {
    expect(computeNextDueDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(computeNextDueDate('2026-05-31', 1)).toBe('2026-06-30');
  });

  it('gibt ohne Gültigkeit nichts zurück — unbefristet', () => {
    expect(computeNextDueDate('2026-03-03', 0)).toBeUndefined();
    expect(computeNextDueDate('2026-03-03', undefined)).toBeUndefined();
    expect(computeNextDueDate('2026-03-03', null)).toBeUndefined();
    expect(computeNextDueDate('2026-03-03', -6)).toBeUndefined();
    expect(computeNextDueDate('2026-03-03', Number.NaN)).toBeUndefined();
  });

  it('gibt ohne brauchbares Datum nichts zurück', () => {
    expect(computeNextDueDate(undefined, 6)).toBeUndefined();
    expect(computeNextDueDate('', 6)).toBeUndefined();
    expect(computeNextDueDate('2026-02-31', 6)).toBeUndefined();
  });
});

describe('healthTestStatus', () => {
  it('erkennt unbefristete Ergebnisse', () => {
    const s = healthTestStatus(test({ kind: 'genetic', validMonths: 0 }), '2030-01-01');
    expect(s.state).toBe('unlimited');
    expect(s.nextDue).toBeUndefined();
    expect(s.tone).toBe('neutral');
  });

  it('erkennt gültige Ergebnisse', () => {
    const s = healthTestStatus(test({ date: '2026-01-01', validMonths: 6 }), '2026-02-01');
    expect(s.state).toBe('valid');
    expect(s.nextDue).toBe('2026-07-01');
    expect(s.tone).toBe('ok');
  });

  it('erkennt bald fällige Ergebnisse', () => {
    const s = healthTestStatus(test({ date: '2026-01-01', validMonths: 6 }), '2026-06-15');
    expect(s.state).toBe('due_soon');
    expect(s.daysUntilDue).toBe(16);
    expect(s.tone).toBe('warn');
  });

  it('behandelt den Fälligkeitstag selbst als bald fällig', () => {
    const s = healthTestStatus(test({ date: '2026-01-01', validMonths: 6 }), '2026-07-01');
    expect(s.state).toBe('due_soon');
    expect(s.daysUntilDue).toBe(0);
    expect(s.text).toBe('Läuft heute ab.');
  });

  it('trennt bald fällig und gültig genau an der Schwelle', () => {
    const t = test({ date: '2026-01-01', validMonths: 6 }); // fällig 01.07.2026
    // 30 Tage vorher: 01.06.2026
    expect(healthTestStatus(t, '2026-06-01').state).toBe('due_soon');
    expect(healthTestStatus(t, '2026-05-31').state).toBe('valid');
    expect(DUE_SOON_DAYS).toBe(30);
  });

  it('erkennt abgelaufene Ergebnisse', () => {
    const s = healthTestStatus(test({ date: '2026-01-01', validMonths: 6 }), '2026-07-11');
    expect(s.state).toBe('expired');
    expect(s.daysUntilDue).toBe(-10);
    expect(s.text).toBe('Seit 10 Tagen abgelaufen.');
    expect(s.tone).toBe('alert');
  });

  it('bildet die Einzahl richtig', () => {
    const s = healthTestStatus(test({ date: '2026-01-01', validMonths: 6 }), '2026-07-02');
    expect(s.text).toBe('Seit 1 Tag abgelaufen.');
  });

  it('meldet fehlende Datumsangaben statt zu raten', () => {
    const s = healthTestStatus(test({ date: '' }), '2026-07-01');
    expect(s.state).toBe('unknown');
  });

  it('greift auf ein gespeichertes nextDueDate zurück, wenn das Datum fehlt', () => {
    const s = healthTestStatus(
      test({ date: '', validMonths: 6, nextDueDate: '2026-07-01' }),
      '2026-06-25',
    );
    expect(s.state).toBe('due_soon');
    expect(s.nextDue).toBe('2026-07-01');
  });

  it('rechnet ein veraltetes nextDueDate neu', () => {
    const s = healthTestStatus(
      test({ date: '2026-01-01', validMonths: 6, nextDueDate: '2099-01-01' }),
      '2026-08-01',
    );
    expect(s.nextDue).toBe('2026-07-01');
    expect(s.state).toBe('expired');
  });
});

describe('healthTestTitle', () => {
  it('nimmt die Vorgabe je Art', () => {
    expect(healthTestTitle({ kind: 'hcm' })).toBe('HCM (Herzultraschall)');
    expect(healthTestTitle({ kind: 'pkd' })).toBe('PKD (Nierenultraschall)');
  });

  it('nimmt bei Gentest und freiem Test die eigene Bezeichnung', () => {
    expect(healthTestTitle({ kind: 'genetic', label: 'PK-Def' })).toBe('Gentest: PK-Def');
    expect(healthTestTitle({ kind: 'other', label: 'Blutbild' })).toBe('Blutbild');
    expect(healthTestTitle({ kind: 'other', label: '   ' })).toBe('Weiterer Test');
  });

  it('kommt mit sehr langen Bezeichnungen zurecht', () => {
    const long = 'Ein wirklich außergewöhnlich langer Name für einen Test'.repeat(3);
    expect(healthTestTitle({ kind: 'other', label: long })).toBe(long);
  });
});

describe('healthTestGroupKey', () => {
  it('fasst gleiche Arten zusammen', () => {
    expect(healthTestGroupKey({ kind: 'hcm' })).toBe(healthTestGroupKey({ kind: 'hcm' }));
  });

  it('trennt freie Tests nach Bezeichnung', () => {
    expect(healthTestGroupKey({ kind: 'other', label: 'Blutbild' })).not.toBe(
      healthTestGroupKey({ kind: 'other', label: 'Schilddrüse' }),
    );
  });
});

describe('summarizeHealthTests', () => {
  it('kommt mit leerer Liste zurecht', () => {
    const s = summarizeHealthTests([], '2026-03-03');
    expect(s.groups).toEqual([]);
    expect(s.attentionCount).toBe(0);
    expect(s.expiredCount).toBe(0);
  });

  it('kommt mit fehlender Liste zurecht', () => {
    expect(summarizeHealthTests(undefined, '2026-03-03').groups).toEqual([]);
  });

  it('nimmt je Art das jüngste Ergebnis und hebt ältere in die Historie', () => {
    const s = summarizeHealthTests(
      [
        test({ id: 'alt', kind: 'hcm', date: '2025-01-01', validMonths: 6 }),
        test({ id: 'neu', kind: 'hcm', date: '2026-01-01', validMonths: 6 }),
      ],
      '2026-02-01',
    );
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].latest.id).toBe('neu');
    expect(s.groups[0].history.map((h) => h.id)).toEqual(['alt']);
    expect(s.groups[0].status.state).toBe('valid');
  });

  it('sortiert Dringendes nach oben und meldet den schlimmsten Zustand', () => {
    const s = summarizeHealthTests(
      [
        test({ id: 'gut', kind: 'felv_fiv', date: '2026-01-01', validMonths: 12 }),
        test({ id: 'weg', kind: 'hcm', date: '2025-01-01', validMonths: 6 }),
        test({ id: 'bald', kind: 'pkd', date: '2025-09-15', validMonths: 6 }),
      ],
      '2026-03-01',
    );
    expect(s.groups.map((g) => g.latest.id)).toEqual(['weg', 'bald', 'gut']);
    expect(s.worst).toBe('expired');
    expect(s.expiredCount).toBe(1);
    expect(s.dueSoonCount).toBe(1);
    expect(s.attentionCount).toBe(2);
  });

  it('trennt mehrere freie Tests', () => {
    const s = summarizeHealthTests(
      [
        test({ id: 'a', kind: 'other', label: 'Blutbild', date: '2026-01-01' }),
        test({ id: 'b', kind: 'other', label: 'Schilddrüse', date: '2026-01-02' }),
      ],
      '2026-03-01',
    );
    expect(s.groups).toHaveLength(2);
  });

  it('sortiert bei gleichem Datum über den Anlegezeitpunkt', () => {
    const s = summarizeHealthTests(
      [
        test({ id: 'frueh', date: '2026-01-01', createdAt: '2026-01-01T08:00:00Z' }),
        test({ id: 'spaet', date: '2026-01-01', createdAt: '2026-01-01T18:00:00Z' }),
      ],
      '2026-03-01',
    );
    expect(s.groups[0].latest.id).toBe('spaet');
  });
});
