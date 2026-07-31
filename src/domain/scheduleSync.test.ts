/**
 * Abgleich des Fahrplans gegen die echte Datenbank.
 *
 * `planCareTasks` ist an anderer Stelle rein getestet — hier geht es um das,
 * was beim Speichern passiert: Anlegen, Verschieben, Entfernen und vor allem
 * das Schonen bereits erledigter Punkte.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { db, insert, wipeDatabase } from '../db/db';
import { DEFAULT_SETTINGS, type ID, type Kitten, type KittenSaleStatus } from '../types';
import { syncLitterSchedule } from './schedule';

const settings = DEFAULT_SETTINGS;

async function makeLitter(birthDate?: string): Promise<ID> {
  const mother = await insert(db.cats, {
    callName: 'Mira',
    sex: 'female',
    breed: 'Russisch Blau',
    status: 'active',
    isOwn: true,
  });
  const litter = await insert(db.litters, {
    motherId: mother.id,
    birthDate,
    status: birthDate ? 'born' : 'planned',
  });
  return litter.id;
}

async function addKitten(
  litterId: ID,
  over: Partial<Kitten> = {},
): Promise<Kitten> {
  return insert(db.kittens, {
    litterId,
    collarColor: over.collarColor ?? 'red',
    sex: over.sex ?? 'unknown',
    stillborn: over.stillborn ?? false,
    saleStatus: over.saleStatus ?? 'available',
    ...over,
  } as Omit<Kitten, 'id' | 'createdAt' | 'updatedAt'>);
}

async function keys(litterId: ID): Promise<string[]> {
  const tasks = await db.careTasks.where('litterId').equals(litterId).toArray();
  return tasks.map((t) => t.planKey ?? '').sort();
}

/** `planKey` ist nur zusammengesetzt indiziert — hier reicht Filtern. */
async function findByPlanKey(litterId: ID, planKey: string) {
  const tasks = await db.careTasks.where('litterId').equals(litterId).toArray();
  return tasks.find((t) => t.planKey === planKey);
}

beforeEach(async () => {
  await wipeDatabase();
});

describe('syncLitterSchedule', () => {
  it('legt den vollständigen Fahrplan an', async () => {
    const litterId = await makeLitter('2026-03-03');
    await addKitten(litterId, { id: 'k1' });

    await syncLitterSchedule(litterId, settings);

    expect(await keys(litterId)).toEqual([
      'chip',
      'deworming:1',
      'deworming:2',
      'deworming:3',
      'handover_allowed',
      'litter_registration',
      'neuter:k1',
      'vaccination:1',
      'vaccination:2',
    ]);
  });

  it('erzeugt ohne Geburtsdatum nichts', async () => {
    const litterId = await makeLitter(undefined);
    await addKitten(litterId);

    await syncLitterSchedule(litterId, settings);

    expect(await keys(litterId)).toEqual([]);
  });

  it('ist mehrfach aufrufbar, ohne zu verdoppeln', async () => {
    const litterId = await makeLitter('2026-03-03');
    await addKitten(litterId, { id: 'k1' });

    await syncLitterSchedule(litterId, settings);
    await syncLitterSchedule(litterId, settings);
    await syncLitterSchedule(litterId, settings);

    expect(await db.careTasks.where('litterId').equals(litterId).count()).toBe(9);
  });

  it('verschiebt Fälligkeiten, wenn das Geburtsdatum korrigiert wird', async () => {
    const litterId = await makeLitter('2026-03-03');
    await addKitten(litterId, { id: 'k1' });
    await syncLitterSchedule(litterId, settings);

    await db.litters.update(litterId, { birthDate: '2026-03-10' });
    await syncLitterSchedule(litterId, settings);

    const tasks = await db.careTasks.where('litterId').equals(litterId).toArray();
    const dew1 = tasks.find((t) => t.planKey === 'deworming:1');
    expect(dew1?.dueDate).toBe('2026-04-07'); // 10.03. + 4 Wochen
  });

  it('entfernt die Kastration, sobald ein Kitten unter Zuchtvorbehalt geht', async () => {
    const litterId = await makeLitter('2026-03-03');
    await addKitten(litterId, { id: 'k1' });
    await addKitten(litterId, { id: 'k2', collarColor: 'blue' });
    await syncLitterSchedule(litterId, settings);
    expect(await keys(litterId)).toContain('neuter:k2');

    await db.kittens.update('k2', {
      saleStatus: 'sold_breeding_reserved' satisfies KittenSaleStatus,
    });
    await syncLitterSchedule(litterId, settings);

    const after = await keys(litterId);
    expect(after).toContain('neuter:k1');
    expect(after).not.toContain('neuter:k2');
  });

  it('lässt eine bereits erledigte Aufgabe stehen, auch wenn sie aus dem Plan fällt', async () => {
    const litterId = await makeLitter('2026-03-03');
    await addKitten(litterId, { id: 'k1' });
    await syncLitterSchedule(litterId, settings);

    const neuter = await findByPlanKey(litterId, 'neuter:k1');
    await db.careTasks.update(neuter!.id, { doneAt: '2026-05-12' });

    // Nachträglich auf Zuchtvorbehalt umstellen: der Punkt gehört nicht mehr
    // zum Plan — aber er ist bereits geschehen und darf nicht verschwinden.
    await db.kittens.update('k1', { saleStatus: 'sold_breeding_reserved' });
    await syncLitterSchedule(litterId, settings);

    expect(await keys(litterId)).toContain('neuter:k1');
  });

  it('rührt die Fälligkeit einer erledigten Aufgabe nicht mehr an', async () => {
    const litterId = await makeLitter('2026-03-03');
    await addKitten(litterId, { id: 'k1' });
    await syncLitterSchedule(litterId, settings);

    const dew = await findByPlanKey(litterId, 'deworming:1');
    await db.careTasks.update(dew!.id, { doneAt: '2026-03-30' });

    await db.litters.update(litterId, { birthDate: '2026-03-10' });
    await syncLitterSchedule(litterId, settings);

    const after = await db.careTasks.get(dew!.id);
    expect(after?.dueDate).toBe('2026-03-31'); // unverändert
    expect(after?.doneAt).toBe('2026-03-30');
  });

  it('ergänzt die Kastration für ein nachträglich angelegtes Kitten', async () => {
    const litterId = await makeLitter('2026-03-03');
    await addKitten(litterId, { id: 'k1' });
    await syncLitterSchedule(litterId, settings);

    await addKitten(litterId, { id: 'k2', collarColor: 'green' });
    await syncLitterSchedule(litterId, settings);

    expect(await keys(litterId)).toContain('neuter:k2');
  });

  it('plant für totgeborene Kitten keine Kastration', async () => {
    const litterId = await makeLitter('2026-03-03');
    await addKitten(litterId, { id: 'lebend' });
    await addKitten(litterId, { id: 'tot', collarColor: 'blue', stillborn: true });

    await syncLitterSchedule(litterId, settings);

    const after = await keys(litterId);
    expect(after).toContain('neuter:lebend');
    expect(after).not.toContain('neuter:tot');
  });

  it('bricht bei einem unbekannten Wurf still ab, statt zu werfen', async () => {
    await expect(syncLitterSchedule('gibtesnicht', settings)).resolves.toBeUndefined();
    expect(await db.careTasks.count()).toBe(0);
  });

  it('folgt geänderten Wochen aus den Einstellungen', async () => {
    const litterId = await makeLitter('2026-03-03');
    await addKitten(litterId, { id: 'k1' });
    await syncLitterSchedule(litterId, settings);

    const eigene = {
      ...settings,
      schedule: { ...settings.schedule, dewormingWeeks: [3, 5], vaccinationWeeks: [9, 13] },
    };
    await syncLitterSchedule(litterId, eigene);

    const after = await keys(litterId);
    expect(after).toContain('deworming:1');
    expect(after).toContain('deworming:2');
    expect(after).not.toContain('deworming:3');

    const tasks = await db.careTasks.where('litterId').equals(litterId).toArray();
    expect(tasks.find((t) => t.planKey === 'deworming:1')?.dueDate).toBe('2026-03-24');
    expect(tasks.find((t) => t.planKey === 'vaccination:2')?.dueDate).toBe('2026-06-02');
  });
});
