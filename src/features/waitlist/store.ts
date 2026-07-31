/**
 * Alle schreibenden Zugriffe der Warteliste an einem Ort.
 *
 * Die Bildschirme rufen nur diese Funktionen auf — so bleiben Nebenwirkungen
 * (Kitten-Verkaufsstatus mitführen, Papierkorb aufräumen, Verlauf schreiben)
 * an einer Stelle nachlesbar.
 */

import type { Table } from 'dexie';
import type {
  ContactChannel,
  ID,
  ISODateTime,
  Interest,
  InterestNote,
  InterestStatus,
  Kitten,
  KittenSaleStatus,
  WishSex,
} from '../../types';
import { db, insert, insertPlain, patch, remove, type NotificationLogEntry } from '../../db/db';
import { nowISO } from '../../lib/date';
import {
  duePurgeIds,
  nextSortIndex,
  type BroadcastRun,
  type SortUpdate,
} from './order';

/* ================================================================== */
/*  Interessenten                                                      */
/* ================================================================== */

export interface NewInterestInput {
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  source?: string;
  wishSex?: WishSex;
  wishTimeframe?: string;
}

/** Legt einen Interessenten an und hängt ihn unten an die Liste. */
export async function createInterest(input: NewInterestInput): Promise<Interest> {
  const all = await db.interests.toArray();
  const active = all.filter((i) => !i.deletedAt);
  return insert(db.interests, {
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    city: input.city?.trim() || undefined,
    source: input.source?.trim() || 'Homepage',
    wishSex: input.wishSex ?? 'any',
    wishTimeframe: input.wishTimeframe?.trim() || undefined,
    status: 'new',
    sortIndex: nextSortIndex(active),
  });
}

export async function updateInterest(id: ID, changes: Partial<Interest>): Promise<void> {
  await patch(db.interests, id, changes);
}

/** Speichert eine neue Reihenfolge. Ohne Änderungen wird gar nicht geschrieben. */
export async function applySortUpdates(updates: SortUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  await db.transaction('rw', db.interests, async () => {
    for (const u of updates) {
      await patch(db.interests, u.id, { sortIndex: u.sortIndex });
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Status und Kitten-Verknüpfung                                      */
/* ------------------------------------------------------------------ */

/**
 * Welcher Verkaufsstatus zum Interessenten-Status passt.
 *
 * „Verkauft mit Zuchtvorbehalt" wird nie überschrieben — daran hängt, dass
 * das Kitten *nicht* kastriert wird (Vertrag B). Ebenso bleiben „bleibt bei
 * uns" und „verstorben" unangetastet.
 */
export function saleStatusFor(
  interestStatus: InterestStatus,
  current: KittenSaleStatus,
): KittenSaleStatus {
  if (
    current === 'sold_breeding_reserved' ||
    current === 'kept' ||
    current === 'deceased'
  ) {
    return current;
  }
  if (interestStatus === 'completed') return 'sold';
  if (interestStatus === 'reserved') return 'reserved';
  if (interestStatus === 'declined') return 'available';
  return current;
}

/** Löst die Verknüpfung und gibt das Kitten wieder frei. */
async function releaseKitten(kittenId: ID, interestId: ID): Promise<void> {
  const kitten = await db.kittens.get(kittenId);
  if (!kitten || kitten.interestId !== interestId) return;
  const freed: KittenSaleStatus =
    kitten.saleStatus === 'reserved' || kitten.saleStatus === 'sold'
      ? 'available'
      : kitten.saleStatus;
  await patch(db.kittens, kittenId, { interestId: undefined, saleStatus: freed });
}

/**
 * Verknüpft ein Kitten mit dem Interessenten (oder löst die Verknüpfung,
 * wenn `kittenId` fehlt) und führt den Verkaufsstatus mit.
 */
export async function setReservedKitten(interest: Interest, kittenId?: ID): Promise<void> {
  if (interest.kittenId && interest.kittenId !== kittenId) {
    await releaseKitten(interest.kittenId, interest.id);
  }
  await patch(db.interests, interest.id, { kittenId });
  if (!kittenId) return;

  const kitten = await db.kittens.get(kittenId);
  if (!kitten) return;
  await patch(db.kittens, kittenId, {
    interestId: interest.id,
    saleStatus: saleStatusFor(interest.status, kitten.saleStatus),
  });
}

/**
 * Setzt den Status und zieht das verknüpfte Kitten nach.
 * „Abgesagt" wandert zusätzlich in den Papierkorb (F71/F80).
 */
export async function setInterestStatus(
  interest: Interest,
  status: InterestStatus,
): Promise<void> {
  const changes: Partial<Interest> = { status };
  if (status === 'declined') changes.deletedAt = nowISO();
  await patch(db.interests, interest.id, changes);

  if (!interest.kittenId) return;
  if (status === 'declined') {
    await releaseKitten(interest.kittenId, interest.id);
    await patch(db.interests, interest.id, { kittenId: undefined });
    return;
  }
  const kitten = await db.kittens.get(interest.kittenId);
  if (!kitten) return;
  const next = saleStatusFor(status, kitten.saleStatus);
  if (next !== kitten.saleStatus) {
    await patch(db.kittens, kitten.id, { saleStatus: next });
  }
}

/* ------------------------------------------------------------------ */
/*  Papierkorb                                                         */
/* ------------------------------------------------------------------ */

export async function trashInterest(id: ID): Promise<void> {
  await patch(db.interests, id, { deletedAt: nowISO() });
}

/** Holt einen Eintrag zurück und stellt ihn unten in die Liste. */
export async function restoreInterest(id: ID): Promise<void> {
  const all = await db.interests.toArray();
  const active = all.filter((i) => !i.deletedAt && i.id !== id);
  await patch(db.interests, id, {
    deletedAt: undefined,
    sortIndex: nextSortIndex(active),
  });
}

/**
 * Endgültiges Löschen. Nimmt den Verlauf mit, gibt ein reserviertes Kitten
 * frei und entfernt den Verweis aus Terminen — sonst zeigen die auf einen
 * Interessenten, den es nicht mehr gibt.
 */
export async function purgeInterest(id: ID): Promise<void> {
  const interest = await db.interests.get(id);
  if (interest?.kittenId) await releaseKitten(interest.kittenId, id);

  const appointments = await db.appointments.where('interestId').equals(id).toArray();
  for (const a of appointments) {
    await patch(db.appointments, a.id, { interestId: undefined });
  }

  const notes = await db.interestNotes.where('interestId').equals(id).toArray();
  for (const n of notes) await remove(db.interestNotes, n.id);
  await remove(db.interests, id);
}

/** Räumt den Papierkorb auf. Liefert die Anzahl der gelöschten Einträge. */
export async function purgeExpiredTrash(): Promise<number> {
  const all = await db.interests.toArray();
  const trashed = all.filter((i) => i.deletedAt);
  const ids = duePurgeIds(trashed);
  for (const id of ids) await purgeInterest(id);
  return ids.length;
}

/* ================================================================== */
/*  Kontaktverlauf                                                     */
/* ================================================================== */

export async function addContactNote(
  interestId: ID,
  channel: ContactChannel,
  text: string,
  at: ISODateTime = nowISO(),
): Promise<InterestNote> {
  return insertPlain(db.interestNotes, { interestId, at, channel, text: text.trim() });
}

/**
 * Verlaufseinträge tragen keine Zeitstempel-Felder (siehe `InterestNote`),
 * deshalb hier bewusst `update` statt `patch` — `patch` würde ein `updatedAt`
 * anlegen, das im Datenmodell nicht vorgesehen ist.
 */
export async function updateContactNote(
  id: ID,
  changes: Partial<Omit<InterestNote, 'id'>>,
): Promise<void> {
  await db.interestNotes.update(id, changes);
}

export async function deleteContactNote(id: ID): Promise<void> {
  await remove(db.interestNotes, id);
}

/* ================================================================== */
/*  Sammelnachricht — Fortschritt in der Datenbank                     */
/* ================================================================== */

/**
 * Der Versand läuft über wa.me-Verweise. iOS wechselt dabei in WhatsApp und
 * kann die PWA im Hintergrund verwerfen — beim Zurückkommen startet sie neu.
 * Deshalb liegt der Fortschritt in der Datenbank und nicht im Zustand einer
 * Komponente.
 *
 * Genutzt wird die vorhandene Tabelle `notificationLog` (Schlüssel/Zeitpunkt).
 * Eine eigene Tabelle wäre sauberer, liegt aber außerhalb dieses Moduls;
 * siehe Abschlussbericht.
 */
export const BROADCAST_KEY = 'waitlist:broadcast';

interface BroadcastRow extends NotificationLogEntry {
  run: BroadcastRun;
}

function broadcastTable(): Table<BroadcastRow, string> {
  return db.notificationLog as unknown as Table<BroadcastRow, string>;
}

/** Liefert den laufenden Versand oder null. */
export async function loadBroadcastRun(): Promise<BroadcastRun | null> {
  const row = await broadcastTable().get(BROADCAST_KEY);
  if (!row?.run || !Array.isArray(row.run.recipients)) return null;
  return row.run;
}

export async function saveBroadcastRun(run: BroadcastRun): Promise<void> {
  await broadcastTable().put({ key: BROADCAST_KEY, firedAt: nowISO(), run });
}

export async function clearBroadcastRun(): Promise<void> {
  await db.notificationLog.delete(BROADCAST_KEY);
}

/* ================================================================== */
/*  Lesehilfen                                                         */
/* ================================================================== */

/** Kitten, die sich verknüpfen lassen: freie plus das bereits verknüpfte. */
export async function selectableKittens(currentKittenId?: ID): Promise<Kitten[]> {
  const all = await db.kittens.toArray();
  return all.filter(
    (k) => !k.stillborn && (k.id === currentKittenId || k.saleStatus === 'available'),
  );
}
