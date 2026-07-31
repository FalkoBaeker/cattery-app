/**
 * Schreibzugriffe des Wiege-Moduls.
 *
 * `WeightEntry` trägt keine Zeitstempel und passt deshalb nicht auf den
 * `patch`-Helfer aus src/db/db.ts (der setzt `updatedAt`). Bis es dort ein
 * Gegenstück für zeitstempellose Datensätze gibt, liegt `patchPlain` hier.
 */

import type { ID, ISODateTime, WeightEntry } from '../../types';
import { db, insertPlain, remove } from '../../db/db';

/** Neue Messung. Speichert sofort — die Schnellerfassung kennt kein Formular. */
export async function addWeight(
  kittenId: ID,
  grams: number,
  at: ISODateTime,
  note?: string,
): Promise<WeightEntry> {
  return insertPlain(db.weights, { kittenId, grams, at, note: note?.trim() || undefined });
}

/** Korrektur einer bestehenden Messung. */
export async function updateWeight(
  id: ID,
  changes: Partial<Omit<WeightEntry, 'id' | 'kittenId'>>,
): Promise<void> {
  await db.weights.update(id, changes as never);
}

export async function deleteWeight(id: ID): Promise<void> {
  await remove(db.weights, id);
}
