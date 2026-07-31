/**
 * Prüft die Schreibvorgänge gegen eine echte (In-Memory-)Datenbank.
 * Wichtigster Punkt: Der Fahrplan muss auf jede Statusänderung reagieren —
 * eine Kastration, die es nicht mehr geben darf, wäre ein teurer Fehler.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { db, insert, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';
import type { ID, Litter } from '../../types';
import { nowISO, todayISO } from '../../lib/date';
import {
  addBirthEvent,
  addKitten,
  deleteKitten,
  ensureLitterBorn,
  linkInterest,
  markKittenDeceased,
  noonOf,
  revokeKittenDeath,
  toggleTaskDone,
  updateSaleStatus,
} from './data';

const settings = DEFAULT_SETTINGS;

async function makeLitter(over: Partial<Litter> = {}): Promise<Litter> {
  return insert<Litter>(db.litters, {
    motherId: 'mutter',
    status: 'born',
    birthDate: todayISO(),
    ...over,
  });
}

async function neuterTasks(kittenId: ID) {
  return db.careTasks.where('kittenId').equals(kittenId).toArray();
}

beforeEach(async () => {
  await wipeDatabase();
});

describe('ensureLitterBorn', () => {
  it('setzt Geburtsdatum und Status und legt den Fahrplan an', async () => {
    const litter = await makeLitter({ status: 'pregnant', birthDate: undefined });
    expect(await db.careTasks.count()).toBe(0);

    await ensureLitterBorn(litter.id, nowISO(), settings);

    const updated = await db.litters.get(litter.id);
    expect(updated?.status).toBe('born');
    expect(updated?.birthDate).toBe(todayISO());
    expect(await db.careTasks.count()).toBeGreaterThan(0);
  });

  it('überschreibt ein vorhandenes Geburtsdatum nicht', async () => {
    const litter = await makeLitter({ status: 'born', birthDate: '2026-01-05' });
    await ensureLitterBorn(litter.id, nowISO(), settings);
    expect((await db.litters.get(litter.id))?.birthDate).toBe('2026-01-05');
  });
});

describe('addKitten', () => {
  it('macht aus dem Geburtsgewicht die erste Wiegung', async () => {
    const litter = await makeLitter();
    const at = nowISO();
    const kitten = await addKitten(
      { litterId: litter.id, collarColor: 'red', birthWeightG: 95, bornAt: at },
      settings,
    );

    const weights = await db.weights.where('kittenId').equals(kitten.id).toArray();
    expect(weights).toHaveLength(1);
    expect(weights[0].grams).toBe(95);
    expect(weights[0].at).toBe(at);
  });

  it('legt ohne Zeitpunkt keine Wiegung an', async () => {
    const litter = await makeLitter();
    const kitten = await addKitten(
      { litterId: litter.id, collarColor: 'blue', birthWeightG: 95 },
      settings,
    );
    expect(await db.weights.where('kittenId').equals(kitten.id).count()).toBe(0);
  });

  it('führt ein totgeborenes Kitten ohne Wiegung und ohne Aufgaben', async () => {
    const litter = await makeLitter();
    const kitten = await addKitten(
      {
        litterId: litter.id,
        collarColor: 'green',
        birthWeightG: 60,
        bornAt: nowISO(),
        stillborn: true,
      },
      settings,
    );

    expect(kitten.saleStatus).toBe('deceased');
    expect(await db.weights.where('kittenId').equals(kitten.id).count()).toBe(0);
    expect(await neuterTasks(kitten.id)).toHaveLength(0);
  });

  it('plant für ein lebendes Kitten eine Kastration ein', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    const tasks = await neuterTasks(kitten.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe('neuter');
    // Woche 10 nach dem Geburtsdatum.
    expect(tasks[0].dueDate).toBe('2026-05-10');
  });

  it('kommt mit neun Kitten gleichzeitig zurecht', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    for (let i = 0; i < 9; i++) {
      await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    }
    expect(await db.kittens.where('litterId').equals(litter.id).count()).toBe(9);
    expect(await db.careTasks.where('kind').equals('neuter').count()).toBe(9);
  });
});

describe('updateSaleStatus', () => {
  it('nimmt die Kastration bei Zuchtvorbehalt aus dem Fahrplan — und stellt sie zurück', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    expect(await neuterTasks(kitten.id)).toHaveLength(1);

    const withReservation = { ...kitten, saleStatus: 'available' as const };
    await updateSaleStatus(withReservation, 'sold_breeding_reserved', settings);
    expect(await neuterTasks(kitten.id)).toHaveLength(0);

    const current = await db.kittens.get(kitten.id);
    await updateSaleStatus(current!, 'sold', settings);
    expect(await neuterTasks(kitten.id)).toHaveLength(1);
  });

  it('lässt eine bereits erledigte Kastration stehen', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    const task = (await neuterTasks(kitten.id))[0];
    await toggleTaskDone(task.id, true);

    await updateSaleStatus(kitten, 'sold_breeding_reserved', settings);
    const after = await neuterTasks(kitten.id);
    expect(after).toHaveLength(1);
    expect(after[0].doneAt).toBe(todayISO());
  });

  it('tut nichts, wenn der Status gleich bleibt', async () => {
    const litter = await makeLitter();
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    const before = (await db.kittens.get(kitten.id))!.updatedAt;
    await updateSaleStatus(kitten, 'available', settings);
    expect((await db.kittens.get(kitten.id))!.updatedAt).toBe(before);
  });
});

describe('toggleTaskDone', () => {
  it('hakt ab und nimmt das Häkchen wieder weg', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    const task = (await neuterTasks(kitten.id))[0];

    await toggleTaskDone(task.id, true);
    expect((await db.careTasks.get(task.id))?.doneAt).toBe(todayISO());

    await toggleTaskDone(task.id, false);
    expect((await db.careTasks.get(task.id))?.doneAt).toBeUndefined();
  });
});

describe('markKittenDeceased', () => {
  it('vermerkt behutsam und räumt offene Aufgaben ab', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);

    await markKittenDeceased(kitten, '2026-03-04', 'nachts eingeschlafen', settings);

    const after = await db.kittens.get(kitten.id);
    expect(after?.saleStatus).toBe('deceased');
    expect(after?.diedAt).toBe('2026-03-04');
    expect(after?.deathNote).toBe('nachts eingeschlafen');
    expect(await neuterTasks(kitten.id)).toHaveLength(0);
  });

  it('lässt sich wieder aufheben', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    await markKittenDeceased(kitten, '2026-03-04', undefined, settings);

    const dead = (await db.kittens.get(kitten.id))!;
    await revokeKittenDeath(dead, settings);

    const alive = await db.kittens.get(kitten.id);
    expect(alive?.saleStatus).toBe('available');
    expect(alive?.diedAt).toBeUndefined();
    expect(await neuterTasks(kitten.id)).toHaveLength(1);
  });
});

describe('linkInterest', () => {
  it('verknüpft in beide Richtungen und löst die alte Verbindung', async () => {
    const litter = await makeLitter();
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    const a = await insert(db.interests, { name: 'Familie A', wishSex: 'any', status: 'new', sortIndex: 0 });
    const b = await insert(db.interests, { name: 'Familie B', wishSex: 'any', status: 'new', sortIndex: 1 });

    await linkInterest(kitten, a.id);
    expect((await db.kittens.get(kitten.id))?.interestId).toBe(a.id);
    expect((await db.interests.get(a.id))?.kittenId).toBe(kitten.id);

    const linked = (await db.kittens.get(kitten.id))!;
    await linkInterest(linked, b.id);
    expect((await db.interests.get(a.id))?.kittenId).toBeUndefined();
    expect((await db.interests.get(b.id))?.kittenId).toBe(kitten.id);
  });
});

describe('deleteKitten', () => {
  it('räumt Wiegungen, Aufgaben und Protokolleinträge mit ab', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const at = noonOf('2026-03-01');
    const kitten = await addKitten(
      { litterId: litter.id, collarColor: 'red', birthWeightG: 95, bornAt: at },
      settings,
    );
    await addBirthEvent(litter.id, 'kitten_born', { kittenId: kitten.id, at });

    await deleteKitten(kitten, settings);

    expect(await db.kittens.get(kitten.id)).toBeUndefined();
    expect(await db.weights.where('kittenId').equals(kitten.id).count()).toBe(0);
    expect(await neuterTasks(kitten.id)).toHaveLength(0);
    expect(await db.birthEvents.where('litterId').equals(litter.id).count()).toBe(0);
  });
});
