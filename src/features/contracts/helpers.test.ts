import { describe, expect, it } from 'vitest';
import { todayISO } from '../../lib/date';
import { DEFAULT_SETTINGS } from '../../types';
import type { ContractData, Interest, Kitten, Litter, Settings } from '../../types';
import {
  artWechseln,
  kaeuferNamen,
  neuerEntwurf,
  tierNamen,
  verkaeuferdatenFehlen,
  vertragUntertitel,
} from './helpers';

const EINSTELLUNGEN: Settings = {
  ...DEFAULT_SETTINGS,
  defaultKittenPriceCents: 250_000,
  seller: {
    name: 'Beispiel Züchterin',
    address: 'Beispielweg 3, 12345 Beispielstadt',
    place: 'Beispielstadt',
    clubName: 'Catmaniac',
  },
};

const KITTEN: Kitten = {
  id: 'k1',
  litterId: 'w1',
  collarColor: 'red',
  callName: 'Mia',
  sex: 'female',
  stillborn: false,
  chipNo: '276093400000001',
  saleStatus: 'reserved',
  priceCents: 260_000,
  createdAt: '2026-03-03T00:00:00Z',
  updatedAt: '2026-03-03T00:00:00Z',
};

const WURF: Litter = {
  id: 'w1',
  motherId: 'm1',
  status: 'born',
  birthDate: '2026-03-03',
  createdAt: '2026-03-03T00:00:00Z',
  updatedAt: '2026-03-03T00:00:00Z',
};

const INTERESSENT: Interest = {
  id: 'i1',
  name: 'Anna Muster',
  city: 'Musterstadt',
  wishSex: 'female',
  status: 'reserved',
  sortIndex: 0,
  offeredPriceCents: 240_000,
  createdAt: '2026-03-03T00:00:00Z',
  updatedAt: '2026-03-03T00:00:00Z',
};

describe('Namen für Listen', () => {
  const data: ContractData = {
    type: 'standard',
    buyers: [{ name: 'Anna' }, { name: 'Ben' }],
    animals: [{ name: 'Mia', sex: 'female' }, { name: 'Nala', sex: 'female' }],
    breed: 'Russisch Blau',
  };

  it('zählt Tiere und Käufer auf', () => {
    expect(tierNamen(data)).toBe('Mia und Nala');
    expect(kaeuferNamen(data)).toBe('Anna und Ben');
  });

  it('sagt klar, wenn nichts eingetragen ist', () => {
    expect(tierNamen({ ...data, animals: [] })).toBe('ohne Tier');
    expect(kaeuferNamen({ ...data, buyers: [{ name: '  ' }] })).toBe('ohne Käufer');
  });

  it('setzt den Untertitel der Vertragsliste zusammen', () => {
    expect(
      vertragUntertitel({
        id: 'c1',
        type: 'standard',
        data,
        createdAt: '2026-03-03T00:00:00Z',
        updatedAt: '2026-03-03T00:00:00Z',
      }),
    ).toBe('Anna und Ben · Mia und Nala');
  });
});

describe('Verkäuferdaten', () => {
  it('erkennt fehlende Angaben', () => {
    expect(verkaeuferdatenFehlen(EINSTELLUNGEN)).toBe(false);
    expect(
      verkaeuferdatenFehlen({ ...EINSTELLUNGEN, seller: { ...EINSTELLUNGEN.seller, name: '  ' } }),
    ).toBe(true);
    expect(
      verkaeuferdatenFehlen({ ...EINSTELLUNGEN, seller: { ...EINSTELLUNGEN.seller, address: '' } }),
    ).toBe(true);
  });
});

describe('Neuer Entwurf', () => {
  it('legt einen leeren Standardvertrag mit Vorgaben an', () => {
    const e = neuerEntwurf('standard', EINSTELLUNGEN);
    expect(e.type).toBe('standard');
    expect(e.breed).toBe('Russisch Blau');
    expect(e.buyers).toHaveLength(1);
    expect(e.animals).toHaveLength(1);
    expect(e.animals[0].sex).toBe('female');
    expect(e.totalPriceCents).toBe(250_000);
    expect(e.handoverPlace).toBe('Beispielstadt');
  });

  it('setzt beim Zuchtnutzungsvertrag alle Fristen auf die Vorgaben', () => {
    const e = neuerEntwurf('breeding_reserved', EINSTELLUNGEN);
    expect(e.breedingUseMonths).toBe(18);
    expect(e.breedingUseExtensionMonths).toBe(6);
    expect(e.handoverDeadlineDays).toBe(3);
    expect(e.matingAttempts).toBe(2);
    expect(e.backPaymentDays).toBe(14);
    expect(e.breedingUseStartDate).toBe(todayISO());
    expect(e.regularPriceCents).toBe(250_000);
  });

  it('übernimmt Kitten samt Wurfdatum und Chipnummer', () => {
    const e = neuerEntwurf('standard', EINSTELLUNGEN, { kitten: KITTEN, litter: WURF });
    expect(e.animals[0]).toMatchObject({
      kittenId: 'k1',
      name: 'Mia',
      sex: 'female',
      birthDate: '2026-03-03',
      chipNo: '276093400000001',
    });
    // Der Preis am Kitten schlägt die Vorgabe aus den Einstellungen.
    expect(e.totalPriceCents).toBe(260_000);
  });

  it('nimmt bei unbekanntem Geschlecht „Katze" an', () => {
    const e = neuerEntwurf('standard', EINSTELLUNGEN, {
      kitten: { ...KITTEN, sex: 'unknown', callName: undefined },
    });
    expect(e.animals[0].sex).toBe('female');
    // Ohne Rufname greift die Halsbandfarbe.
    expect(e.animals[0].name).toBe('Rot');
  });

  it('übernimmt den Interessenten als Käufer', () => {
    const e = neuerEntwurf('standard', EINSTELLUNGEN, { interest: INTERESSENT });
    expect(e.buyers[0].name).toBe('Anna Muster');
    expect(e.buyers[0].sex).toBeUndefined();
    expect(e.totalPriceCents).toBe(240_000);
  });
});

describe('Vertragsart wechseln', () => {
  it('behält Käufer, Tiere und Zusatztext', () => {
    const vorher = neuerEntwurf('standard', EINSTELLUNGEN, { kitten: KITTEN, litter: WURF });
    const mitText = { ...vorher, additionalAgreement: 'Abholung erst im Juli.' };
    const nachher = artWechseln(mitText, 'breeding_reserved', EINSTELLUNGEN);

    expect(nachher.type).toBe('breeding_reserved');
    expect(nachher.animals[0].name).toBe('Mia');
    expect(nachher.additionalAgreement).toBe('Abholung erst im Juli.');
  });

  it('nimmt den eingetippten Preis mit in die andere Vertragsart', () => {
    const standard: ContractData = {
      type: 'standard',
      buyers: [],
      animals: [],
      breed: 'Russisch Blau',
      totalPriceCents: 190_000,
    };
    const zucht = artWechseln(standard, 'breeding_reserved', EINSTELLUNGEN);
    expect(zucht.regularPriceCents).toBe(190_000);

    const zurueck = artWechseln(
      { ...zucht, totalPriceCents: undefined, regularPriceCents: 210_000 },
      'standard',
      EINSTELLUNGEN,
    );
    expect(zurueck.totalPriceCents).toBe(210_000);
  });

  it('füllt fehlende Fristfelder mit den Vorgaben auf', () => {
    const standard: ContractData = {
      type: 'standard',
      buyers: [],
      animals: [],
      breed: 'Russisch Blau',
    };
    const zucht = artWechseln(standard, 'breeding_reserved', EINSTELLUNGEN);
    expect(zucht.breedingUseMonths).toBe(18);
    expect(zucht.backPaymentDays).toBe(14);
    expect(zucht.breedingUseStartDate).toBe(todayISO());
  });

  it('lässt bereits geänderte Fristen unangetastet', () => {
    const zucht = { ...neuerEntwurf('breeding_reserved', EINSTELLUNGEN), breedingUseMonths: 24 };
    const standard = artWechseln(zucht, 'standard', EINSTELLUNGEN);
    const wiederZucht = artWechseln(standard, 'breeding_reserved', EINSTELLUNGEN);
    expect(wiederZucht.breedingUseMonths).toBe(24);
  });
});
