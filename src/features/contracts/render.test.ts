import { describe, expect, it } from 'vitest';
import {
  bedingungen,
  gemeinsamesGeburtsdatum,
  katzenListe,
  rendereVertrag,
  tiereListe,
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
  it('Vertrag A hat 8 Paragrafen und den Titel der Vorlage', () => {
    const v = R(standard());
    expect(v.paragrafen).toHaveLength(8);
    expect(v.titel).toBe('Kaufvertrag über ein Kitten der Rasse Russisch Blau');
    expect(v.paragrafen[7].ueberschrift).toBe('§ 8 Unterlagen (bei Übergabe ausgehändigt):');
  });

  it('Vertrag A zählt die Kitten im Titel', () => {
    const v = R(standard({ animals: [katze('Mia'), kater('Ben')] }));
    expect(v.titel).toBe('Kaufvertrag über zwei Kitten der Rasse Russisch Blau');
  });

  it('Vertrag B hat 17 Paragrafen und den Titel der Vorlage', () => {
    const v = R(zucht());
    expect(v.paragrafen).toHaveLength(17);
    expect(v.titel).toBe(
      'Kaufvertrag über eine Russisch Blau-Katze als Liebhabertier mit vorbehaltener einmaliger Zuchtnutzung der Verkäuferin',
    );
    expect(v.paragrafen[16].ueberschrift).toBe('§ 17 Schlussbestimmungen');
  });

  it('Vertrag B mit zwei Katzen wechselt den Titel in die Mehrzahl', () => {
    const v = R(zucht({ animals: [katze('Mia'), katze('Nala', '276093400000009')] }));
    expect(v.titel).toBe(
      'Kaufvertrag über zwei Russisch Blau-Katzen als Liebhabertiere mit vorbehaltener einmaliger Zuchtnutzung der Verkäuferin',
    );
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

  it('lässt in keinem Fall Platzhalter oder Schalter stehen', () => {
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
      expect(text(f)).not.toMatch(/\[(?:EZ|T1|K1M):/);
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

  it('Anzahlung: ohne Anzahlung wird die Kaufsumme genannt, mit Anzahlung die Restsumme', () => {
    const ohne = text(standard());
    expect(ohne).not.toMatch(/Anzahlung/);
    expect(ohne).toMatch(/Die Kaufsumme wird vor Abholung auf das Konto von Beispiel Züchterin/);

    const mit = text(standard({ depositCents: 56_000 }));
    expect(mit).toContain(`Anzahlung: ${geld(56_000)} geleistet`);
    expect(mit).toContain(`Restsumme: ${geld(194_000)}`);
    expect(mit).toMatch(/Die Restsumme wird vor Abholung auf das Konto/);
    expect(mit).not.toMatch(/Die Kaufsumme wird/);
  });

  it('eine Anzahlung von 0 € gilt als keine Anzahlung', () => {
    expect(text(standard({ depositCents: 0 }))).not.toMatch(/Anzahlung/);
  });

  it('ohne hinterlegte IBAN bleibt im Kontosatz eine Lücke', () => {
    expect(text(standard())).toContain('DE00 0000 0000 0000 0000 00');
    const ohneIban = text(standard(), { ...VERKAEUFERIN, iban: '' });
    expect(ohneIban).toContain('das Konto von Beispiel Züchterin: __________');
  });

  it('der Schlussparagraf erscheint nur, wenn er gefüllt ist', () => {
    const ohne = R(standard());
    expect(ohne.paragrafen.some((p) => p.ueberschrift.includes('Ergänzende'))).toBe(false);
    expect(ohne.paragrafen).toHaveLength(8);

    const mit = R(standard({ additionalAgreement: 'Mia bleibt bis Juli bei der Züchterin.' }));
    expect(mit.paragrafen).toHaveLength(9);
    expect(mit.paragrafen[8].ueberschrift).toBe('§ 9 Ergänzende Vereinbarungen');
    expect(mit.paragrafen[8].absaetze[0].text).toBe('Mia bleibt bis Juli bei der Züchterin.');
  });

  it('ein Schlussparagraf aus reinem Leerraum zählt als leer', () => {
    expect(R(standard({ additionalAgreement: '   \n  ' })).paragrafen).toHaveLength(8);
  });

  it('in Vertrag B wird der Schlussparagraf zu § 18', () => {
    const v = R(zucht({ additionalAgreement: 'Die Katze wird im Mai abgeholt.' }));
    expect(v.paragrafen).toHaveLength(18);
    expect(v.paragrafen[17].ueberschrift).toBe('§ 18 Ergänzende Vereinbarungen');
  });

  it('setzt die Bedingungen richtig', () => {
    const b = bedingungen(standard({ buyers: [partei('A'), partei('B')] }), VERKAEUFERIN);
    expect(b.has('mehrereKaeufer')).toBe(true);
    expect(b.has('einKaeufer')).toBe(false);
    expect(b.has('ohneAnzahlung')).toBe(true);
    expect(b.has('zusatz')).toBe(false);
  });

  it('ohne eingetragenen Käufer wird wie bei einer Person gedruckt', () => {
    const b = bedingungen(standard({ buyers: [] }), VERKAEUFERIN);
    expect(b.has('einKaeufer')).toBe(true);
    expect(text(standard({ buyers: [] }))).not.toMatch(/Gesamtschuldner/);
  });
});

/* ------------------------------------------------------------------ */
/*  Stichproben aus dem Wortlaut                                       */
/*  (Der vollständige Abgleich gegen die Textvorlagen steht in         */
/*  vorlagen.test.ts — hier nur die Grammatik-Weichen.)                */
/* ------------------------------------------------------------------ */

describe('Vertrag A — Grammatik-Weichen im Wortlaut', () => {
  it('ein Kitten: Einzahl in § 1', () => {
    const v = R(standard());
    expect(v.paragrafen[0].absaetze[0].text).toBe(
      'Die Verkäuferin veräußert ein reinrassiges Russisch Blau-Kitten.',
    );
    expect(v.paragrafen[0].absaetze[1].text).toBe(
      'Chipnummer: 276093400000001 (Mia)\nGeboren am: 03.03.2026',
    );
    expect(v.paragrafen[0].absaetze[2].text).toMatch(/^Das Kitten ist bis zum Übergabetermin/);
    expect(v.paragrafen[0].absaetze[2].text).toMatch(/Zuchtvereins Catmaniac/);
  });

  it('zwei Kitten: Mehrzahl in § 1, eine Zeile je Chipnummer', () => {
    const v = R(standard({ animals: [katze('Mia'), kater('Ben')] }));
    expect(v.paragrafen[0].absaetze[0].text).toBe(
      'Die Verkäuferin veräußert zwei reinrassige Russisch Blau-Kitten.',
    );
    expect(v.paragrafen[0].absaetze[1].text).toBe(
      'Chipnummer: 276093400000001 (Mia)\nChipnummer: 276093400000002 (Ben)\nGeboren am: 03.03.2026',
    );
    expect(v.paragrafen[0].absaetze[2].text).toMatch(/^Die Kitten sind bis zum Übergabetermin/);
  });

  it('§ 3 druckt Ort und Termin als freien Text', () => {
    expect(R(standard()).paragrafen[2].absaetze[0].text).toMatch(
      /^Übergabeort: Beispielstadt - am: Anfang Juni 2026 oder nach Vereinbarung\./,
    );
  });

  it('§ 3 und § 4 passen sich an die Käuferseite an', () => {
    const w = R(standard({ buyers: [partei('Anna')] }));
    expect(w.paragrafen[2].absaetze[0].text).toMatch(/auf die Käuferin über\.$/);
    expect(w.paragrafen[3].absaetze[0].text).toMatch(/von der Käuferin am Tag der/);

    const m = R(standard({ buyers: [partei('Ben', 'male')] }));
    expect(m.paragrafen[2].absaetze[0].text).toMatch(/auf den Käufer über\.$/);

    const viele = R(standard({ buyers: [partei('Anna'), partei('Ben', 'male')] }));
    expect(viele.paragrafen[2].absaetze[0].text).toMatch(/auf die Käufer über\.$/);
    expect(viele.paragrafen[3].absaetze[0].text).toMatch(/von den Käufern am Tag der/);
  });

  it('§ 5 trägt die Käuferseite in der Überschrift', () => {
    expect(R(standard()).paragrafen[4].ueberschrift).toBe('§ 5 Pflichten der Käuferin');
    expect(R(standard({ buyers: [partei('Ben', 'male')] })).paragrafen[4].ueberschrift).toBe(
      '§ 5 Pflichten des Käufers',
    );
    expect(
      R(standard({ buyers: [partei('A'), partei('B')] })).paragrafen[4].ueberschrift,
    ).toBe('§ 5 Pflichten der Käufer');
  });

  it('der Vorspann nennt beide Parteien mit Anschrift und Geburtsdatum', () => {
    const v = R(standard());
    const vorspann = v.vorspann.map((a) => a.text).join('\n');
    expect(vorspann).toContain('Name: Beispiel Züchterin');
    expect(vorspann).toContain('Geb.-Datum: 14.06.1985');
    expect(vorspann).toContain('Käuferin:\nName: Anna Muster');
    expect(vorspann).toContain('Geb. am: 05.04.1990');
  });
});

describe('Vertrag B — Grammatik-Weichen im Wortlaut', () => {
  it('§ 1 nennt die Katze mit dem Datenblock der Vorlage', () => {
    const v = R(zucht());
    expect(v.paragrafen[0].absaetze[1].text).toBe(
      'Name: Mia\nRasse: Russisch Blau\nGeschlecht: weiblich\nGeburtsdatum: 03.03.2026\nChipnummer: 276093400000001',
    );
    expect(v.paragrafen[0].absaetze[2].text).toBe('nachfolgend „Katze" oder „Mia" genannt.');
  });

  it('§ 1 bei zwei Katzen: zwei Datenblöcke und „Katzen"', () => {
    const v = R(zucht({ animals: [katze('Mia'), katze('Nala', '276093400000009')] }));
    expect(v.paragrafen[0].absaetze[1].text).toContain('Name: Mia');
    expect(v.paragrafen[0].absaetze[1].text).toContain('Name: Nala');
    expect(v.paragrafen[0].absaetze[2].text).toBe('nachfolgend „Katzen" genannt.');
  });

  it('§ 2 rechnet Preis, Nachlass und ermäßigten Betrag in den Text', () => {
    const t = text(zucht());
    expect(t).toContain(`Der Kaufpreis für die Katze beträgt ${geld(250_000)}.`);
    expect(t).toContain(`einen Preisnachlass in Höhe von ${geld(138_000)}`);
    expect(t).toContain(`ein Betrag von ${geld(112_000)} zu zahlen ist`);
    expect(t).toContain(`Der ermäßigte Betrag von ${geld(112_000)} ist auf folgendes Konto`);
    expect(t).toMatch(/Verwendungszweck: Kaufvertrag Mia \/ Anna Muster/);
  });

  it('die Fristen stehen als Zahlen im Text', () => {
    const t = text(zucht());
    expect(t).toContain('innerhalb von 18 Monaten ab der erstmaligen Überlassung');
    expect(t).toContain('einmalig um bis zu 6 Monate verlängern');
    expect(t).toContain('innerhalb von 3 Kalendertagen');
    expect(t).toContain('bis zu 2 Deckversuche');
    expect(t).toContain('innerhalb von 14 Tagen ab Zugang');
  });

  it('geänderte Fristen wandern in den Text', () => {
    const t = text(zucht({ breedingUseMonths: 24, handoverDeadlineDays: 5 }));
    expect(t).toContain('innerhalb von 24 Monaten');
    expect(t).toContain('innerhalb von 5 Kalendertagen');
  });

  it('die Käuferseite zieht sich durch den ganzen Vertrag', () => {
    const w = text(zucht({ buyers: [partei('Anna')] }));
    expect(w).toContain('nachfolgend „Käuferin" genannt.');
    expect(w).toContain('Die Käuferin erwirbt kein eigenes Zuchtrecht.');
    expect(w).toContain('§ 6 Zuchtverbot der Käuferin');
    expect(w).toContain('§ 10 Haltungspflichten der Käuferin');
    expect(w).toContain('ist die Käuferin Verbraucherin');

    const m = text(zucht({ buyers: [partei('Ben', 'male')] }));
    expect(m).toContain('nachfolgend „Käufer" genannt.');
    expect(m).toContain('Der Käufer erwirbt kein eigenes Zuchtrecht.');
    expect(m).toContain('§ 6 Zuchtverbot des Käufers');

    const viele = text(zucht({ buyers: [partei('Anna'), partei('Ben', 'male')] }));
    expect(viele).toContain('nachfolgend gemeinsam „Käufer" genannt.');
    expect(viele).toContain('Die Käufer erwerben kein eigenes Zuchtrecht.');
    expect(viele).toContain('§ 6 Zuchtverbot der Käufer');
  });

  it('passt sich bei zwei Katzen und drei Käufern durchgehend an', () => {
    const alles = text(
      zucht({
        animals: [katze('Mia'), katze('Nala', '276093400000009')],
        buyers: [partei('Anna'), partei('Ben', 'male'), partei('Cem', 'male')],
      }),
    );
    expect(alles).toContain('Anna, Ben und Cem');
    expect(alles).toContain('die Russisch Blau-Katzen:');
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

  it('auch der leere Zuchtnutzungsvertrag druckt Lücken statt Erfundenem', () => {
    const leer: ContractData = {
      type: 'breeding_reserved',
      buyers: [],
      animals: [],
      breed: '',
    };
    const t = text(leer, { name: '', address: '', clubName: 'Catmaniac' });
    expect(t).toMatch(/__________/);
    expect(t).not.toMatch(/undefined|null|NaN/);
  });

  it('nimmt den Übergabeort aus den Einstellungen, wenn keiner eingetragen ist', () => {
    const w = werte(standard({ handoverPlace: '' }), VERKAEUFERIN);
    expect(w.uebergabeOrt).toBe('Beispielstadt');
  });

  it('rechnet Restsumme und ermäßigten Betrag ins Vokabular', () => {
    const a = werte(standard({ depositCents: 56_000 }), VERKAEUFERIN);
    expect(a.restsumme).toBe(geld(194_000));
    const b = werte(zucht(), VERKAEUFERIN);
    expect(b.ermaessigt).toBe(geld(112_000));
  });

  it('verbindet mehrere Käufer zu einer Namenszeile und lässt doppelte Anschriften weg', () => {
    const w = werte(
      standard({ buyers: [partei('Anna Muster'), partei('Ben Muster', 'male')] }),
      VERKAEUFERIN,
    );
    expect(w['kaeufer.name']).toBe('Anna Muster und Ben Muster');
    // Beide wohnen unter derselben Anschrift — sie erscheint nur einmal.
    expect(w['kaeufer.anschrift']).toBe('Musterweg 1, 12345 Musterstadt');
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

  it('tiereListe und katzenListe drucken Lücken für fehlende Angaben', () => {
    expect(tiereListe(standard({ animals: [{ name: '', sex: 'female' }] }))).toBe(
      'Chipnummer: __________ (__________)',
    );
    expect(katzenListe(zucht({ animals: [] }))).toContain('Name: __________');
    expect(katzenListe(zucht({ animals: [] }))).toContain('Geschlecht: weiblich');
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

  it('meldet eine fehlende IBAN', () => {
    const v = R(standard(), { ...VERKAEUFERIN, iban: '' });
    expect(v.hinweise.join(' ')).toMatch(/IBAN/);
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
    expect(t.split('\n')[0]).toBe('Kaufvertrag über ein Kitten der Rasse Russisch Blau');
    expect(t.trimEnd().endsWith('Käuferin: Anna Muster')).toBe(true);
  });

  it('häuft keine Leerzeilen an', () => {
    expect(text(zucht())).not.toMatch(/\n{3,}/);
  });

  it('enthält alle Paragrafenüberschriften in der richtigen Reihenfolge', () => {
    // Nur Überschriften am Zeilenanfang zählen — im Text stehen auch
    // Querverweise wie „nach § 2".
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
