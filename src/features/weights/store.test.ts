import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, wipeDatabase } from '../../db/db';
import { localDateTime } from './backfill';
import { addWeightRound, updateWeight } from './store';

const birthDate = '2026-03-03';
const at = localDateTime('2026-03-04', '08:25')!;
const weights = [{ kittenId: 'k1', grams: 95 }, { kittenId: 'k2', grams: 101 }];

describe('weight round transaction', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await wipeDatabase();
    await db.litters.put({ id: 'l1', motherId: 'c1', status: 'born', birthDate, createdAt: at, updatedAt: at });
    await db.kittens.bulkPut(['k1', 'k2'].map((id) => ({ id, litterId: 'l1', collarColor: 'red', sex: 'unknown', stillborn: false, saleStatus: 'available', createdAt: at, updatedAt: at })));
  });

  it('speichert alle Gewichte mit exakt dem gemeinsamen vergangenen Zeitpunkt', async () => {
    const saved = await addWeightRound(weights, at);
    expect(saved).toHaveLength(2);
    expect((await db.weights.toArray()).sort((a, b) => a.kittenId.localeCompare(b.kittenId)).map((entry) => [entry.kittenId, entry.grams, entry.at])).toEqual(weights.map((weight) => [weight.kittenId, weight.grams, at]));
  });

  it('rollt die erste Messung zurück, wenn die zweite Schreiboperation scheitert', async () => {
    const originalAdd = db.weights.add.bind(db.weights);
    let calls = 0;
    vi.spyOn(db.weights, 'add').mockImplementation((...args) => {
      if (++calls === 2) return Promise.reject(new Error('disk full')) as ReturnType<typeof db.weights.add>;
      return originalAdd(...args);
    });
    await expect(addWeightRound(weights, at)).rejects.toThrow('disk full');
    expect(await db.weights.count()).toBe(0);
  });

  it('prüft den individuellen Geburtszeitpunkt vor allen Schreiboperationen', async () => {
    await db.kittens.update('k2', { bornAt: localDateTime('2026-03-04', '09:00')! });
    await expect(addWeightRound(weights, at)).rejects.toThrow('vor der Geburt');
    expect(await db.weights.count()).toBe(0);
  });

  it('verhindert zukünftige Zeitpunkte und Zeiten vor dem Wurfgeburtstag', async () => {
    await expect(addWeightRound(weights, new Date(Date.now() + 60_000).toISOString())).rejects.toThrow('Zukunft');
    await expect(addWeightRound(weights, localDateTime('2026-03-02', '23:59')!)).rejects.toThrow('vor der Geburt');
    expect(await db.weights.count()).toBe(0);
  });

  it('verhindert doppelte Minuten auch bei zeitgleichen Speicherversuchen', async () => {
    const results = await Promise.allSettled([addWeightRound(weights, at), addWeightRound(weights, at)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.weights.count()).toBe(2);
  });

  it('lässt eine Korrektur in derselben Minute zu, aber keine Kollision mit anderer Messung', async () => {
    const [first] = await addWeightRound([weights[0]], at);
    const nextAt = localDateTime('2026-03-04', '20:00')!;
    const [second] = await addWeightRound([{ kittenId: 'k1', grams: 104 }], nextAt);
    await updateWeight(first.id, { grams: 97 });
    expect((await db.weights.get(first.id))?.grams).toBe(97);
    await expect(updateWeight(second.id, { at })).rejects.toThrow('schon eine Messung');
    expect((await db.weights.get(second.id))?.at).toBe(nextAt);
  });

  it('verhindert doppelte Kitten und ungültige Grammwerte ohne Teilwerte', async () => {
    await expect(addWeightRound([weights[0], weights[0]], at)).rejects.toThrow('nur einmal');
    await expect(addWeightRound([weights[0], { kittenId: 'k2', grams: 0 }], at)).rejects.toThrow('zwischen 1');
    expect(await db.weights.count()).toBe(0);
  });

  it('erlaubt historische Wiegungen vor dem Tod, aber keine späteren Messungen', async () => {
    await db.kittens.update('k1', { saleStatus: 'deceased', diedAt: '2026-03-05' });
    await addWeightRound([weights[0]], at);
    await expect(addWeightRound([weights[0]], localDateTime('2026-03-06', '08:00')!)).rejects.toThrow('nicht gewogen');
    expect(await db.weights.count()).toBe(1);
  });
});
