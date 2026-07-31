import { describe, expect, it } from 'vitest';
import {
  erinnerungsstufe,
  ermaessigterPreisCents,
  fristende,
  hatAnzahlung,
  monateBisFrist,
  nachzahlungBis,
  restsummeCents,
  tageBisFrist,
  verwendungszweck,
  VERWENDUNGSZWECK_MAX,
} from './calc';

/* ------------------------------------------------------------------ */
/*  Preise                                                             */
/* ------------------------------------------------------------------ */

describe('Restsumme', () => {
  it('zieht die Anzahlung ab', () => {
    // 2.500 € minus 560 € Anzahlung
    expect(restsummeCents(250_000, 56_000)).toBe(194_000);
  });

  it('ohne Anzahlung bleibt der volle Kaufpreis', () => {
    expect(restsummeCents(250_000, null)).toBe(250_000);
    expect(restsummeCents(250_000, undefined)).toBe(250_000);
    expect(restsummeCents(250_000, 0)).toBe(250_000);
  });

  it('ohne Kaufpreis gibt es keine Restsumme', () => {
    expect(restsummeCents(null, 56_000)).toBeNull();
    expect(restsummeCents(undefined, undefined)).toBeNull();
    expect(restsummeCents(Number.NaN, 100)).toBeNull();
  });

  it('klemmt eine zu hohe Anzahlung auf null statt negativ zu werden', () => {
    expect(restsummeCents(100_000, 150_000)).toBe(0);
  });

  it('rechnet in ganzen Cent, ohne Rundungsfehler', () => {
    expect(restsummeCents(249_999, 33_333)).toBe(216_666);
    expect(Number.isInteger(restsummeCents(249_999, 33_333) as number)).toBe(true);
  });

  it('erkennt, ob überhaupt eine Anzahlung vorliegt', () => {
    expect(hatAnzahlung(56_000)).toBe(true);
    expect(hatAnzahlung(0)).toBe(false);
    expect(hatAnzahlung(null)).toBe(false);
    expect(hatAnzahlung(undefined)).toBe(false);
  });
});

describe('ermäßigter Kaufpreis', () => {
  it('zieht den Preisnachlass ab', () => {
    // 2.500 € regulär, 1.380 € Nachlass
    expect(ermaessigterPreisCents(250_000, 138_000)).toBe(112_000);
  });

  it('ohne Nachlass bleibt der reguläre Preis', () => {
    expect(ermaessigterPreisCents(250_000, null)).toBe(250_000);
  });

  it('ohne regulären Preis gibt es kein Ergebnis', () => {
    expect(ermaessigterPreisCents(null, 138_000)).toBeNull();
  });

  it('wird nicht negativ', () => {
    expect(ermaessigterPreisCents(100_000, 200_000)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Verwendungszweck                                                   */
/* ------------------------------------------------------------------ */

describe('Verwendungszweck', () => {
  it('baut „Kaufvertrag {Katze} / {Käufer}"', () => {
    expect(verwendungszweck([{ name: 'Mia' }], [{ name: 'Anna Muster' }])).toBe(
      'Kaufvertrag Mia / Anna Muster',
    );
  });

  it('zählt mehrere Tiere und Käufer auf', () => {
    expect(
      verwendungszweck(
        [{ name: 'Mia' }, { name: 'Nala' }],
        [{ name: 'Anna' }, { name: 'Ben' }, { name: 'Cem' }],
      ),
    ).toBe('Kaufvertrag Mia und Nala / Anna, Ben und Cem');
  });

  it('setzt Lücken, wo Namen fehlen', () => {
    expect(verwendungszweck([], [])).toBe('Kaufvertrag __________ / __________');
    expect(verwendungszweck([{ name: '  ' }], [{ name: 'Anna' }])).toBe(
      'Kaufvertrag __________ / Anna',
    );
  });

  it('räumt Mehrfach-Leerzeichen und Zeilenumbrüche auf', () => {
    expect(verwendungszweck([{ name: 'Mia\n  Sun' }], [{ name: 'Anna   Muster' }])).toBe(
      'Kaufvertrag Mia Sun / Anna Muster',
    );
  });

  it('kürzt sehr lange Angaben auf die Länge einer Überweisung', () => {
    const lang = 'Maximiliane Charlotte von und zu Hohenlohe-Schillingsfürst';
    const zweck = verwendungszweck(
      [{ name: lang }, { name: lang }],
      [{ name: lang }, { name: lang }],
    );
    expect(zweck.length).toBeLessThanOrEqual(VERWENDUNGSZWECK_MAX);
    expect(zweck.endsWith('…')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Fristen                                                            */
/* ------------------------------------------------------------------ */

describe('Fristende', () => {
  it('18 Monate ab Überlassung', () => {
    expect(fristende('2026-03-03', 18)).toBe('2027-09-03');
  });

  it('Monatsende: 31.08. + 18 Monate landet auf dem 28./29. Februar', () => {
    // 2026-08-31 + 18 Monate = Februar 2028 (Schaltjahr) -> 29.02.
    expect(fristende('2026-08-31', 18)).toBe('2028-02-29');
    // 2025-08-31 + 18 Monate = Februar 2027 (kein Schaltjahr) -> 28.02.
    expect(fristende('2025-08-31', 18)).toBe('2027-02-28');
  });

  it('Schalttag als Fristbeginn', () => {
    expect(fristende('2028-02-29', 12)).toBe('2029-02-28');
    expect(fristende('2028-02-29', 48)).toBe('2032-02-29');
  });

  it('31.01. + 1 Monat ist der 28./29.02., nicht der 03.03.', () => {
    expect(fristende('2026-01-31', 1)).toBe('2026-02-28');
    expect(fristende('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('läuft über den Sommerzeitwechsel hinweg tagesgenau', () => {
    // Ende März und Ende Oktober liegen die Umstellungen.
    expect(fristende('2026-03-28', 1)).toBe('2026-04-28');
    expect(fristende('2026-10-24', 1)).toBe('2026-11-24');
    expect(fristende('2026-02-28', 18)).toBe('2027-08-28');
  });

  it('verlängert nur, wenn die Verlängerung gezogen wurde', () => {
    expect(fristende('2026-03-03', 18, 6, false)).toBe('2027-09-03');
    expect(fristende('2026-03-03', 18, 6, true)).toBe('2028-03-03');
  });

  it('Verlängerung über das Monatsende hinweg', () => {
    // 31.08.2026 + 18 = 29.02.2028, + 6 = 29.08.2028
    expect(fristende('2026-08-31', 18, 6, true)).toBe('2028-08-29');
  });

  it('nimmt 0 Monate und negative Eingaben ohne Absturz', () => {
    expect(fristende('2026-03-03', 0)).toBe('2026-03-03');
    expect(fristende('2026-03-03', -5)).toBe('2026-03-03');
  });
});

describe('verbleibende Zeit', () => {
  it('zählt volle Kalendermonate, nicht 30-Tage-Blöcke', () => {
    expect(monateBisFrist('2027-09-03', '2026-03-03')).toBe(18);
    expect(monateBisFrist('2026-05-03', '2026-03-03')).toBe(2);
    expect(monateBisFrist('2026-03-15', '2026-03-03')).toBe(0);
  });

  it('gibt am Fristtag und danach 0 zurück', () => {
    expect(monateBisFrist('2026-03-03', '2026-03-03')).toBe(0);
    expect(monateBisFrist('2026-03-03', '2027-01-01')).toBe(0);
  });

  it('zählt Tage mit Vorzeichen', () => {
    expect(tageBisFrist('2026-03-10', '2026-03-03')).toBe(7);
    expect(tageBisFrist('2026-03-01', '2026-03-03')).toBe(-2);
  });

  it('Sommerzeitwechsel erzeugt keinen halben Tag', () => {
    // In Deutschland wird am 29.03.2026 auf Sommerzeit umgestellt.
    expect(tageBisFrist('2026-03-30', '2026-03-28')).toBe(2);
    // Rückstellung am 25.10.2026.
    expect(tageBisFrist('2026-10-26', '2026-10-24')).toBe(2);
  });
});

describe('Erinnerungsstufen', () => {
  const frist = '2027-09-03';

  it('meldet nichts, solange mehr als ein halbes Jahr bleibt', () => {
    expect(erinnerungsstufe(frist, '2026-03-03')).toBe('keine');
    expect(erinnerungsstufe(frist, '2027-03-02')).toBe('keine');
  });

  it('erinnert bei sechs Monaten', () => {
    expect(erinnerungsstufe(frist, '2027-03-04')).toBe('sechs_monate');
    expect(erinnerungsstufe(frist, '2027-06-02')).toBe('sechs_monate');
  });

  it('erinnert bei drei Monaten', () => {
    expect(erinnerungsstufe(frist, '2027-06-04')).toBe('drei_monate');
    expect(erinnerungsstufe(frist, '2027-08-02')).toBe('drei_monate');
  });

  it('erinnert im letzten Monat', () => {
    expect(erinnerungsstufe(frist, '2027-08-04')).toBe('ein_monat');
    expect(erinnerungsstufe(frist, '2027-09-03')).toBe('ein_monat');
  });

  it('meldet den Ablauf ab dem Tag danach', () => {
    expect(erinnerungsstufe(frist, '2027-09-04')).toBe('abgelaufen');
  });
});

describe('Nachzahlungsfrist', () => {
  it('14 Tage nach Fristablauf', () => {
    expect(nachzahlungBis('2027-09-03', 14)).toBe('2027-09-17');
  });

  it('rechnet über den Monatswechsel', () => {
    expect(nachzahlungBis('2026-01-25', 14)).toBe('2026-02-08');
  });

  it('rechnet über den Jahreswechsel und den Schalttag', () => {
    expect(nachzahlungBis('2027-12-25', 14)).toBe('2028-01-08');
    expect(nachzahlungBis('2028-02-20', 14)).toBe('2028-03-05');
  });
});
