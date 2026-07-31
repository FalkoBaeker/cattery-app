/**
 * Die wichtigste Prüfung des Moduls: Der erzeugte Vertragstext wird
 * gegen die Textvorlagen docs/vertrag-a.txt und docs/vertrag-b.txt
 * gelegt — Wort für Wort.
 *
 * Dazu löst der Test die Vorlagen-Schreibweise ({{…}}, [EZ:…|MZ:…],
 * {{#…}}…{{/…}}) mit einer EIGENEN, bewusst simplen Umsetzung auf und
 * vergleicht das Ergebnis mit dem, was rendereVertrag/vertragAlsText
 * liefern. Ein umformulierter, fehlender oder hinzugedichteter Satz in
 * den Code-Vorlagen fällt hier sofort auf.
 *
 * Verglichen wird bis zum Unterschriftenblock; Leerraum (Zeilenumbrüche
 * der 76-Zeichen-Umbrüche in den Textdateien) wird normalisiert.
 */

import { describe, expect, it } from 'vitest';

import vertragARoh from '../../../docs/vertrag-a.txt?raw';
import vertragBRoh from '../../../docs/vertrag-b.txt?raw';
import { rendereVertrag, vertragAlsText, werte } from './render';
import type { ContractAnimal, ContractData, ContractParty, SellerSettings } from '../../types';

const LUECKE = '__________';

/* ------------------------------------------------------------------ */
/*  Textvorlagen einlesen                                              */
/* ------------------------------------------------------------------ */

const VORLAGEN: Record<string, string> = {
  'vertrag-a.txt': vertragARoh,
  'vertrag-b.txt': vertragBRoh,
};

function vorlagentext(datei: string): string {
  const zeilen = VORLAGEN[datei].split('\n');
  const marker = zeilen.indexOf('TEXT');
  expect(marker, `Abschnitt TEXT fehlt in ${datei}`).toBeGreaterThan(0);
  // Nach "TEXT" folgt eine Trennlinie aus Bindestrichen.
  return zeilen.slice(marker + 2).join('\n');
}

/* ------------------------------------------------------------------ */
/*  Eigene, simple Auflösung der Vorlagen-Schreibweise                 */
/* ------------------------------------------------------------------ */

interface Auswahl {
  /** Ein-/Mehrzahl der Tiere (EZ/MZ bzw. T1/TN). */
  mehrereTiere: boolean;
  /** Käuferseite: ein Mann, eine Frau oder mehrere Personen. */
  kaeufer: 'K1M' | 'K1W' | 'KN';
  mitAnzahlung: boolean;
  mitZusatz: boolean;
}

function abschnitt(text: string, tag: string, behalten: boolean): string {
  const auf = new RegExp(`\\{\\{#${tag}\\}\\}\\n?([\\s\\S]*?)\\{\\{/${tag}\\}\\}\\n?`, 'g');
  const zu = new RegExp(`\\{\\{\\^${tag}\\}\\}\\n?([\\s\\S]*?)\\{\\{/${tag}\\}\\}\\n?`, 'g');
  return text
    .replace(auf, (_, inhalt: string) => (behalten ? inhalt : ''))
    .replace(zu, (_, inhalt: string) => (behalten ? '' : inhalt));
}

function schleife(
  text: string,
  tag: string,
  eintraege: Record<string, string>[],
): string {
  const muster = new RegExp(`\\{\\{#${tag}\\}\\}\\n?([\\s\\S]*?)\\{\\{/${tag}\\}\\}\\n?`, 'g');
  return text.replace(muster, (_, rumpf: string) =>
    eintraege
      .map((e) =>
        rumpf.replace(/\{\{([A-Za-z]+)\}\}/g, (treffer, key: string) => e[key] ?? treffer),
      )
      .join('\n'),
  );
}

function loeseVorlage(
  roh: string,
  wahl: Auswahl,
  vokabeln: Record<string, string>,
  tiere: Record<string, string>[],
): string {
  let t = roh;

  // Bekannter Schreibfehler der Vorlage A: Im Titel stünde das Zahlwort
  // in der Mehrzahl doppelt ("zwei zwei Kitten"). Gemeint ist
  // "Kaufvertrag über zwei Kitten". Bricht dieser Ersatz, hat sich die
  // Vorlage geändert und der Test soll auffallen.
  t = t.replace(
    '{{tierzahlWort}} [EZ:Kitten|MZ:{{tierzahlWort}} Kitten]',
    '{{tierzahlWort}} Kitten',
  );

  // Blöcke, die je nach Lage ganz erscheinen oder ganz entfallen.
  t = t.replace(
    /\{\{nurMehrereKaeufer\}\}\n?([\s\S]*?)\{\{\/nurMehrereKaeufer\}\}\n?/g,
    (_, inhalt: string) => (wahl.kaeufer === 'KN' ? inhalt : ''),
  );
  t = abschnitt(t, 'anzahlung', wahl.mitAnzahlung);
  t = abschnitt(t, 'zusatz', wahl.mitZusatz);

  // Tier-Schleifen.
  t = schleife(t, 'tiere', tiere);
  t = schleife(t, 'katzen', tiere);
  t = schleife(t, 'kaeuferListe', []); // Unterschriften — werden ohnehin abgeschnitten.

  // Grammatik-Schalter.
  t = t.replace(/\[(?:EZ|T1):([^|\]]*)\|(?:MZ|TN):([^\]]*)\]/g, (_, ez: string, mz: string) =>
    wahl.mehrereTiere ? mz : ez,
  );
  t = t.replace(
    /\[K1M:([^|\]]*)\|K1W:([^|\]]*)\|KN:([^\]]*)\]/g,
    (_, m: string, w: string, pl: string) =>
      wahl.kaeufer === 'KN' ? pl : wahl.kaeufer === 'K1W' ? w : m,
  );

  // Platzhalter. Unbekannte Schlüssel lassen den Test scheitern.
  t = t.replace(/\{\{([A-Za-z][A-Za-z0-9_.]*)\}\}/g, (_, key: string) => {
    const wert = vokabeln[key];
    expect(wert, `Platzhalter {{${key}}} ohne Wert`).toBeDefined();
    return wert as string;
  });

  return t;
}

/* ------------------------------------------------------------------ */
/*  Vergleichen                                                        */
/* ------------------------------------------------------------------ */

/** Unterschriftenblock abschneiden, Unterschriftslinien und Leerraum glätten. */
function vergleichbar(text: string): string {
  const ohneLinien = text
    .split('\n')
    .filter((z) => !/^_+\s*$/.test(z.trim()))
    .join('\n');
  const schnitt = ohneLinien.indexOf('Ort, Datum');
  const rumpf = schnitt >= 0 ? ohneLinien.slice(0, schnitt) : ohneLinien;
  return rumpf.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/*  Beispieldaten                                                      */
/* ------------------------------------------------------------------ */

const VERKAEUFERIN: SellerSettings = {
  name: 'Beispiel Züchterin',
  address: 'Beispielweg 3, 12345 Beispielstadt',
  birthDate: '1985-06-14',
  iban: 'DE00 0000 0000 0000 0000 00',
  place: 'Beispielstadt',
  clubName: 'Catmaniac',
};

function katze(name: string, chipNo: string): ContractAnimal {
  return { name, sex: 'female', chipNo, birthDate: '2026-03-03' };
}

function partei(name: string, sex: ContractParty['sex']): ContractParty {
  return { name, sex, address: 'Musterweg 1, 12345 Musterstadt', birthDate: '1990-04-05' };
}

/** Schleifen-Einträge so, wie die Vorlage die Felder je Tier nennt. */
function tierEintraege(data: ContractData): Record<string, string>[] {
  return data.animals.map((a) => ({
    name: a.name?.trim() || LUECKE,
    chip: a.chipNo?.trim() || LUECKE,
    gebDatum: a.birthDate ? '03.03.2026' : LUECKE,
    rasse: data.breed?.trim() || LUECKE,
  }));
}

function pruefe(datei: string, data: ContractData, wahl: Auswahl) {
  const vokabeln = werte(data, VERKAEUFERIN) as Record<string, string>;
  const soll = vergleichbar(loeseVorlage(vorlagentext(datei), wahl, vokabeln, tierEintraege(data)));
  const ist = vergleichbar(vertragAlsText(rendereVertrag({ data, seller: VERKAEUFERIN })));
  expect(ist).toBe(soll);
}

/* ------------------------------------------------------------------ */
/*  Vertrag A                                                          */
/* ------------------------------------------------------------------ */

describe('Wortlaut-Abgleich gegen docs/vertrag-a.txt', () => {
  const basis: ContractData = {
    type: 'standard',
    buyers: [partei('Anna Muster', 'female')],
    animals: [katze('Mia', '276093400000001')],
    breed: 'Russisch Blau',
    totalPriceCents: 250_000,
    handoverText: 'Anfang Juni 2026',
    handoverPlace: 'Beispielstadt',
  };

  it('ein Kitten, eine Käuferin, ohne Anzahlung, ohne Zusatz', () => {
    pruefe('vertrag-a.txt', basis, {
      mehrereTiere: false,
      kaeufer: 'K1W',
      mitAnzahlung: false,
      mitZusatz: false,
    });
  });

  it('ein Kitten, ein Käufer, mit Anzahlung', () => {
    pruefe(
      'vertrag-a.txt',
      { ...basis, buyers: [partei('Ben Muster', 'male')], depositCents: 56_000 },
      { mehrereTiere: false, kaeufer: 'K1M', mitAnzahlung: true, mitZusatz: false },
    );
  });

  it('zwei Kitten, zwei Käufer, mit Anzahlung und Zusatz', () => {
    pruefe(
      'vertrag-a.txt',
      {
        ...basis,
        animals: [katze('Mia', '276093400000001'), katze('Nala', '276093400000002')],
        buyers: [partei('Anna Muster', 'female'), partei('Ben Muster', 'male')],
        depositCents: 100_000,
        additionalAgreement: 'Die Kitten werden gemeinsam abgeholt.',
      },
      { mehrereTiere: true, kaeufer: 'KN', mitAnzahlung: true, mitZusatz: true },
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Vertrag B                                                          */
/* ------------------------------------------------------------------ */

describe('Wortlaut-Abgleich gegen docs/vertrag-b.txt', () => {
  const basis: ContractData = {
    type: 'breeding_reserved',
    buyers: [partei('Ben Muster', 'male')],
    animals: [katze('Mia', '276093400000001')],
    breed: 'Russisch Blau',
    regularPriceCents: 250_000,
    discountCents: 138_000,
    breedingUseStartDate: '2026-06-01',
    breedingUseMonths: 18,
    breedingUseExtensionMonths: 6,
    handoverDeadlineDays: 3,
    matingAttempts: 2,
    backPaymentDays: 14,
  };

  it('eine Katze, ein Käufer — ohne Gesamtschuldner-Klauseln', () => {
    pruefe('vertrag-b.txt', basis, {
      mehrereTiere: false,
      kaeufer: 'K1M',
      mitAnzahlung: false,
      mitZusatz: false,
    });
  });

  it('eine Katze, eine Käuferin', () => {
    pruefe(
      'vertrag-b.txt',
      { ...basis, buyers: [partei('Anna Muster', 'female')] },
      { mehrereTiere: false, kaeufer: 'K1W', mitAnzahlung: false, mitZusatz: false },
    );
  });

  it('zwei Katzen, drei Käufer, mit Zusatz — mit Gesamtschuldner-Klauseln', () => {
    pruefe(
      'vertrag-b.txt',
      {
        ...basis,
        animals: [katze('Mia', '276093400000001'), katze('Nala', '276093400000002')],
        buyers: [
          partei('Anna Muster', 'female'),
          partei('Ben Muster', 'male'),
          partei('Cem Muster', 'male'),
        ],
        additionalAgreement: 'Die Katzen bleiben bis Ende Juli bei der Züchterin.',
      },
      { mehrereTiere: true, kaeufer: 'KN', mitAnzahlung: false, mitZusatz: true },
    );
  });
});
