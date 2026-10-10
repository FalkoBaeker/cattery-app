import { beforeEach, describe, expect, it } from 'vitest';
import { db, insert, patch, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';
import { addKitten } from './data';
import { canSuggestCompletion, reconcileLitterBirths, setLitterBirthDate } from './lifecycle';

beforeEach(wipeDatabase);

describe('Geburtsstatus und Abschluss', () => {
  it('stellt einen Wurf beim ersten rückdatierten Kitten auf geboren um', async () => {
    const litter = await insert(db.litters, { motherId: 'm', status: 'pregnant', dueDate: '2026-03-20' });
    await addKitten({ litterId: litter.id, collarColor: 'red', bornAt: '2026-03-18T08:00:00.000Z', birthWeightG: 90 }, DEFAULT_SETTINGS);
    expect((await db.litters.get(litter.id))?.birthDate).toBe('2026-03-18');
    expect((await db.litters.get(litter.id))?.status).toBe('born');
    expect((await db.careTasks.where('kind').equals('vaccination').filter((task) => task.planKey === 'vaccination:1').first())?.dueDate).toBe('2026-05-13');
  });

  it('repariert alte Statusangaben ohne einen errechneten Termin als Geburt zu übernehmen', async () => {
    const litter = await insert(db.litters, { motherId: 'm', status: 'pregnant', dueDate: '2026-03-20' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red' }, DEFAULT_SETTINGS);
    await reconcileLitterBirths(DEFAULT_SETTINGS);
    expect((await db.litters.get(litter.id))?.status).toBe('born');
    expect((await db.litters.get(litter.id))?.birthDate).toBeUndefined();
    await setLitterBirthDate((await db.litters.get(litter.id))!, '2026-03-19', DEFAULT_SETTINGS);
    expect((await db.kittens.get(kitten.id))?.bornAt).toContain('2026-03-19');
    await patch(db.litters, litter.id, { status: 'pregnant' });
    await reconcileLitterBirths(DEFAULT_SETTINGS);
    expect((await db.litters.get(litter.id))?.status).toBe('born');
    expect((await db.litters.get(litter.id))?.birthDate).toBe('2026-03-19');
  });

  it('schlägt für einen bloßen Verkauf keinen Abschluss vor', async () => {
    const litter = await insert(db.litters, { motherId: 'm', status: 'born', birthDate: '2026-01-01' });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red', saleStatus: 'sold' }, DEFAULT_SETTINGS);
    expect(canSuggestCompletion([], [])).toBe(false);
    expect(canSuggestCompletion([kitten], [])).toBe(false);
    expect(canSuggestCompletion([{ ...kitten, handoverDate: '2026-04-01' }], [])).toBe(true);
    expect(canSuggestCompletion([{ ...kitten, saleStatus: 'kept' }], [])).toBe(true);
  });
});
