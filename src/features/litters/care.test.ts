import { beforeEach, describe, expect, it } from 'vitest';
import { db, insert, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';
import { addKitten, deleteKitten } from './data';
import { careDateForKitten, createCareRecord, saveCareCompletion } from './care';
import { syncLitterSchedule } from '../../domain/schedule';
import { createBackup, parseBackup, serializeBackup } from '../settings/backup';

beforeEach(wipeDatabase);

async function setup() {
  const cat = await insert(db.cats, { callName: 'Mira', sex: 'female', breed: 'Russisch Blau', status: 'active', isOwn: true });
  const litter = await insert(db.litters, { motherId: cat.id, birthDate: '2026-01-01', status: 'born' });
  const a = await addKitten({ litterId: litter.id, collarColor: 'red', bornAt: '2026-01-01T10:00:00.000Z' }, DEFAULT_SETTINGS);
  const b = await addKitten({ litterId: litter.id, collarColor: 'blue', bornAt: '2026-01-01T10:05:00.000Z' }, DEFAULT_SETTINGS);
  const task = (await db.careTasks.where('litterId').equals(litter.id).toArray()).find((item) => item.kind === 'vaccination')!;
  return { cat, litter, a, b, task };
}

describe('Ereignisdatum je Tier', () => {
  it('legt bei gleichzeitigem Start keine doppelten Fahrplanpunkte an', async () => {
    const { litter } = await setup();
    await db.careTasks.clear();
    await Promise.all([syncLitterSchedule(litter.id, DEFAULT_SETTINGS), syncLitterSchedule(litter.id, DEFAULT_SETTINGS)]);
    const tasks = await db.careTasks.toArray();
    expect(new Set(tasks.map((task) => task.planKey)).size).toBe(tasks.length);
  });

  it('legt eine zusätzliche Einzelbehandlung ohne offene Aufgabe für andere Kitten an', async () => {
    const { litter, a, b } = await setup();
    await createCareRecord({ kind: 'vaccination', title: 'Zusätzliche Impfung', date: '2026-03-01', litterId: litter.id, kittenIds: [a.id] });
    const record = (await db.careTasks.toArray()).find((task) => task.title === 'Zusätzliche Impfung')!;
    expect(record.kittenId).toBe(a.id);
    expect(record.doneAt).toBe('2026-03-01');
    expect(record.kittenId).not.toBe(b.id);
  });
  it('erledigt eine wurfweite Aufgabe erst nach dem letzten Tier und erhält verschiedene Daten', async () => {
    const { task, a, b, litter } = await setup();
    await saveCareCompletion(task.id, '2026-02-02', [a.id]);
    const partial = (await db.careTasks.get(task.id))!;
    expect(partial.doneAt).toBeUndefined();
    expect(careDateForKitten(partial, a.id)).toBe('2026-02-02');
    expect(careDateForKitten(partial, b.id)).toBeUndefined();
    await syncLitterSchedule(litter.id, DEFAULT_SETTINGS);
    expect((await db.careTasks.get(task.id))?.completedKittenDates?.[a.id]).toBe('2026-02-02');
    await saveCareCompletion(task.id, '2026-02-03', [b.id]);
    expect((await db.careTasks.get(task.id))?.doneAt).toBe('2026-02-03');
    await saveCareCompletion(task.id, '2026-02-01', [a.id]);
    const corrected = (await db.careTasks.get(task.id))!;
    expect(corrected.completedKittenDates).toEqual({ [a.id]: '2026-02-01', [b.id]: '2026-02-03' });
    await saveCareCompletion(task.id, undefined, [b.id]);
    expect((await db.careTasks.get(task.id))?.doneAt).toBeUndefined();
    expect((await db.careTasks.get(task.id))?.completedKittenDates?.[a.id]).toBe('2026-02-01');
  });

  it('ändert beide Kastrationsaufgaben gemeinsam und rollt ungültige Eingaben zurück', async () => {
    const { a, b, litter } = await setup();
    const task = (await db.careTasks.where('litterId').equals(litter.id).toArray()).find((item) => item.kind === 'neuter' && item.kittenId === a.id)!;
    await expect(saveCareCompletion(task.id, '2025-12-31', [a.id, b.id])).rejects.toThrow('vor der Geburt');
    expect((await db.careTasks.get(task.id))?.doneAt).toBeUndefined();
    await saveCareCompletion(task.id, '2026-04-03', [a.id, b.id]);
    const completed = await db.careTasks.where('kind').equals('neuter').toArray();
    expect(completed.map((item) => item.doneAt)).toEqual(['2026-04-03', '2026-04-03']);
  });

  it('hält Sicherungen nach Teil-Erledigungen und dem Löschen eines Kittens wiederherstellbar', async () => {
    const { task, a } = await setup();
    await saveCareCompletion(task.id, '2026-02-02', [a.id]);
    expect(parseBackup(serializeBackup(await createBackup())).ok).toBe(true);
    await deleteKitten(a, DEFAULT_SETTINGS);
    expect((await db.careTasks.get(task.id))?.completedKittenDates?.[a.id]).toBeUndefined();
    expect(parseBackup(serializeBackup(await createBackup())).ok).toBe(true);
  });

  it('erfasst eine zurückliegende Kastration einer erwachsenen Katze', async () => {
    const { cat } = await setup();
    await createCareRecord({ catId: cat.id, kind: 'neuter', title: 'Kastration', date: '2026-05-01' });
    const task = (await db.careTasks.where('catId').equals(cat.id).toArray())[0];
    expect(task.doneAt).toBe('2026-05-01');
    expect((await db.cats.get(cat.id))?.status).toBe('neutered');
  });
});
