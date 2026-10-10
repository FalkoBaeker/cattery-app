/**
 * Schreibzugriffe des Wiege-Moduls.
 *
 * `WeightEntry` trägt keine Zeitstempel und wird deshalb über die Plain-Helfer
 * aus src/db/db.ts geschrieben.
 */

import type { ID, ISODateTime, WeightEntry } from '../../types';
import { db, insertPlain, patchPlain, remove } from '../../db/db';
import { dateOf, todayISO } from '../../lib/date';
import { localDateTime } from './backfill';
import { parseGrams } from './weighing';

async function validateWeight(kittenId: ID, grams: number, at: ISODateTime, excludeId?: ID) {
  const parsed = parseGrams(String(grams));
  if (!parsed.ok) throw new Error(parsed.error);
  const timestamp = new Date(at).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Bitte einen gültigen Zeitpunkt angeben.');
  if (timestamp > Date.now()) throw new Error('Eine Wiegung darf nicht in der Zukunft liegen.');

  const kitten = await db.kittens.get(kittenId);
  const litter = kitten ? await db.litters.get(kitten.litterId) : undefined;
  const birthAt = kitten?.bornAt ?? (litter?.birthDate ? localDateTime(litter.birthDate, '00:00') : null);
  if (birthAt && timestamp < new Date(birthAt).getTime()) {
    throw new Error('Eine Wiegung darf nicht vor der Geburt des Kittens liegen.');
  }
  const entries = await db.weights.where('kittenId').equals(kittenId).toArray();
  if (entries.some((entry) => entry.id !== excludeId &&
    Math.floor(new Date(entry.at).getTime() / 60_000) === Math.floor(timestamp / 60_000))) {
    throw new Error(`Für diese Uhrzeit am ${dateOf(at)} gibt es schon eine Messung. Bitte diese Messung korrigieren oder eine andere Uhrzeit wählen.`);
  }
  return parsed.grams;
}

/** Alle Eingaben eines Durchgangs werden zusammen übernommen oder vollständig zurückgerollt. */
export async function addWeightRound(
  weights: Array<{ kittenId: ID; grams: number }>,
  at: ISODateTime,
): Promise<WeightEntry[]> {
  if (weights.length === 0) throw new Error('Bitte ein Gewicht eingeben.');
  if (new Set(weights.map((weight) => weight.kittenId)).size !== weights.length) {
    throw new Error('Ein Kitten darf pro Durchgang nur einmal vorkommen.');
  }
  return db.transaction('rw', db.weights, db.kittens, db.litters, async () => {
    const normalized: Array<{ kittenId: ID; grams: number }> = [];
    for (const weight of weights) {
      const kitten = await db.kittens.get(weight.kittenId);
      const afterDeath = kitten?.diedAt ? dateOf(at) > kitten.diedAt : kitten?.saleStatus === 'deceased' && dateOf(at) >= todayISO();
      if (!kitten || kitten.stillborn || afterDeath) {
        throw new Error('Dieses Kitten kann nicht gewogen werden. Die Eingaben bleiben erhalten.');
      }
      const grams = await validateWeight(weight.kittenId, weight.grams, at);
      normalized.push({ kittenId: weight.kittenId, grams });
    }
    const entries: WeightEntry[] = [];
    for (const weight of normalized) {
      entries.push(await insertPlain(db.weights, { ...weight, at }));
    }
    return entries;
  });
}

/** Neue einzelne Messung, ebenfalls gegen Geburt und doppelte Minuten geprüft. */
export async function addWeight(
  kittenId: ID,
  grams: number,
  at: ISODateTime,
  note?: string,
): Promise<WeightEntry> {
  return db.transaction('rw', db.weights, db.kittens, db.litters, async () => {
    const normalized = await validateWeight(kittenId, grams, at);
    return insertPlain(db.weights, { kittenId, grams: normalized, at, note: note?.trim() || undefined });
  });
}

/** Korrektur einer bestehenden Messung. */
export async function updateWeight(
  id: ID,
  changes: Partial<Omit<WeightEntry, 'id' | 'kittenId'>>,
): Promise<void> {
  await db.transaction('rw', db.weights, db.kittens, db.litters, async () => {
    const entry = await db.weights.get(id);
    if (!entry) throw new Error('Die Messung wurde bereits gelöscht.');
    const grams = await validateWeight(entry.kittenId, changes.grams ?? entry.grams, changes.at ?? entry.at, id);
    await patchPlain(db.weights, id, { ...changes, grams });
  });
}

export async function deleteWeight(id: ID): Promise<void> {
  await remove(db.weights, id);
}
