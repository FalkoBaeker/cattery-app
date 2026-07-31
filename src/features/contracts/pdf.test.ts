import { describe, expect, it } from 'vitest';
import { baueVertragsPdf, dateiname, leeresDokument, vertragsPdfBlob } from './pdf';
import { rendereVertrag } from './render';
import type { ContractData, SellerSettings } from '../../types';

const VERKAEUFERIN: SellerSettings = {
  name: 'Beispiel Züchterin',
  address: 'Größere Straße 3, 12345 Beispielstadt',
  birthDate: '1985-06-14',
  iban: 'DE00 0000 0000 0000 0000 00',
  place: 'Beispielstadt',
  clubName: 'Catmaniac',
};

function daten(over: Partial<ContractData> = {}): ContractData {
  return {
    type: 'standard',
    buyers: [
      {
        name: 'Anna Müßiggang',
        sex: 'female',
        address: 'Weiße Gasse 7, 12345 Musterstadt',
        birthDate: '1990-04-05',
      },
    ],
    animals: [{ name: 'Mia', sex: 'female', chipNo: '276093400000001', birthDate: '2026-03-03' }],
    breed: 'Russisch Blau',
    totalPriceCents: 250_000,
    handoverText: 'Anfang Juni 2026',
    handoverPlace: 'Beispielstadt',
    ...over,
  };
}

const doc = async (over: Partial<ContractData> = {}) =>
  baueVertragsPdf(rendereVertrag({ data: daten(over), seller: VERKAEUFERIN }), await leeresDokument());

/** PDF-Bytes als Latin-1-Text — so lassen sich Zeichen direkt suchen. */
async function alsLatin1(over: Partial<ContractData> = {}): Promise<string> {
  const puffer = (await doc(over)).output('arraybuffer');
  return String.fromCharCode(...new Uint8Array(puffer));
}

describe('PDF-Grundgerüst', () => {
  it('ist ein A4-Dokument im Hochformat', async () => {
    const d = await doc();
    const { width, height } = d.internal.pageSize;
    expect(Math.round(width)).toBe(210);
    expect(Math.round(height)).toBe(297);
  });

  it('erzeugt einen PDF-Blob', async () => {
    const blob = await vertragsPdfBlob(rendereVertrag({ data: daten(), seller: VERKAEUFERIN }));
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1000);
  });

  it('bricht auf mehrere Seiten um und nummeriert sie', async () => {
    const d = await doc();
    expect(d.getNumberOfPages()).toBeGreaterThan(1);
    const roh = await alsLatin1();
    expect(roh).toContain(`Seite 1 von ${d.getNumberOfPages()}`);
    expect(roh).toContain(`Seite ${d.getNumberOfPages()} von ${d.getNumberOfPages()}`);
  });

  it('der lange Zuchtnutzungsvertrag hat mehr Seiten als der kurze', async () => {
    const kurz = (await doc()).getNumberOfPages();
    const lang = baueVertragsPdf(
      rendereVertrag({
        data: daten({
          type: 'breeding_reserved',
          regularPriceCents: 250_000,
          discountCents: 138_000,
          breedingUseStartDate: '2026-06-01',
        }),
        seller: VERKAEUFERIN,
      }),
      await leeresDokument(),
    ).getNumberOfPages();
    expect(lang).toBeGreaterThan(kurz);
  });
});

describe('Umlaute und Sonderzeichen', () => {
  // Helvetica wird als WinAnsi (cp1252) kodiert. Die Zeichen stehen als
  // rohe Bytes im Inhaltsstrom: 'ä' ist 0xE4, '§' ist 0xA7, '€' ist 0x80.
  // Zeichen aus dem Latin-1-Bereich lassen sich deshalb direkt suchen.

  it('schreibt ä, ö, ü, Ä, Ö, Ü und ß in die Datei', async () => {
    const roh = await alsLatin1({
      additionalAgreement:
        'Ärztliche Öffnungszeiten: Übergabe nur nach Absprache. ' +
        'Die Züchterin grüßt aus der Straße in Köln.',
    });
    for (const z of ['ä', 'ö', 'ü', 'Ä', 'Ö', 'Ü', 'ß']) {
      expect(roh.includes(z), `Zeichen ${z} fehlt im PDF`).toBe(true);
    }
  });

  it('schreibt das Euro-Zeichen als WinAnsi-Byte 0x80', async () => {
    expect(await alsLatin1()).toContain('\u0080');
  });

  it('schreibt das Paragrafenzeichen', async () => {
    expect(await alsLatin1()).toContain('\u00a7');
  });

  it('erklärt der Datei die WinAnsi-Kodierung', async () => {
    expect(await alsLatin1()).toContain('WinAnsiEncoding');
  });

  it('nimmt Umlaute in freien Texten mit', async () => {
    const roh = await alsLatin1({
      additionalAgreement: 'Übergabe in Köln, Straße 3. Die Züchterin grüßt.',
    });
    expect(roh).toContain('Übergabe in Köln');
  });
});

describe('Dateiname', () => {
  it('setzt Titel, Betreff und Datum zusammen', () => {
    expect(dateiname('Kaufvertrag', 'Mia', '2026-07-31')).toBe('Kaufvertrag Mia 2026-07-31.pdf');
  });

  it('entfernt Zeichen, die Dateisysteme stören', () => {
    expect(dateiname('Kauf/vertrag', 'Mia: "Sonne"', '2026-07-31')).toBe(
      'Kauf vertrag Mia Sonne 2026-07-31.pdf',
    );
  });

  it('kürzt sehr lange Namen', () => {
    const name = dateiname('Kaufvertrag', 'X'.repeat(300), '2026-07-31');
    expect(name.length).toBeLessThanOrEqual(125);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('behält Umlaute im Namen', () => {
    expect(dateiname('Kaufvertrag', 'Müßiggang', '2026-07-31')).toBe(
      'Kaufvertrag Müßiggang 2026-07-31.pdf',
    );
  });
});

describe('Randfälle beim Satz', () => {
  it('verträgt einen leeren Vertrag ohne Käufer und ohne Tier', async () => {
    const d = baueVertragsPdf(
      rendereVertrag({
        data: { type: 'standard', buyers: [], animals: [], breed: '' },
        seller: { name: '', address: '', clubName: 'Catmaniac' },
      }),
      await leeresDokument(),
    );
    expect(d.getNumberOfPages()).toBeGreaterThan(0);
  });

  it('verträgt neun Käufer, ohne dass Unterschriften verloren gehen', async () => {
    const viele = Array.from({ length: 9 }, (_, i) => ({
      name: `Käufer ${i + 1}`,
      sex: 'male' as const,
      address: 'Musterweg 1, 12345 Musterstadt',
    }));
    const roh = await alsLatin1({ buyers: viele });
    expect(roh).toContain('Käufer 9');
  });

  it('verträgt sehr lange Namen ohne Absturz', async () => {
    const lang = 'Maximiliane Charlotte von und zu Hohenlohe-Schillingsfürst-Waldenburg';
    await expect(
      doc({ buyers: [{ name: lang, sex: 'female', address: `${lang} ${lang}` }] }),
    ).resolves.toBeDefined();
  });

  it('verträgt einen sehr langen Schlussparagrafen mit vielen Zeilen', async () => {
    const text = Array.from({ length: 60 }, (_, i) => `Zeile ${i + 1} der Zusatzvereinbarung.`).join(
      '\n',
    );
    const d = await doc({ additionalAgreement: text });
    expect(d.getNumberOfPages()).toBeGreaterThan(2);
  });
});
