import { describe, expect, it } from 'vitest';
import {
  clampNumber,
  clampWeek,
  describeWeekList,
  formatWeekList,
  MAX_WEEK,
  parseWeekList,
} from './weekList';

describe('parseWeekList', () => {
  it('liest die übliche Schreibweise', () => {
    expect(parseWeekList('4, 6, 8')).toEqual([4, 6, 8]);
  });

  it('verträgt Leerzeichen, Semikolon und Schrägstrich', () => {
    expect(parseWeekList('4 6 8')).toEqual([4, 6, 8]);
    expect(parseWeekList('4;6;8')).toEqual([4, 6, 8]);
    expect(parseWeekList('4/6/8')).toEqual([4, 6, 8]);
    expect(parseWeekList('  4 ,  6 ,8  ')).toEqual([4, 6, 8]);
  });

  it('sortiert und entfernt Doppelungen', () => {
    expect(parseWeekList('8, 4, 6, 4')).toEqual([4, 6, 8]);
  });

  it('liefert für eine leere Eingabe eine leere Liste', () => {
    expect(parseWeekList('')).toEqual([]);
    expect(parseWeekList('   ')).toEqual([]);
    expect(parseWeekList(',,,')).toEqual([]);
  });

  it('übergeht Buchstaben still', () => {
    expect(parseWeekList('Woche 4 und Woche 8')).toEqual([4, 8]);
    expect(parseWeekList('abc')).toEqual([]);
  });

  it('weist unsinnig große Werte ab', () => {
    expect(parseWeekList(`4, ${MAX_WEEK + 1}, 8`)).toEqual([4, 8]);
  });

  it('nimmt die Null an — Woche 0 ist der Geburtstag', () => {
    expect(parseWeekList('0, 4')).toEqual([0, 4]);
  });

  it('kann mit einer einzigen Zahl umgehen', () => {
    expect(parseWeekList('12')).toEqual([12]);
  });
});

describe('formatWeekList', () => {
  it('schreibt die Liste zurück', () => {
    expect(formatWeekList([4, 6, 8])).toBe('4, 6, 8');
  });

  it('bleibt bei leerer Liste leer', () => {
    expect(formatWeekList([])).toBe('');
  });

  it('läuft mit parseWeekList hin und zurück', () => {
    expect(parseWeekList(formatWeekList([4, 6, 8]))).toEqual([4, 6, 8]);
  });
});

describe('describeWeekList', () => {
  it('schreibt deutsch aus', () => {
    expect(describeWeekList([4, 6, 8])).toBe('Woche 4, 6 und 8');
    expect(describeWeekList([8, 12])).toBe('Woche 8 und 12');
    expect(describeWeekList([8])).toBe('Woche 8');
    expect(describeWeekList([])).toBe('keine');
  });
});

describe('clampWeek', () => {
  it('lässt gültige Werte durch', () => {
    expect(clampWeek(10, 8)).toBe(10);
  });

  it('nimmt bei leerer Eingabe den Vorgabewert', () => {
    expect(clampWeek(null, 8)).toBe(8);
    expect(clampWeek(Number.NaN, 8)).toBe(8);
  });

  it('begrenzt nach oben und unten', () => {
    expect(clampWeek(-5, 8)).toBe(0);
    expect(clampWeek(999, 8)).toBe(MAX_WEEK);
  });

  it('rundet Kommazahlen', () => {
    expect(clampWeek(8.6, 8)).toBe(9);
  });
});

describe('clampNumber', () => {
  it('begrenzt auf den erlaubten Bereich', () => {
    expect(clampNumber(70, 65, 50, 80)).toBe(70);
    expect(clampNumber(10, 65, 50, 80)).toBe(50);
    expect(clampNumber(200, 65, 50, 80)).toBe(80);
  });

  it('nimmt bei leerer Eingabe den Vorgabewert', () => {
    expect(clampNumber(null, 65, 50, 80)).toBe(65);
  });
});
