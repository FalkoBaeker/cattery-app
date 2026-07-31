import { describe, expect, it } from 'vitest';
import { formatInbreeding, inbreedingError } from './format';

describe('formatInbreeding', () => {
  it('zeigt bis zu zwei Nachkommastellen ohne Nachnullen', () => {
    // PawPeds liefert zwei Stellen — 6,25 darf nicht zu „6,3 %" gerundet werden.
    expect(formatInbreeding(6.25)).toBe('6,25 %');
    expect(formatInbreeding(12.5)).toBe('12,5 %');
    expect(formatInbreeding(6)).toBe('6 %');
    expect(formatInbreeding(0)).toBe('0 %');
  });

  it('schweigt bei leeren oder unbrauchbaren Werten', () => {
    expect(formatInbreeding(null)).toBeUndefined();
    expect(formatInbreeding(undefined)).toBeUndefined();
    expect(formatInbreeding(Number.NaN)).toBeUndefined();
  });
});

describe('inbreedingError', () => {
  it('lässt leere und gültige Werte durch', () => {
    expect(inbreedingError(null)).toBeUndefined();
    expect(inbreedingError(undefined)).toBeUndefined();
    expect(inbreedingError(0)).toBeUndefined();
    expect(inbreedingError(6.25)).toBeUndefined();
    expect(inbreedingError(100)).toBeUndefined();
  });

  it('meldet Werte außerhalb von 0 bis 100 statt sie zu verwerfen', () => {
    const meldung = 'Bitte einen Wert zwischen 0 und 100 eintragen.';
    expect(inbreedingError(-1)).toBe(meldung);
    expect(inbreedingError(150)).toBe(meldung);
    expect(inbreedingError(Number.NaN)).toBe(meldung);
  });
});
