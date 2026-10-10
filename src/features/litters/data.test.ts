/**
 * Prüft die Schreibvorgänge gegen eine echte (In-Memory-)Datenbank.
 * Wichtigster Punkt: Der Fahrplan muss auf jede Statusänderung reagieren —
 * eine Kastration, die es nicht mehr geben darf, wäre ein teurer Fehler.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { db, insert, putAttachment, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';
import type { ID, Litter } from '../../types';
import { nowISO, todayISO } from '../../lib/date';
import {
  addBirthEvent,
  addKitten,
  deleteLitterCascade,
  deleteKitten,
  ensureLitterBorn,
  linkInterest,
  markKittenDeceased,
  noonOf,
  revokeKittenDeath,
  syncBirthWeightEntry,
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
  it('übernimmt ein bestehendes Geburtsgewicht aus alten Sicherungen ohne doppelte Messung', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'gray', birthWeightG: 95, bornAt: '2026-03-01T08:00:00.000Z' }, settings);
    const original = (await db.weights.where('kittenId').equals(kitten.id).toArray())[0];
    await db.weights.update(original.id, { note: undefined });
    await syncBirthWeightEntry(kitten, 95);
    const entries = await db.weights.where('kittenId').equals(kitten.id).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(original.id);
    expect(entries[0].note).toBe('Geburtsgewicht');
  });

  it('zieht auch ein altes unmarkiertes Geburtsgewicht bei einer Datumskorrektur mit', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red', birthWeightG: 95, bornAt: '2026-03-01T08:00:00.000Z' }, settings);
    const original = (await db.weights.where('kittenId').equals(kitten.id).toArray())[0];
    await db.weights.update(original.id, { note: undefined });
    const correctedTime = '2026-03-02T08:00:00.000Z';
    await db.kittens.update(kitten.id, { bornAt: correctedTime });
    await syncBirthWeightEntry({ ...kitten, bornAt: correctedTime }, 95, kitten.bornAt);
    const entries = await db.weights.where('kittenId').equals(kitten.id).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(original.id);
    expect(entries[0].at).toBe(correctedTime);
  });

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

  it('hebt einen Sterbevermerk nicht über einen veralteten Verkaufsstatus auf', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    await markKittenDeceased(kitten, '2026-03-04', 'nachts eingeschlafen', settings);

    // Der Bildschirm könnte noch das lebende Objekt von vor dem Vermerk halten.
    await expect(updateSaleStatus(kitten, 'available', settings)).rejects.toThrow(
      /Sterbevermerk/,
    );

    const after = await db.kittens.get(kitten.id);
    expect(after?.saleStatus).toBe('deceased');
    expect(after?.diedAt).toBe('2026-03-04');
    expect(after?.deathNote).toBe('nachts eingeschlafen');
    expect(await neuterTasks(kitten.id)).toHaveLength(0);
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

  it('behält weitere Kitten desselben Interessenten verknüpft', async () => {
    const litter = await makeLitter();
    const erstes = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    const zweites = await addKitten({ litterId: litter.id, collarColor: 'blue' }, settings);
    const interest = await insert(db.interests, {
      name: 'Familie A',
      wishSex: 'any',
      status: 'reserved',
      sortIndex: 0,
    });

    await linkInterest(erstes, interest.id);
    await db.kittens.update(erstes.id, { saleStatus: 'reserved' });
    await linkInterest(zweites, interest.id);

    expect((await db.kittens.get(erstes.id))?.interestId).toBe(interest.id);
    expect((await db.kittens.get(erstes.id))?.saleStatus).toBe('reserved');
    expect((await db.kittens.get(zweites.id))?.interestId).toBe(interest.id);
    expect((await db.interests.get(interest.id))?.kittenIds).toEqual([erstes.id, zweites.id]);
  });

  it('behält die vorhandene Verbindung bei einer unbekannten Zielkennung', async () => {
    const litter = await makeLitter();
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    const interest = await insert(db.interests, {
      name: 'Familie A',
      wishSex: 'any',
      status: 'new',
      sortIndex: 0,
    });
    await linkInterest(kitten, interest.id);

    await linkInterest((await db.kittens.get(kitten.id))!, 'nicht-mehr-da');

    expect((await db.kittens.get(kitten.id))?.interestId).toBe(interest.id);
    expect((await db.interests.get(interest.id))?.kittenId).toBe(kitten.id);
  });

  it('repariert bei Altständen die fehlende Gegenrichtung', async () => {
    const litter = await makeLitter();
    const interest = await insert(db.interests, {
      name: 'Familie A',
      wishSex: 'any',
      status: 'new',
      sortIndex: 0,
    });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    await db.kittens.update(kitten.id, { interestId: interest.id });

    await linkInterest((await db.kittens.get(kitten.id))!, interest.id);

    expect((await db.interests.get(interest.id))?.kittenIds).toEqual([kitten.id]);
    expect((await db.interests.get(interest.id))?.kittenId).toBe(kitten.id);
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

  it('löscht das Foto und löst historische Verweise, ohne die Historie zu vernichten', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const photo = await putAttachment(new Blob(['foto'], { type: 'image/jpeg' }));
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, settings);
    await db.kittens.update(kitten.id, { photoAttachmentId: photo.id });
    const current = (await db.kittens.get(kitten.id))!;
    const interest = await insert(db.interests, {
      name: 'Familie A',
      wishSex: 'any',
      status: 'reserved',
      sortIndex: 0,
    });
    await linkInterest(current, interest.id);
    const document = await insert(db.documents, {
      kind: 'vaccination_card',
      title: 'Impfpass',
      kittenId: kitten.id,
      litterId: litter.id,
      pageIds: [],
      customerVisible: false,
    });
    const cost = await insert(db.costs, {
      date: '2026-03-02',
      category: 'vet',
      amountCents: 5_000,
      kittenId: kitten.id,
    });
    const appointment = await insert(db.appointments, {
      kind: 'vet',
      startAt: '2026-03-02T10:00:00.000Z',
      kittenIds: [kitten.id],
      remind24h: false,
      remind1h: false,
    });
    const contract = await insert(db.contracts, {
      type: 'standard',
      data: {
        type: 'standard',
        buyers: [],
        animals: [{ kittenId: kitten.id, name: 'Mia', sex: 'female' }],
        breed: 'Russisch Blau',
      },
    });

    await deleteKitten((await db.kittens.get(kitten.id))!, settings);

    expect(await db.attachments.get(photo.id)).toBeUndefined();
    expect((await db.interests.get(interest.id))?.kittenId).toBeUndefined();
    expect((await db.documents.get(document.id))?.kittenId).toBeUndefined();
    expect((await db.costs.get(cost.id))?.kittenId).toBeUndefined();
    expect((await db.appointments.get(appointment.id))?.kittenIds).toBeUndefined();
    expect((await db.contracts.get(contract.id))?.data.animals).toEqual([
      { kittenId: undefined, name: 'Mia', sex: 'female' },
    ]);
  });
});

describe('deleteLitterCascade', () => {
  it('löscht den Wurf atomar und bewahrt historische Datensätze ohne tote Verweise', async () => {
    const litter = await makeLitter({ birthDate: '2026-03-01' });
    const photo = await putAttachment(new Blob(['foto'], { type: 'image/jpeg' }));
    const mia = await addKitten(
      {
        litterId: litter.id,
        collarColor: 'red',
        birthWeightG: 95,
        bornAt: noonOf('2026-03-01'),
      },
      settings,
    );
    const nala = await addKitten({ litterId: litter.id, collarColor: 'blue' }, settings);
    await db.kittens.update(mia.id, { photoAttachmentId: photo.id });
    const interest = await insert(db.interests, {
      name: 'Familie A',
      wishSex: 'any',
      status: 'reserved',
      sortIndex: 0,
    });
    await linkInterest((await db.kittens.get(mia.id))!, interest.id);
    await addBirthEvent(litter.id, 'kitten_born', { kittenId: mia.id });

    const document = await insert(db.documents, {
      kind: 'vaccination_card',
      title: 'Impfpass Mia',
      kittenId: mia.id,
      litterId: litter.id,
      pageIds: [],
      customerVisible: false,
    });
    const cost = await insert(db.costs, {
      date: '2026-03-02',
      category: 'vet',
      amountCents: 5_000,
      litterId: litter.id,
      kittenId: mia.id,
    });
    const revenue = await insert(db.revenues, {
      date: '2026-06-02',
      amountCents: 250_000,
      litterId: litter.id,
      kittenId: mia.id,
    });
    const appointment = await insert(db.appointments, {
      kind: 'vet',
      startAt: '2026-03-02T10:00:00.000Z',
      litterId: litter.id,
      kittenIds: [mia.id, 'anderes-kitten'],
      remind24h: false,
      remind1h: false,
    });
    const contract = await insert(db.contracts, {
      type: 'standard',
      litterId: litter.id,
      data: {
        type: 'standard',
        buyers: [],
        animals: [{ kittenId: mia.id, name: 'Mia', sex: 'female' }],
        breed: 'Russisch Blau',
      },
    });
    const use = await insert(db.breedingUses, {
      contractId: 'anderer-vertrag',
      kittenId: nala.id,
      catName: 'Nala',
      startDate: '2026-07-01',
      months: 18,
      extensionMonths: 6,
      deadlineDate: '2028-01-01',
      stage: 'at_buyer',
      history: [],
    });

    await deleteLitterCascade(litter.id);

    expect(await db.litters.get(litter.id)).toBeUndefined();
    expect(await db.kittens.where('litterId').equals(litter.id).count()).toBe(0);
    expect(await db.weights.where('kittenId').anyOf([mia.id, nala.id]).count()).toBe(0);
    expect(await db.careTasks.where('litterId').equals(litter.id).count()).toBe(0);
    expect(await db.birthEvents.where('litterId').equals(litter.id).count()).toBe(0);
    expect(await db.attachments.get(photo.id)).toBeUndefined();
    expect((await db.interests.get(interest.id))?.kittenId).toBeUndefined();
    expect((await db.documents.get(document.id))?.litterId).toBeUndefined();
    expect((await db.documents.get(document.id))?.kittenId).toBeUndefined();
    expect((await db.costs.get(cost.id))?.litterId).toBeUndefined();
    expect((await db.costs.get(cost.id))?.kittenId).toBeUndefined();
    expect((await db.revenues.get(revenue.id))?.litterId).toBeUndefined();
    expect((await db.revenues.get(revenue.id))?.kittenId).toBeUndefined();
    expect((await db.appointments.get(appointment.id))?.litterId).toBeUndefined();
    expect((await db.appointments.get(appointment.id))?.kittenIds).toEqual([
      'anderes-kitten',
    ]);
    expect((await db.contracts.get(contract.id))?.litterId).toBeUndefined();
    expect((await db.contracts.get(contract.id))?.data.animals).toEqual([
      { kittenId: undefined, name: 'Mia', sex: 'female' },
    ]);
    expect((await db.breedingUses.get(use.id))?.kittenId).toBeUndefined();
  });
});
