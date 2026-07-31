import { describe, it, expect } from 'vitest';
import { truncateToWidth, wrapText } from './textLayout';

/** Messfunktion mit fester Zeichenbreite — macht die Erwartungen nachrechenbar. */
const measure = (s: string) => s.length * 10;

describe('wrapText', () => {
  it('gibt bei leerem Text nichts zurück', () => {
    expect(wrapText('', 200, measure)).toEqual([]);
    expect(wrapText('   \n  ', 200, measure)).toEqual([]);
  });

  it('lässt kurzen Text in einer Zeile', () => {
    expect(wrapText('Hallo Welt', 200, measure)).toEqual(['Hallo Welt']);
  });

  it('bricht an Wortgrenzen um', () => {
    // 100 px = 10 Zeichen
    expect(wrapText('eins zwei drei vier', 100, measure)).toEqual(['eins zwei', 'drei vier']);
  });

  it('behält Absätze', () => {
    expect(wrapText('oben\n\nunten', 200, measure)).toEqual(['oben', '', 'unten']);
  });

  it('trennt sehr lange Namen hart, statt über den Rand zu laufen', () => {
    const name = 'Zuchtkatze-von-der-Grossen-Blauen-Wiese';
    const lines = wrapText(name, 100, measure);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100);
    expect(lines.join('')).toBe(name);
  });

  it('mischt lange und kurze Wörter richtig', () => {
    const lines = wrapText('ab Donaudampfschifffahrtsgesellschaft cd', 100, measure);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100);
    expect(lines[0]).toBe('ab');
    expect(lines[lines.length - 1].endsWith('cd')).toBe(true);
  });

  it('kürzt auf maxLines mit Auslassungszeichen', () => {
    const lines = wrapText('eins zwei drei vier fuenf sechs', 100, measure, { maxLines: 2 });
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100);
  });

  it('kürzt nicht, wenn der Text ohnehin passt', () => {
    expect(wrapText('eins zwei', 100, measure, { maxLines: 4 })).toEqual(['eins zwei']);
  });

  it('verträgt eine unsinnige Breite', () => {
    expect(wrapText('Text', 0, measure)).toEqual([]);
    expect(wrapText('Text', Number.NaN, measure)).toEqual([]);
  });

  it('wirft nachlaufende Leerzeilen weg', () => {
    expect(wrapText('Text\n\n\n', 200, measure)).toEqual(['Text']);
  });

  it('normalisiert Windows-Zeilenenden', () => {
    expect(wrapText('a\r\nb', 200, measure)).toEqual(['a', 'b']);
  });
});

describe('truncateToWidth', () => {
  it('lässt passenden Text unverändert', () => {
    expect(truncateToWidth('kurz', 100, measure)).toBe('kurz');
  });

  it('kürzt mit Auslassungszeichen', () => {
    const out = truncateToWidth('Familie Mustermann-Schmidt', 100, measure);
    expect(out.endsWith('…')).toBe(true);
    expect(measure(out)).toBeLessThanOrEqual(100);
  });

  it('verträgt eine Breite, in die nichts passt', () => {
    expect(truncateToWidth('irgendwas', 5, measure)).toBe('');
    expect(truncateToWidth('irgendwas', 0, measure)).toBe('');
  });

  it('verträgt leeren Text', () => {
    expect(truncateToWidth('', 100, measure)).toBe('');
  });
});
