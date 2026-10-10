import { db, insertPlain, patch, patchPlain } from '../../db/db';
import { dateOf, todayISO } from '../../lib/date';
import { isValidISODate } from '../cats/heat';
import { syncLitterSchedule } from '../../domain/schedule';
import type { Interest, Kitten, Litter, Settings } from '../../types';

export function canSuggestCompletion(kittens: Kitten[], interests: Interest[]): boolean {
  return kittens.length > 0 && kittens.every((kitten) =>
    kitten.stillborn || Boolean(kitten.diedAt) || kitten.saleStatus === 'deceased' || kitten.saleStatus === 'kept' ||
    Boolean(kitten.handoverDate) || interests.some((interest) => interest.id === kitten.interestId && interest.status === 'completed'),
  );
}

export async function reconcileLitterBirths(settings: Settings): Promise<void> {
  const litters = await db.litters.toArray();
  for (const litter of litters) {
    if (!['planned', 'mated', 'pregnant', 'born'].includes(litter.status)) continue;
    const kittens = await db.kittens.where('litterId').equals(litter.id).toArray();
    if (!kittens.length && !litter.birthDate) continue;
    const events = await db.birthEvents.where('litterId').equals(litter.id).toArray();
    const knownBirth = litter.birthDate ?? [...kittens.flatMap((kitten) => kitten.bornAt ? [dateOf(kitten.bornAt)] : []), ...events.filter((event) => event.kind === 'kitten_born').map((event) => dateOf(event.at))].sort()[0];
    if (litter.status !== 'born' || (knownBirth && !litter.birthDate)) {
      await patch(db.litters, litter.id, { status: 'born', birthDate: knownBirth });
      await syncLitterSchedule(litter.id, settings);
    }
  }
}

export async function setLitterBirthDate(litter: Litter, date: string, settings: Settings): Promise<void> {
  if (!isValidISODate(date) || date > todayISO()) throw new Error('Bitte das tatsächliche Geburtsdatum bis heute wählen.');
  await db.transaction('rw', db.litters, db.kittens, db.weights, db.birthEvents, db.careTasks, async () => {
    await patch(db.litters, litter.id, { birthDate: date, status: litter.status === 'completed' ? 'completed' : 'born' });
    const kittens = await db.kittens.where('litterId').equals(litter.id).toArray();
    for (const kitten of kittens) {
      if (kitten.bornAt && litter.birthDate && dateOf(kitten.bornAt) !== litter.birthDate) continue;
      const at = kitten.bornAt ? new Date(kitten.bornAt) : new Date(`${date}T12:00:00`);
      const [year, month, day] = date.split('-').map(Number);
      at.setFullYear(year, month - 1, day);
      const bornAt = at.toISOString();
      await patch(db.kittens, kitten.id, { bornAt });
      const birthWeights = await db.weights.where('kittenId').equals(kitten.id).filter((entry) => entry.note === 'Geburtsgewicht').toArray();
      for (const entry of birthWeights) await patchPlain(db.weights, entry.id, { at: bornAt });
      if (!birthWeights.length && kitten.birthWeightG && !kitten.stillborn) await insertPlain(db.weights, { kittenId: kitten.id, grams: kitten.birthWeightG, at: bornAt, note: 'Geburtsgewicht' });
      const birthEvents = await db.birthEvents.where('litterId').equals(litter.id).filter((event) => event.kittenId === kitten.id).toArray();
      for (const event of birthEvents.filter((event) => event.kind === 'kitten_born')) await patchPlain(db.birthEvents, event.id, { at: bornAt });
    }
    await syncLitterSchedule(litter.id, settings);
  });
}
