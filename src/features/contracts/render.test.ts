import { describe, expect, it } from 'vitest';
import {
  bedingungen,
  gemeinsamesGeburtsdatum,
  rendereVertrag,
  unaufgeloestePlatzhalter,
  vertragAlsText,
  werte,
} from './render';
import { formatMoney } from '../../lib/format';
import type { ContractAnimal, ContractData, ContractParty, SellerSettings } from '../../types';

/** formatMoney setzt ein geschütztes Leerzeichen vor das €-Zeichen. */
const geld = (cents: number) => formatMoney(cents);

/* ------------------------------------------------------------------ */
/*  Beispieldaten                                                      */
/* ------------------------------------------------------------------ */

const VERKAEUFERIN: SellerSettings = {
  name: 'Beispiel Züchterin',
  address: 'Beispielweg 3, 12345 Beispielstadt',
  birthDate: '1985-06-14',
  iban: 'DE00 0000 0000 0000 0000 00',
  place: 'Beispielstadt',
  catteryName: 'von Beispielhausen',
  clubName: 'Catmaniac',
};

function katze(name = 'Mia', chipNo = '276093400000001'): ContractAnimal {
  return { name, sex: 'female', chipNo, birthDate: '2026-03-03' };
}

function kater(name = 'Ben', chipNo = '276093400000002'): ContractAnimal {
  return { name, sex: 'male', chipNo, birthDate: '2026-03-03' };
}

function partei(name: string, sex: ContractParty['sex'] = 'female'): ContractParty {
  return { name, sex, address: 'Musterweg 1, 12345 Musterstadt', birthDate: '1990-04-05' };
}

function standard(over: Partial<ContractData> = {}): ContractData {
  return {
    type: 'standard',
    buyers: [partei('Anna Muster')],
    animals: [katze()],
    breed: 'Russisch Blau',
    totalPriceCents: 250_000,
    handoverText: 'Anfang Juni 2026',
    handoverPlace: 'Beispielstadt',
    ...over,
  };
}

function zucht(over: Partial<ContractData> = {}): ContractData {
  return {
    type: 'breeding_reserved',
    buyers: [partei('Anna Muster')],
    animals: [katze()],
    breed: 'Russisch Blau',
    regularPriceCents: 250_000,
    discountCents: 138_000,
    breedingUseStartDate: '2026-06-01',
    breedingUseMonths: 18,
    breedingUseExtensionMonths: 6,
    handoverDeadlineDays: 3,
    matingAttempts: 2,
    backPaymentDays: 14,
    ...over,
  };
}

const R = (data: ContractData, seller: SellerSettings = VERKAEUFERIN) =>
  rendereVertrag({ data, seller });

const text = (data: ContractData, seller: SellerSettings = VERKAEUFERIN) =>
  vertragAlsText(R(data, seller));

/* ------------------------------------------------------------------ */
/*  Aufbau                                                             */
/* ------------------------------------------------------------------ */

describe('Aufbau der Verträge', () => {
  it('Vertrag A hat 8 Paragrafen', () => {
    const v = R(standard());
    expect(v.paragrafen).toHaveLength(8);
    expect(v.titel).toBe('Kaufvertrag');
    expect(v.paragrafen[7].ueberschrift).toBe('§ 8 Unterlagen');
  });

  it('Vertrag B hat 17 Paragrafen', () => {
    const v = R(zucht());
    expect(v.paragrafen).toHaveLength(17);
    expect(v.titel).toBe('Kaufvertrag mit vorbehaltener einmaliger Zuchtnutzung');
    expect(v.paragrafen[16].ueberschrift).toBe('§ 17 Salvatorische Klausel');
  });

  it('nummeriert lückenlos durch', () => {
    for (const daten of [standard(), zucht()]) {
      const v = R(daten);
      v.paragrafen.forEach((p, i) => {
        expect(p.nummer).toBe(i + 1);
        expect(p.ueberschrift.startsWith(`§ ${i + 1} `)).toBe(true);
      });
    }
  });

  it('lässt in keinem Fall Platzhalter stehen', () => {
    const faelle: ContractData[] = [
      standard(),
      standard({ depositCents: 56_000 }),
      standard({ animals: [katze('A'), kater('B')], buyers: [partei('A'), partei('B', 'male')] }),
      standard({ animals: [], buyers: [] }),
      zucht(),
      zucht({ buyers: [partei('A'), partei('B'), partei('C')] }),
      zucht({ animals: [katze('Mia'), katze('Nala')] }),
      zucht({ additionalAgreement: 'Der Kater darf im Sommer besucht werden.' }),
    ];
    for (const f of faelle) {
      expect(unaufgeloestePlatzhalter({ data: f, seller: VERKAEUFERIN })).toEqual([]);
      expect(text(f)).not.toMatch(/[{}]/);
    }
  });

  it('erzeugt zu jedem Paragrafen mindestens einen gefüllten Absatz', () => {
    for (const daten of [standard(), zucht()]) {
      for (const p of R(daten).paragrafen) {
        expect(p.absaetze.length).toBeGreaterThan(0);
        for (const a of p.absaetze) expect(a.text.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Bedingte Absätze                                                   */
/* ------------------------------------------------------------------ */

describe('bedingte Absätze', () => {
  it('bei einem Käufer entfallen beide Gesamtschuldner-Klauseln in Vertrag B', () => {
    const t = text(zucht({ buyers: [partei('Anna Muster')] }));
    expect(t).not.toMatch(/Gesamtschuldner/);
  });

  it('bei mehreren Käufern stehen beide Gesamtschuldner-Klauseln im Vertrag B', () => {
    const v = R(zucht({ buyers: [partei('Anna'), partei('Ben', 'male')] }));
    const p2 = v.paragrafen[1].absaetze.map((a) => a.text).join('\n');
    const p16 = v.paragrafen[15].absaetze.map((a) => a.text).join('\n');
    expect(p2).toMatch(/als Gesamtschuldner/);
    expect(p16).toMatch(/als Gesamtschuldner/);
    expect(v.paragrafen).toHaveLength(17);
  });

  it('das Ab- oder Zuschalten verändert die Paragrafenzahl nicht', () => {
    expect(R(zucht({ buyers: [partei('A')] })).paragrafen).toHaveLength(17);
    expect(R(zucht({ buyers: [partei('A'), partei('B')] })).paragrafen).toHaveLength(17);
  });

  it('Anzahlung: nur einer der beiden Zahlungsabsätze erscheint', () => {
    const ohne = text(standard());
    expect(ohne).not.toMatch(/Anzahlung/);
    expect(ohne).toMatch(/Der Kaufpreis ist spätestens bei der Übergabe zu entrichten\./);

    const mit = text(standard({ depositCents: 56_000 }));
    expect(mit).toContain(`Anzahlung in Höhe von ${geld(56_000)}`);
    expect(mit).toContain(`Restbetrag von ${geld(194_000)}`);
  });

  it('eine Anzahlung von 0 € gilt als keine Anzahlung', () => {
    expect(text(standard({ depositCents: 0 }))).not.toMatch(/Anzahlung/);
  });

  it('Kontodaten erscheinen nur mit hinterlegter IBAN', () => {
    expect(text(standard())).toMatch(/IBAN: DE00/);
    const ohneIban = text(standard(), { ...VERKAEUFERIN, iban: '' });
    expect(ohneIban).not.toMatch(/IBAN/);
  });

  it('der Schlussparagraf erscheint nur, wenn er gefüllt ist', () => {
    const ohne = R(standard());
    expect(ohne.paragrafen.some((p) => p.ueberschrift.includes('Individuelle'))).toBe(false);
    expect(ohne.paragrafen).toHaveLength(8);

    const mit = R(standard({ additionalAgreement: 'Mia bleibt bis Juli bei der Züchterin.' }));
    expect(mit.paragrafen).toHaveLength(9);
    expect(mit.paragrafen[8].ueberschrift).toBe('§ 9 Individuelle Vereinbarungen');
    expect(mit.paragrafen[8].absaetze[0].text).toBe('Mia bleibt bis Juli bei der Züchterin.');
  });

  it('ein Schlussparagraf aus reinem Leerraum zählt als leer', () => {
    expect(R(standard({ additionalAgreement: '   \n  ' })).paragrafen).toHaveLength(8);
  });

  it('in Vertrag B wird der Schlussparagraf zu § 18', () => {
    const v = R(zucht({ additionalAgreement: 'Die Katze wird im Mai abgeholt.' }));
    expect(v.paragrafen).toHaveLength(18);
    expect(v.paragrafen[17].ueberschrift).toBe('§ 18 Individuelle Vereinbarungen');
  });

  it('setzt die Bedingungen richtig', () => {
    const b = bedingungen(standard({ buyers: [partei('A'), partei('B')] }), VERKAEUFERIN);
    expect(b.has('mehrereKaeufer')).toBe(true);
    expect(b.has('einKaeufer')).toBe(false);
    expect(b.has('ohneAnzahlung')).toBe(true);
    expect(b.has('mitIban')).toBe(true);
    expect(b.has('zusatz')).toBe(false);
  });

  it('ohne eingetragenen Käufer wird wie bei einer Person gedruckt', () => {
    const b = bedingungen(standard({ buyers: [] }), VERKAEUFERIN);
    expect(b.has('einKaeufer')).toBe(true);
    expect(text(standard({ buyers: [] }))).not.toMatch(/Gesamtschuldner/);
  });
});

/* ------------------------------------------------------------------ */
/*  Ein Beispielsatz je Paragraf                                       */
/* ------------------------------------------------------------------ */

describe('Vertrag A — je Paragraf ein Beispielsatz', () => {
  const v = R(standard({ animals: [katze('Mia')], buyers: [partei('Anna Muster', 'female')] }));
  const absatz = (nr: number, i = 0) => v.paragrafen[nr - 1].absaetze[i].text;

  it('§ 1 nennt Verkäuferin, Käuferin und das Tier', () => {
    expect(absatz(1)).toBe(
      'Die Verkäuferin verkauft der Käuferin eine Katze der Rasse Russisch Blau.',
    );
    expect(absatz(1, 1)).toBe('Mia, Katze, Chipnummer 276093400000001, geboren am 03.03.2026');
    expect(absatz(1, 2)).toBe('Die Katze wurde am 03.03.2026 geboren.');
  });

  it('§ 2 nennt den Kaufpreis', () => {
    expect(absatz(2)).toBe(`Der Kaufpreis beträgt insgesamt ${geld(250_000)}.`);
  });

  it('§ 3 nennt Termin und Ort als freien Text', () => {
    expect(absatz(3)).toBe('Die Übergabe erfolgt voraussichtlich Anfang Juni 2026 in Beispielstadt.');
  });

  it('§ 4 beschreibt den Gesundheitszustand', () => {
    expect(absatz(4).startsWith('Die Katze ist bei der Übergabe')).toBe(true);
  });

  it('§ 5 verpflichtet die Käuferin zur artgerechten Haltung', () => {
    expect(absatz(5).startsWith('Die Käuferin verpflichtet sich, die Katze artgerecht')).toBe(true);
  });

  it('§ 6 schließt die Zucht aus', () => {
    expect(absatz(6)).toBe(
      'Die Katze wird ausschließlich als Liebhabertier abgegeben. Eine Verwendung zur Zucht ist ausgeschlossen.',
    );
  });

  it('§ 7 schließt die Gewähr aus', () => {
    expect(absatz(7).startsWith('Die Katze wird als lebendes Tier verkauft.')).toBe(true);
  });

  it('§ 8 zählt die Unterlagen auf und ist immer gleich', () => {
    expect(absatz(8)).toBe('Mit der Übergabe erhält die Käuferin folgende Unterlagen:');
    expect(absatz(8, 1)).toMatch(/Impfpass mit eingetragener Chipnummer/);

    // Derselbe Paragraf mit ganz anderen Daten — nur Artikel ändern sich.
    const anders = R(standard({ animals: [kater('Ben'), kater('Carl')], buyers: [partei('X', 'male'), partei('Y', 'male')] }));
    expect(anders.paragrafen[7].absaetze[0].text).toBe(
      'Mit der Übergabe erhalten die Käufer folgende Unterlagen:',
    );
    expect(anders.paragrafen[7].absaetze[1].text).toBe(v.paragrafen[7].absaetze[1].text);
  });
});

describe('Vertrag B — je Paragraf ein Beispielsatz', () => {
  const v = R(zucht({ buyers: [partei('Anna Muster', 'female')] }));
  const absatz = (nr: number, i = 0) => v.paragrafen[nr - 1].absaetze[i].text;

  it('§ 1 Vertragsgegenstand', () => {
    expect(absatz(1)).toBe(
      'Die Verkäuferin verkauft der Käuferin eine Katze der Rasse Russisch Blau.',
    );
  });

  it('§ 2 regulärer Preis, Nachlass und ermäßigter Betrag', () => {
    expect(absatz(2)).toBe(`Der reguläre Kaufpreis beträgt ${geld(250_000)}.`);
    expect(absatz(2, 1)).toBe(
      'Wegen des in § 3 vereinbarten Vorbehalts der einmaligen Zuchtnutzung gewährt die ' +
        `Verkäuferin einen Preisnachlass in Höhe von ${geld(138_000)}. Die Käuferin zahlt ` +
        `damit einen ermäßigten Kaufpreis von ${geld(112_000)}.`,
    );
    expect(absatz(2, 3)).toMatch(/Verwendungszweck: Kaufvertrag Mia \/ Anna Muster/);
  });

  it('§ 3 Vorbehalt der Zuchtnutzung', () => {
    expect(absatz(3).startsWith('Die Verkäuferin behält sich das Recht vor, die Katze einmalig')).toBe(
      true,
    );
  });

  it('§ 4 Frist von 18 Monaten mit berechnetem Ende', () => {
    expect(absatz(4)).toBe(
      'Das Recht zur Zuchtnutzung ist auf 18 Monate ab der erstmaligen Überlassung der Katze an die Käuferin befristet.',
    );
    expect(absatz(4, 1)).toBe(
      'Die erstmalige Überlassung erfolgte am 01.06.2026. Die Frist endet damit mit Ablauf des 01.12.2027.',
    );
  });

  it('§ 5 Verlängerung um 6 Monate', () => {
    expect(absatz(5)).toMatch(/verlängert sich einmalig um 6 Monate/);
  });

  it('§ 6 Herausgabe binnen 3 Kalendertagen', () => {
    expect(absatz(6, 1)).toBe(
      'Die Käuferin verpflichtet sich, die Katze innerhalb von 3 Kalendertagen nach dieser Anzeige an die Verkäuferin herauszugeben.',
    );
  });

  it('§ 7 Dauer der Überlassung', () => {
    expect(absatz(7).startsWith('Die Katze bleibt bei der Verkäuferin')).toBe(true);
  });

  it('§ 8 zwei Deckversuche', () => {
    expect(absatz(8)).toBe('Die Verkäuferin hat Anspruch auf bis zu 2 Deckversuche.');
  });

  it('§ 9 Kosten während der Überlassung', () => {
    expect(absatz(9)).toMatch(/tierärztliche Versorgung der Katze/);
  });

  it('§ 10 Eigentum an den Nachkommen', () => {
    expect(absatz(10)).toBe(
      'Die aus der Zuchtnutzung hervorgehenden Nachkommen stehen im Alleineigentum der Verkäuferin.',
    );
  });

  it('§ 11 Kastrationsverbot', () => {
    expect(absatz(11)).toBe(
      'Die Käuferin darf die Katze bis zum Abschluss der Zuchtnutzung weder kastrieren noch sterilisieren lassen.',
    );
  });

  it('§ 12 Gesundheitsvorsorge', () => {
    expect(absatz(12)).toMatch(/HCM/);
    expect(absatz(12, 1)).toBe('Die Kosten dieser Untersuchungen trägt die Verkäuferin.');
  });

  it('§ 13 Haltung', () => {
    expect(absatz(13).startsWith('Die Käuferin verpflichtet sich, die Katze artgerecht')).toBe(true);
  });

  it('§ 14 Weitergabe und Anzeigepflichten', () => {
    expect(absatz(14).startsWith('Solange das Recht zur Zuchtnutzung besteht, darf die Käuferin')).toBe(
      true,
    );
  });

  it('§ 15 Fristablauf und Nachzahlung binnen 14 Tagen', () => {
    expect(absatz(15, 1)).toBe(
      `Die Käuferin hat in diesem Fall den Preisnachlass in Höhe von ${geld(138_000)} ` +
        'binnen 14 Tagen nach Fristablauf nachzuzahlen.',
    );
  });

  it('§ 16 Unterlagen und Schlussbestimmungen', () => {
    expect(absatz(16)).toMatch(/Impfpass mit eingetragener Chipnummer/);
  });

  it('§ 17 Salvatorische Klausel', () => {
    expect(absatz(17).startsWith('Sollte eine Bestimmung dieses Vertrages unwirksam')).toBe(true);
  });

  it('passt sich bei zwei Katzen und drei Käufern durchgehend an', () => {
    const m = R(
      zucht({
        animals: [katze('Mia'), katze('Nala', '276093400000009')],
        buyers: [partei('Anna'), partei('Ben', 'male'), partei('Cem', 'male')],
      }),
    );
    const alles = vertragAlsText(m);
    expect(alles).toMatch(/verkauft den Käufern zwei Katzen der Rasse Russisch Blau/);
    expect(alles).toMatch(/Die Katzen wurden am 03\.03\.2026 geboren\./);
    expect(alles).toMatch(/Die Käufer verpflichten sich, die Katzen innerhalb von 3 Kalendertagen/);
    expect(alles).toMatch(/Verwendungszweck: Kaufvertrag Mia und Nala \/ Anna, Ben und Cem/);
    expect(alles).toMatch(/Mehrere Käufer haften/);
  });
});

/* ------------------------------------------------------------------ */
/*  Werte, Lücken und Unterschriften                                   */
/* ------------------------------------------------------------------ */

describe('Werte und Lücken', () => {
  it('setzt für fehlende Angaben eine ausfüllbare Lücke, nie einen erfundenen Wert', () => {
    const leer: ContractData = {
      type: 'standard',
      buyers: [],
      animals: [],
      breed: '',
    };
    const t = text(leer, { name: '', address: '', clubName: 'Catmaniac' });
    expect(t).toMatch(/__________/);
    expect(t).not.toMatch(/undefined|null|NaN/);
    expect(t).not.toMatch(/[{}]/);
  });

  it('nimmt den Übergabeort aus den Einstellungen, wenn keiner eingetragen ist', () => {
    const w = werte(standard({ handoverPlace: '' }), VERKAEUFERIN);
    expect(w.uebergabeort).toBe('Beispielstadt');
  });

  it('rechnet Restsumme und ermäßigten Betrag ins Vokabular', () => {
    const a = werte(standard({ depositCents: 56_000 }), VERKAEUFERIN);
    expect(a.restsumme).toBe(geld(194_000));
    const b = werte(zucht(), VERKAEUFERIN);
    expect(b.ermaessigt).toBe(geld(112_000));
    expect(b.fristende).toBe('01.12.2027');
  });

  it('gemeinsames Geburtsdatum: gleich, verschieden, fehlend', () => {
    expect(gemeinsamesGeburtsdatum(standard({ animals: [katze(), katze('B')] }))).toBe('03.03.2026');
    expect(
      gemeinsamesGeburtsdatum(
        standard({ animals: [katze(), { name: 'B', sex: 'female', birthDate: '2026-03-04' }] }),
      ),
    ).toBe('den oben genannten Tagen');
    expect(gemeinsamesGeburtsdatum(standard({ animals: [{ name: 'B', sex: 'female' }] }))).toBe(
      '__________',
    );
  });

  it('nennt fehlende Geldbeträge als Lücke mit Euro-Zeichen', () => {
    expect(werte(standard({ totalPriceCents: undefined }), VERKAEUFERIN).preis).toBe(
      '__________ €',
    );
  });
});

describe('Unterschriften', () => {
  it('eine Linie je Partei — Verkäuferin und ein Käufer', () => {
    const v = R(standard());
    expect(v.unterschriften).toEqual([
      { rolle: 'Verkäuferin', name: 'Beispiel Züchterin' },
      { rolle: 'Käuferin', name: 'Anna Muster' },
    ]);
  });

  it('nummeriert bei mehreren Käufern', () => {
    const v = R(standard({ buyers: [partei('Anna'), partei('Ben', 'male'), partei('Cem', 'male')] }));
    expect(v.unterschriften.map((u) => u.rolle)).toEqual([
      'Verkäuferin',
      'Käuferin 1',
      'Käufer 2',
      'Käufer 3',
    ]);
  });

  it('legt auch ohne Käufer eine Linie an', () => {
    expect(R(standard({ buyers: [] })).unterschriften).toHaveLength(2);
  });

  it('druckt kein Datum vor — Ort und Datum bleiben frei', () => {
    const t = text(standard());
    expect(t).toMatch(/\nOrt, Datum\n/);
    // Kein vorgedrucktes Unterschriftsdatum irgendwo im Text.
    expect(t).not.toMatch(/Ort, Datum:? *\d/);
  });
});

/* ------------------------------------------------------------------ */
/*  Hinweise für die Oberfläche                                        */
/* ------------------------------------------------------------------ */

describe('Hinweise', () => {
  it('schweigt, wenn alles ausgefüllt ist', () => {
    expect(R(standard()).hinweise).toEqual([]);
  });

  it('meldet fehlende Verkäuferdaten', () => {
    const v = R(standard(), { name: '', address: '', clubName: 'Catmaniac' });
    expect(v.hinweise[0]).toMatch(/Einstellungen/);
  });

  it('meldet fehlende Angaben im Zuchtnutzungsvertrag', () => {
    const v = R(zucht({ breedingUseStartDate: undefined, discountCents: undefined }));
    expect(v.hinweise.join(' ')).toMatch(/Preisnachlass fehlt/);
    expect(v.hinweise.join(' ')).toMatch(/erstmaligen Überlassung/);
  });

  it('warnt, wenn in Vertrag B ein Kater steht', () => {
    expect(R(zucht({ animals: [kater()] })).hinweise.join(' ')).toMatch(/nur für weibliche Tiere/);
  });

  it('warnt bei mehr als zwei Katzen in Vertrag B', () => {
    const v = R(zucht({ animals: [katze('A'), katze('B'), katze('C')] }));
    expect(v.hinweise.join(' ')).toMatch(/ein bis zwei Katzen/);
  });
});

/* ------------------------------------------------------------------ */
/*  Reiner Text                                                        */
/* ------------------------------------------------------------------ */

describe('Textausgabe', () => {
  it('beginnt mit dem Titel und endet mit den Unterschriften', () => {
    const t = text(standard());
    expect(t.split('\n')[0]).toBe('Kaufvertrag');
    expect(t.trimEnd().endsWith('Käuferin: Anna Muster')).toBe(true);
  });

  it('häuft keine Leerzeilen an', () => {
    expect(text(zucht())).not.toMatch(/\n{3,}/);
  });

  it('enthält alle Paragrafenüberschriften in der richtigen Reihenfolge', () => {
    // Nur Überschriften am Zeilenanfang zählen — im Text stehen auch
    // Querverweise wie „in § 3 vereinbarten".
    const ueberschriften = vertragAlsText(R(zucht()))
      .split('\n')
      .filter((z) => /^§ \d+ /.test(z));
    expect(ueberschriften).toHaveLength(17);
    ueberschriften.forEach((z, i) => expect(z.startsWith(`§ ${i + 1} `)).toBe(true));
  });

  it('trägt Umlaute und ß unverändert', () => {
    const t = text(standard({ additionalAgreement: 'Die Übergabe erfolgt in der Straße 3, groß.' }));
    expect(t).toMatch(/Die Übergabe erfolgt in der Straße 3, groß\./);
  });
});
