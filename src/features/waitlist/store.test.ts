/**
 * Tests der Schreibwege, die sich nicht rein rechnerisch prüfen lassen:
 * die Verzahnung mit dem Kitten-Verkaufsstatus, der Papierkorb und der
 * Fortschritt der Sammelnachricht in der Datenbank.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { db, insert, wipeDatabase } from '../../db/db';
import type { Interest, Kitten } from '../../types';
import {
  addContactNote,
  applySortUpdates,
  clearBroadcastRun,
  createInterest,
  loadBroadcastRun,
  purgeExpiredTrash,
  purgeInterest,
  restoreInterest,
  saleStatusFor,
  saveBroadcastRun,
  setInterestStatus,
  setReservedKitten,
  trashInterest,
} from './store';
import { moveAndResequence, sortWaitlist, type BroadcastRun } from './order';

const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

async function makeKitten(overrides: Partial<Kitten> = {}): Promise<Kitten> {
  return insert(db.kittens, {
    litterId: 'wurf-1',
    collarColor: 'red',
    sex: 'female',
    stillborn: false,
    saleStatus: 'available',
    ...overrides,
  } as Omit<Kitten, 'id' | 'createdAt' | 'updatedAt'>);
}

beforeEach(async () => {
  await wipeDatabase();
});

/* ================================================================== */
/*  Anlegen und Reihenfolge                                            */
/* ================================================================== */

describe('createInterest', () => {
  it('setzt die Vorgaben und hängt unten an', async () => {
    const a = await createInterest({ name: '  Anna  ' });
    const b = await createInterest({ name: 'Bernd' });

    expect(a.name).toBe('Anna');
    expect(a.source).toBe('Homepage');
    expect(a.wishSex).toBe('any');
    expect(a.status).toBe('new');
    expect(a.sortIndex).toBe(0);
    expect(b.sortIndex).toBe(1);
  });

  it('speichert leere Felder gar nicht erst', async () => {
    const a = await createInterest({ name: 'Anna', phone: '   ', email: '' });
    expect(a.phone).toBeUndefined();
    expect(a.email).toBeUndefined();
  });

  it('zählt gelöschte Einträge nicht mit', async () => {
    const a = await createInterest({ name: 'Anna' });
    await createInterest({ name: 'Bernd' });
    await trashInterest(a.id);
    const c = await createInterest({ name: 'Clara' });
    // Anna liegt im Papierkorb, also ist Bernd (1) der letzte aktive.
    expect(c.sortIndex).toBe(2);
  });
});

describe('applySortUpdates', () => {
  it('schreibt die neue Reihenfolge in die Datenbank', async () => {
    await createInterest({ name: 'A' });
    await createInterest({ name: 'B' });
    await createInterest({ name: 'C' });

    const before = sortWaitlist(await db.interests.toArray());
    await applySortUpdates(moveAndResequence(before, 2, 0));

    const after = sortWaitlist(await db.interests.toArray());
    expect(after.map((i) => i.name)).toEqual(['C', 'A', 'B']);
    expect(after.map((i) => i.sortIndex)).toEqual([0, 1, 2]);
  });

  it('schreibt nichts, wenn sich nichts ändert', async () => {
    const a = await createInterest({ name: 'A' });
    const stamp = (await db.interests.get(a.id))?.updatedAt;
    await applySortUpdates([]);
    expect((await db.interests.get(a.id))?.updatedAt).toBe(stamp);
  });
});

/* ================================================================== */
/*  Status und Kitten                                                  */
/* ================================================================== */

describe('saleStatusFor', () => {
  it('spiegelt Reservierung und Abholung', () => {
    expect(saleStatusFor('reserved', 'available')).toBe('reserved');
    expect(saleStatusFor('completed', 'reserved')).toBe('sold');
    expect(saleStatusFor('declined', 'reserved')).toBe('available');
  });

  it('rührt den Zuchtvorbehalt niemals an — daran hängt die Kastration', () => {
    expect(saleStatusFor('completed', 'sold_breeding_reserved')).toBe('sold_breeding_reserved');
    expect(saleStatusFor('declined', 'sold_breeding_reserved')).toBe('sold_breeding_reserved');
  });

  it('lässt „bleibt bei uns" und „verstorben" unangetastet', () => {
    expect(saleStatusFor('reserved', 'kept')).toBe('kept');
    expect(saleStatusFor('reserved', 'deceased')).toBe('deceased');
  });

  it('ändert bei den frühen Status nichts', () => {
    expect(saleStatusFor('new', 'available')).toBe('available');
    expect(saleStatusFor('contacted', 'available')).toBe('available');
    expect(saleStatusFor('shortlisted', 'available')).toBe('available');
  });
});

describe('setReservedKitten', () => {
  it('verknüpft in beide Richtungen und führt den Verkaufsstatus mit', async () => {
    const interest = await createInterest({ name: 'Anna' });
    await setInterestStatus(interest, 'reserved');
    const reserved = (await db.interests.get(interest.id)) as Interest;
    const kitten = await makeKitten();

    await setReservedKitten(reserved, kitten.id);

    expect((await db.interests.get(interest.id))?.kittenId).toBe(kitten.id);
    const after = await db.kittens.get(kitten.id);
    expect(after?.interestId).toBe(interest.id);
    expect(after?.saleStatus).toBe('reserved');
  });

  it('gibt das vorherige Kitten wieder frei', async () => {
    const interest = await createInterest({ name: 'Anna' });
    await setInterestStatus(interest, 'reserved');
    const current = (await db.interests.get(interest.id)) as Interest;

    const first = await makeKitten({ collarColor: 'red' });
    await setReservedKitten(current, first.id);

    const withFirst = (await db.interests.get(interest.id)) as Interest;
    const second = await makeKitten({ collarColor: 'blue' });
    await setReservedKitten(withFirst, second.id);

    expect((await db.kittens.get(first.id))?.saleStatus).toBe('available');
    expect((await db.kittens.get(first.id))?.interestId).toBeUndefined();
    expect((await db.kittens.get(second.id))?.saleStatus).toBe('reserved');
  });

  it('löst die Verknüpfung ganz', async () => {
    const interest = await createInterest({ name: 'Anna' });
    await setInterestStatus(interest, 'reserved');
    const current = (await db.interests.get(interest.id)) as Interest;
    const kitten = await makeKitten();
    await setReservedKitten(current, kitten.id);

    const linked = (await db.interests.get(interest.id)) as Interest;
    await setReservedKitten(linked, undefined);

    expect((await db.interests.get(interest.id))?.kittenId).toBeUndefined();
    expect((await db.kittens.get(kitten.id))?.saleStatus).toBe('available');
  });
});

describe('setInterestStatus', () => {
  it('macht aus „Abgeholt" ein verkauftes Kitten', async () => {
    const interest = await createInterest({ name: 'Anna' });
    await setInterestStatus(interest, 'reserved');
    const reserved = (await db.interests.get(interest.id)) as Interest;
    const kitten = await makeKitten();
    await setReservedKitten(reserved, kitten.id);

    const linked = (await db.interests.get(interest.id)) as Interest;
    await setInterestStatus(linked, 'completed');

    expect((await db.kittens.get(kitten.id))?.saleStatus).toBe('sold');
  });

  it('lässt ein Kitten mit Zuchtvorbehalt in Ruhe', async () => {
    const interest = await createInterest({ name: 'Anna' });
    const kitten = await makeKitten({ saleStatus: 'sold_breeding_reserved' });
    await setReservedKitten(interest, kitten.id);

    const linked = (await db.interests.get(interest.id)) as Interest;
    await setInterestStatus(linked, 'completed');

    expect((await db.kittens.get(kitten.id))?.saleStatus).toBe('sold_breeding_reserved');
  });

  it('legt eine Absage in den Papierkorb und gibt das Kitten frei', async () => {
    const interest = await createInterest({ name: 'Anna' });
    await setInterestStatus(interest, 'reserved');
    const reserved = (await db.interests.get(interest.id)) as Interest;
    const kitten = await makeKitten();
    await setReservedKitten(reserved, kitten.id);

    const linked = (await db.interests.get(interest.id)) as Interest;
    await setInterestStatus(linked, 'declined');

    const after = await db.interests.get(interest.id);
    expect(after?.status).toBe('declined');
    expect(after?.deletedAt).toBeTruthy();
    expect(after?.kittenId).toBeUndefined();
    expect((await db.kittens.get(kitten.id))?.saleStatus).toBe('available');
  });

  /**
   * Die Oberfläche bietet über die Statuskette ausdrücklich einen Weg aus der
   * Absage heraus. Bleibt `deletedAt` dabei stehen, verschwindet der Eintrag
   * trotzdem aus der Liste und wird nach 30 Tagen endgültig gelöscht.
   */
  it('holt einen Eintrag aus dem Papierkorb, sobald der Status wieder wechselt', async () => {
    const interest = await createInterest({ name: 'Anna' });
    await setInterestStatus(interest, 'declined');
    const declined = (await db.interests.get(interest.id)) as Interest;
    expect(declined.deletedAt).toBeTruthy();

    await setInterestStatus(declined, 'contacted');

    const after = await db.interests.get(interest.id);
    expect(after?.status).toBe('contacted');
    expect(after?.deletedAt).toBeUndefined();
  });

  it('lässt einen nie abgesagten Eintrag beim Statuswechsel unangetastet', async () => {
    const interest = await createInterest({ name: 'Bea' });
    await setInterestStatus(interest, 'shortlisted');
    const after = await db.interests.get(interest.id);
    expect(after?.deletedAt).toBeUndefined();
  });
});

/* ================================================================== */
/*  Papierkorb                                                         */
/* ================================================================== */

describe('Papierkorb', () => {
  it('holt einen Eintrag zurück und stellt ihn ans Ende', async () => {
    const a = await createInterest({ name: 'A' });
    await createInterest({ name: 'B' });
    await createInterest({ name: 'C' });

    await trashInterest(a.id);
    await restoreInterest(a.id);

    const list = sortWaitlist((await db.interests.toArray()).filter((i) => !i.deletedAt));
    expect(list.map((i) => i.name)).toEqual(['B', 'C', 'A']);
    expect((await db.interests.get(a.id))?.deletedAt).toBeUndefined();
  });

  it('löscht beim endgültigen Löschen auch den Verlauf', async () => {
    const a = await createInterest({ name: 'Anna' });
    await addContactNote(a.id, 'call', 'Erstes Telefonat');
    await addContactNote(a.id, 'email', 'Fragebogen geschickt');

    await purgeInterest(a.id);

    expect(await db.interests.get(a.id)).toBeUndefined();
    expect(await db.interestNotes.where('interestId').equals(a.id).count()).toBe(0);
  });

  it('entfernt den Verweis aus Terminen, damit nichts ins Leere zeigt', async () => {
    const a = await createInterest({ name: 'Anna' });
    const appointment = await insert(db.appointments, {
      kind: 'meet_breeder',
      startAt: '2026-04-01T14:00:00.000Z',
      interestId: a.id,
      remind24h: true,
      remind1h: true,
    });

    await purgeInterest(a.id);

    expect((await db.appointments.get(appointment.id))?.interestId).toBeUndefined();
  });

  it('räumt nur auf, was älter als 30 Tage ist', async () => {
    const alt = await createInterest({ name: 'Alt' });
    const frisch = await createInterest({ name: 'Frisch' });
    const aktiv = await createInterest({ name: 'Aktiv' });

    await db.interests.update(alt.id, { deletedAt: daysAgo(40) });
    await db.interests.update(frisch.id, { deletedAt: daysAgo(3) });

    const removed = await purgeExpiredTrash();

    expect(removed).toBe(1);
    expect(await db.interests.get(alt.id)).toBeUndefined();
    expect(await db.interests.get(frisch.id)).toBeTruthy();
    expect(await db.interests.get(aktiv.id)).toBeTruthy();
  });

  it('kommt mit leerem Papierkorb zurecht', async () => {
    expect(await purgeExpiredTrash()).toBe(0);
  });
});

/* ================================================================== */
/*  Sammelnachricht                                                    */
/* ================================================================== */

describe('Sammelnachricht in der Datenbank', () => {
  const run: BroadcastRun = {
    startedAt: '2026-03-01T10:00:00.000Z',
    text: 'Hallo {name}',
    recipients: [
      { interestId: 'a', name: 'Anna', phone: '0170 1111111' },
      { interestId: 'b', name: 'Bernd', phone: '0170 2222222' },
    ],
  };

  it('meldet ohne laufenden Versand nichts', async () => {
    expect(await loadBroadcastRun()).toBeNull();
  });

  it('überlebt einen Neustart der App', async () => {
    await saveBroadcastRun(run);
    // Ein Neustart bedeutet: nur die Datenbank bleibt übrig.
    const wieder = await loadBroadcastRun();
    expect(wieder?.recipients).toHaveLength(2);
    expect(wieder?.text).toBe('Hallo {name}');
  });

  it('überschreibt den Stand, statt einen zweiten Vorgang anzulegen', async () => {
    await saveBroadcastRun(run);
    await saveBroadcastRun({
      ...run,
      recipients: [{ ...run.recipients[0], sentAt: '2026-03-01T10:05:00.000Z' }],
    });
    const wieder = await loadBroadcastRun();
    expect(wieder?.recipients).toHaveLength(1);
    expect(await db.notificationLog.count()).toBe(1);
  });

  it('lässt sich beenden', async () => {
    await saveBroadcastRun(run);
    await clearBroadcastRun();
    expect(await loadBroadcastRun()).toBeNull();
  });
});
