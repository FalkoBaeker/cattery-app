import { beforeEach, describe, expect, it } from 'vitest';
import { db, insert, wipeDatabase } from '../../db/db';
import { addDays, dateOf, fromLocalInputValue, todayISO } from '../../lib/date';
import type { BreedingUse, Contract, ContractData } from '../../types';
import { BREEDING_USE_STAGE_ORDER } from '../../types';
import {
  beiUns,
  deadlineVon,
  fristbeginnSetzen,
  fristVerlaengern,
  istBeendet,
  naechsteStufe,
  stufeSetzen,
  stufenIndex,
  verlaufDatumSetzen,
  verlaufsnotizHinzufuegen,
  vorgangAnlegen,
  vorgangAusVertragAktualisieren,
  vorgangZuVertrag,
  zuchtnutzungErfuellt,
} from './breedingUse';

/* ------------------------------------------------------------------ */
/*  Reine Logik                                                        */
/* ------------------------------------------------------------------ */

describe('Statuskette', () => {
  it('läuft in der Reihenfolge der Anforderungen', () => {
    expect(BREEDING_USE_STAGE_ORDER).toEqual([
      'at_buyer',
      'requested',
      'with_us',
      'mated',
      'pregnant',
      'littered',
      'neutered',
      'ownership_transferred',
      'closed',
    ]);
  });

  it('kennt den nächsten Schritt', () => {
    expect(naechsteStufe('at_buyer')).toBe('requested');
    expect(naechsteStufe('littered')).toBe('neutered');
    expect(naechsteStufe('closed')).toBeNull();
    expect(naechsteStufe('cancelled')).toBeNull();
  });

  it('stellt „abgebrochen" außerhalb der Kette', () => {
    expect(stufenIndex('cancelled')).toBe(-1);
    expect(istBeendet('cancelled')).toBe(true);
    expect(istBeendet('closed')).toBe(true);
    expect(istBeendet('mated')).toBe(false);
  });

  it('weiß, wann die Katze bei uns ist', () => {
    expect(beiUns('at_buyer')).toBe(false);
    expect(beiUns('requested')).toBe(false);
    expect(beiUns('with_us')).toBe(true);
    expect(beiUns('littered')).toBe(true);
    expect(beiUns('neutered')).toBe(false);
  });

  it('gilt ab dem Wurf als erfüllt', () => {
    expect(zuchtnutzungErfuellt('mated')).toBe(false);
    expect(zuchtnutzungErfuellt('littered')).toBe(true);
    expect(zuchtnutzungErfuellt('closed')).toBe(true);
  });
});

describe('Fristberechnung am Vorgang', () => {
  const basis = {
    startDate: '2026-06-01',
    months: 18,
    extensionMonths: 6,
  };

  it('18 Monate ohne Verlängerung', () => {
    expect(deadlineVon(basis)).toBe('2027-12-01');
  });

  it('mit Verlängerung 24 Monate', () => {
    expect(deadlineVon({ ...basis, extendedAt: '2027-10-01' })).toBe('2028-06-01');
  });

  it('Monatsende bleibt Monatsende', () => {
    expect(deadlineVon({ startDate: '2026-08-31', months: 18, extensionMonths: 6 })).toBe(
      '2028-02-29',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Datenbank                                                          */
/* ------------------------------------------------------------------ */

async function vertragAnlegen(over: Partial<ContractData> = {}): Promise<Contract> {
  const data: ContractData = {
    type: 'breeding_reserved',
    buyers: [{ name: 'Anna Muster', sex: 'female' }],
    animals: [{ name: 'Mia', sex: 'female', chipNo: '276093400000001' }],
    breed: 'Russisch Blau',
    regularPriceCents: 250_000,
    discountCents: 138_000,
    breedingUseStartDate: '2026-06-01',
    breedingUseMonths: 18,
    breedingUseExtensionMonths: 6,
    ...over,
  };
  return insert(db.contracts, { type: data.type, data });
}

describe('Vorgang anlegen', () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it('entsteht automatisch aus einem Vertrag B', async () => {
    const vertrag = await vertragAnlegen();
    const vorgang = await vorgangAnlegen(vertrag);
    expect(vorgang).not.toBeNull();
    expect(vorgang?.catName).toBe('Mia');
    expect(vorgang?.stage).toBe('at_buyer');
    expect(vorgang?.startDate).toBe('2026-06-01');
    expect(vorgang?.deadlineDate).toBe('2027-12-01');
    expect(vorgang?.history).toHaveLength(1);
  });

  it('entsteht nicht aus einem Standardvertrag', async () => {
    const vertrag = await insert(db.contracts, {
      type: 'standard',
      data: { type: 'standard', buyers: [], animals: [], breed: 'Russisch Blau' },
    });
    expect(await vorgangAnlegen(vertrag)).toBeNull();
  });

  it('wird nicht doppelt angelegt', async () => {
    const vertrag = await vertragAnlegen();
    const a = await vorgangAnlegen(vertrag);
    const b = await vorgangAnlegen(vertrag);
    expect(a?.id).toBe(b?.id);
    expect(await db.breedingUses.count()).toBe(1);
  });

  it('nimmt ohne Überlassungsdatum den heutigen Tag', async () => {
    const vertrag = await vertragAnlegen({ breedingUseStartDate: undefined });
    const vorgang = await vorgangAnlegen(vertrag);
    expect(vorgang?.startDate).toBe(todayISO());
  });

  it('nimmt auch ohne Rufnamen einen sinnvollen Namen', async () => {
    const vertrag = await vertragAnlegen({ animals: [{ name: '  ', sex: 'female' }] });
    const vorgang = await vorgangAnlegen(vertrag);
    expect(vorgang?.catName).toBe('Katze');
  });
});

describe('Vorgang und Vertrag im Gleichklang', () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it('übernimmt Änderungen, solange nichts passiert ist', async () => {
    const vertrag = await vertragAnlegen();
    await vorgangAnlegen(vertrag);

    const geaendert: Contract = {
      ...vertrag,
      data: { ...vertrag.data, breedingUseStartDate: '2026-07-15', breedingUseMonths: 24 },
    };
    await vorgangAusVertragAktualisieren(geaendert);

    const vorgang = await vorgangZuVertrag(vertrag.id);
    expect(vorgang?.startDate).toBe('2026-07-15');
    expect(vorgang?.months).toBe(24);
    expect(vorgang?.deadlineDate).toBe('2028-07-15');
  });

  it('rührt einen laufenden Vorgang nicht mehr an', async () => {
    const vertrag = await vertragAnlegen();
    const vorgang = (await vorgangAnlegen(vertrag)) as BreedingUse;
    await stufeSetzen(vorgang, 'requested');

    const geaendert: Contract = {
      ...vertrag,
      data: { ...vertrag.data, breedingUseStartDate: '2026-07-15' },
    };
    await vorgangAusVertragAktualisieren(geaendert);

    const nachher = await vorgangZuVertrag(vertrag.id);
    expect(nachher?.startDate).toBe('2026-06-01');
  });
});

describe('Verlauf und Verlängerung', () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it('schreibt jeden Statuswechsel mit Zeitstempel in den Verlauf', async () => {
    const vertrag = await vertragAnlegen();
    let vorgang = (await vorgangAnlegen(vertrag)) as BreedingUse;

    await stufeSetzen(vorgang, 'requested', 'Anzeige verschickt');
    vorgang = (await db.breedingUses.get(vorgang.id)) as BreedingUse;
    await stufeSetzen(vorgang, 'with_us');
    vorgang = (await db.breedingUses.get(vorgang.id)) as BreedingUse;

    expect(vorgang.stage).toBe('with_us');
    expect(vorgang.history.map((h) => h.stage)).toEqual(['at_buyer', 'requested', 'with_us']);
    expect(vorgang.history[1].note).toBe('Anzeige verschickt');
    for (const eintrag of vorgang.history) {
      expect(eintrag.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('stores historical stages and corrections without changing the latest logical stage', async () => {
    let use = (await vorgangAnlegen(await vertragAnlegen())) as BreedingUse;
    const historical = fromLocalInputValue(`${addDays(todayISO(), -10)}T11:00`);
    await stufeSetzen(use, 'neutered', undefined, historical);
    use = (await db.breedingUses.get(use.id)) as BreedingUse;
    expect(use.stage).toBe('neutered');
    expect(use.history.at(-1)?.at).toBe(historical);
    await stufeSetzen(use, 'ownership_transferred');
    use = (await db.breedingUses.get(use.id)) as BreedingUse;
    const correction = fromLocalInputValue(`${addDays(todayISO(), -15)}T10:00`);
    await verlaufDatumSetzen(use, 1, correction);
    const stored = (await db.breedingUses.get(use.id)) as BreedingUse;
    expect(stored.stage).toBe('ownership_transferred');
    expect(stored.history.map((entry) => entry.stage)).toEqual(['at_buyer', 'neutered', 'ownership_transferred']);
    expect(stored.history[1].at).toBe(correction);
  });

  it('validates event timestamps before stage, extension, note, and correction writes', async () => {
    const use = (await vorgangAnlegen(await vertragAnlegen())) as BreedingUse;
    const future = fromLocalInputValue(`${addDays(todayISO(), 1)}T12:00`);
    for (const at of [future, 'invalid', '2026-02-30T12:00:00.000Z']) {
      await expect(stufeSetzen(use, 'neutered', undefined, at)).rejects.toThrow();
      await expect(fristVerlaengern(use, at)).rejects.toThrow();
      await expect(verlaufsnotizHinzufuegen(use, 'Notiz', at)).rejects.toThrow();
      await expect(verlaufDatumSetzen(use, 0, at)).rejects.toThrow();
    }
    expect(await db.breedingUses.get(use.id)).toEqual(use);
  });

  it('records and corrects the actual extension date without changing the deadline or stage', async () => {
    let use = (await vorgangAnlegen(await vertragAnlegen())) as BreedingUse;
    const at = fromLocalInputValue(`${addDays(todayISO(), -4)}T10:00`);
    await fristVerlaengern(use, at);
    use = (await db.breedingUses.get(use.id)) as BreedingUse;
    expect(use.extendedAt).toBe(dateOf(at));
    const correctedAt = fromLocalInputValue(`${addDays(todayISO(), -8)}T11:00`);
    await verlaufDatumSetzen(use, 1, correctedAt);
    const stored = (await db.breedingUses.get(use.id)) as BreedingUse;
    expect(stored.extendedAt).toBe(dateOf(correctedAt));
    expect(stored.deadlineDate).toBe(use.deadlineDate);
    expect(stored.stage).toBe(use.stage);
  });

  it('verlängert einmalig und merkt sich das', async () => {
    const vertrag = await vertragAnlegen();
    let vorgang = (await vorgangAnlegen(vertrag)) as BreedingUse;

    await fristVerlaengern(vorgang);
    vorgang = (await db.breedingUses.get(vorgang.id)) as BreedingUse;
    expect(vorgang.deadlineDate).toBe('2028-06-01');
    expect(vorgang.extendedAt).toBe(todayISO());
    expect(vorgang.history.at(-1)?.note).toMatch(/6 Monate verlängert/);

    // Ein zweiter Versuch ändert nichts mehr.
    await fristVerlaengern(vorgang);
    const nochmal = (await db.breedingUses.get(vorgang.id)) as BreedingUse;
    expect(nochmal.deadlineDate).toBe('2028-06-01');
    expect(nochmal.history).toHaveLength(vorgang.history.length);
  });

  it('rechnet die Frist neu, wenn der Fristbeginn korrigiert wird', async () => {
    const vertrag = await vertragAnlegen();
    const vorgang = (await vorgangAnlegen(vertrag)) as BreedingUse;
    await fristbeginnSetzen(vorgang, '2026-08-31');
    const nachher = (await db.breedingUses.get(vorgang.id)) as BreedingUse;
    expect(nachher.deadlineDate).toBe('2028-02-29');
  });

  it('behält die Verlängerung, wenn der Fristbeginn korrigiert wird', async () => {
    const vertrag = await vertragAnlegen();
    let vorgang = (await vorgangAnlegen(vertrag)) as BreedingUse;
    await fristVerlaengern(vorgang);
    vorgang = (await db.breedingUses.get(vorgang.id)) as BreedingUse;
    await fristbeginnSetzen(vorgang, '2026-07-01');
    const nachher = (await db.breedingUses.get(vorgang.id)) as BreedingUse;
    expect(nachher.deadlineDate).toBe('2028-07-01');
  });
});
