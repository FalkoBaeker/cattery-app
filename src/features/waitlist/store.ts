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
  BROADCAST_KEY,
  duePurgeIds,
  isBroadcastRun,
  nextSortIndex,
  type BroadcastRun,
  type SortUpdate,
} from './order';
import {
  interestKittenIds,
  kittenAssignmentPatch,
  wishSexPatch,
} from './model';

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
  wishSexes?: WishSex[];
  wishTimeframe?: string;
}

/** Legt einen Interessenten an und hängt ihn unten an die Liste. */
export async function createInterest(input: NewInterestInput): Promise<Interest> {
  const all = await db.interests.toArray();
  const active = all.filter((i) => !i.deletedAt);
  const wishes = wishSexPatch(input.wishSexes ?? [input.wishSex ?? 'any']);
  return insert(db.interests, {
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    city: input.city?.trim() || undefined,
    source: input.source?.trim() || 'Homepage',
    ...wishes,
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

/** Löst die Verknüpfung auf der Kitten-Seite und gibt es gegebenenfalls frei. */
async function releaseKitten(kittenId: ID, interestId: ID): Promise<void> {
  const kitten = await db.kittens.get(kittenId);
  if (!kitten || kitten.interestId !== interestId) return;
  const freed: KittenSaleStatus =
    kitten.saleStatus === 'reserved' || kitten.saleStatus === 'sold'
      ? 'available'
      : kitten.saleStatus;
  await patch(db.kittens, kittenId, { interestId: undefined, saleStatus: freed });
}

async function allAssignedKittenIds(interest: Interest): Promise<ID[]> {
  const reverse = await db.kittens.where('interestId').equals(interest.id).primaryKeys();
  return [...new Set([...interestKittenIds(interest), ...reverse])];
}

async function removeKittenFromInterest(interest: Interest, kittenId: ID): Promise<void> {
  const remaining = interestKittenIds(interest).filter((id) => id !== kittenId);
  await patch(db.interests, interest.id, kittenAssignmentPatch(remaining));
}

/**
 * Fügt dem Interessenten ein Kitten hinzu. Fehlt `kittenId`, werden alle
 * Verknüpfungen gelöst. Mehrere Kitten desselben Haushalts bleiben erhalten.
 */
export async function setReservedKitten(interest: Interest, kittenId?: ID): Promise<void> {
  await db.transaction('rw', db.interests, db.kittens, async () => {
    const current = await db.interests.get(interest.id);
    if (!current) return;

    // Erst prüfen, dann verändern: Eine veraltete Kitten-Kennung darf keine
    // bestehende, gültige Reservierung lösen.
    const kitten = kittenId ? await db.kittens.get(kittenId) : undefined;
    if (kittenId && !kitten) return;

    if (!kitten) {
      const assigned = await allAssignedKittenIds(current);
      for (const id of assigned) await releaseKitten(id, current.id);
      await patch(db.interests, current.id, kittenAssignmentPatch([]));
      return;
    }

    // Ein Kitten kann nie zwei Interessenten gleichzeitig gehören.
    if (kitten.interestId && kitten.interestId !== current.id) {
      const previousOwner = await db.interests.get(kitten.interestId);
      if (previousOwner) await removeKittenFromInterest(previousOwner, kitten.id);
    }

    await patch(
      db.interests,
      current.id,
      kittenAssignmentPatch([...interestKittenIds(current), kitten.id]),
    );
    await patch(db.kittens, kitten.id, {
      interestId: current.id,
      saleStatus: saleStatusFor(current.status, kitten.saleStatus),
    });
  });
}

/** Löst genau eine Zuordnung; andere Kitten des Haushalts bleiben reserviert. */
export async function removeReservedKitten(interest: Interest, kittenId: ID): Promise<void> {
  await db.transaction('rw', db.interests, db.kittens, async () => {
    const current = await db.interests.get(interest.id);
    if (!current) return;
    await releaseKitten(kittenId, current.id);
    await removeKittenFromInterest(current, kittenId);
  });
}

export async function toggleReservedKitten(interest: Interest, kittenId: ID): Promise<void> {
  const current = await db.interests.get(interest.id);
  if (!current) return;
  if (interestKittenIds(current).includes(kittenId)) {
    await removeReservedKitten(current, kittenId);
  } else {
    await setReservedKitten(current, kittenId);
  }
}

/**
 * Setzt den Status und zieht das verknüpfte Kitten nach.
 *
 * „Abgesagt" wandert zusätzlich in den Papierkorb (F71/F80). Jeder andere
 * Status holt den Eintrag wieder heraus — sonst bliebe ein versehentlich
 * abgesagter Interessent für immer im Papierkorb liegen, obwohl die
 * Statuskette ausdrücklich einen Weg zurück anbietet.
 */
export async function setInterestStatus(
  interest: Interest,
  status: InterestStatus,
): Promise<void> {
  await db.transaction('rw', db.interests, db.kittens, async () => {
    const current = await db.interests.get(interest.id);
    if (!current) return;
    const changes: Partial<Interest> = {
      status,
      deletedAt: status === 'declined' ? nowISO() : undefined,
    };
    // Kommt der Eintrag aus dem Papierkorb zurück, stellt er sich unten an —
    // sein alter sortIndex kann inzwischen neu vergeben worden sein.
    if (current.deletedAt && status !== 'declined') {
      const all = await db.interests.toArray();
      const active = all.filter((i) => !i.deletedAt && i.id !== current.id);
      changes.sortIndex = nextSortIndex(active);
    }
    await patch(db.interests, current.id, changes);

    const assigned = await allAssignedKittenIds(current);
    if (assigned.length === 0) return;
    if (status === 'declined') {
      for (const kittenId of assigned) await releaseKitten(kittenId, current.id);
      await patch(db.interests, current.id, kittenAssignmentPatch([]));
      return;
    }
    for (const kittenId of assigned) {
      const kitten = await db.kittens.get(kittenId);
      if (!kitten || kitten.interestId !== current.id) continue;
      const next = saleStatusFor(status, kitten.saleStatus);
      if (next !== kitten.saleStatus) {
        await patch(db.kittens, kitten.id, { saleStatus: next });
      }
    }
  });
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
  const current = all.find((i) => i.id === id);
  const active = all.filter((i) => !i.deletedAt && i.id !== id);
  const changes: Partial<Interest> = {
    deletedAt: undefined,
    sortIndex: nextSortIndex(active),
  };
  // Ein zurückgeholter Eintrag darf nicht mit „Abgesagt" auf der Liste
  // stehen — sonst räumt ihn der nächste Absage-Automatismus gleich wieder
  // weg und die Anzeige widerspricht sich.
  if (current?.status === 'declined') changes.status = 'contacted';
  await patch(db.interests, id, changes);
}

/**
 * Endgültiges Löschen. Nimmt den Verlauf mit, gibt verknüpfte Kitten frei
 * und löst die interne Zuordnung aus historischen Datensätzen. Deren
 * lesbarer Inhalt bleibt erhalten.
 */
export async function purgeInterest(id: ID): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.interests,
      db.kittens,
      db.appointments,
      db.documents,
      db.contracts,
      db.interestNotes,
      db.notificationLog,
    ],
    async () => {
      const interest = await db.interests.get(id);
      // Auch inkonsistente Altstände bereinigen, in denen nur das Kitten auf
      // den Interessenten zeigt oder mehrere Kitten dieselbe Kennung tragen.
      const linkedKittenIds = new Set(
        (await db.kittens.where('interestId').equals(id).toArray()).map((kitten) => kitten.id),
      );
      if (interest) {
        for (const kittenId of interestKittenIds(interest)) linkedKittenIds.add(kittenId);
      }
      for (const kittenId of linkedKittenIds) {
        await releaseKitten(kittenId, id);
      }

      const appointments = await db.appointments.where('interestId').equals(id).toArray();
      for (const a of appointments) {
        await patch(db.appointments, a.id, { interestId: undefined });
      }

      const documents = await db.documents.where('interestId').equals(id).toArray();
      for (const document of documents) {
        await patch(db.documents, document.id, { interestId: undefined });
      }

      const contracts = await db.contracts.where('interestId').equals(id).toArray();
      for (const contract of contracts) {
        await patch(db.contracts, contract.id, { interestId: undefined });
      }

      const broadcast = await loadBroadcastRun();
      if (broadcast?.recipients.some((recipient) => recipient.interestId === id)) {
        const recipients = broadcast.recipients.filter(
          (recipient) => recipient.interestId !== id,
        );
        if (recipients.length === 0) await clearBroadcastRun();
        else await saveBroadcastRun({ ...broadcast, recipients });
      }

      await db.interestNotes.where('interestId').equals(id).delete();
      await remove(db.interests, id);
    },
  );
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
export { BROADCAST_KEY } from './order';

interface BroadcastRow extends NotificationLogEntry {
  run: BroadcastRun;
}

function broadcastTable(): Table<BroadcastRow, string> {
  return db.notificationLog as unknown as Table<BroadcastRow, string>;
}

/** Liefert den laufenden Versand oder null. */
export async function loadBroadcastRun(): Promise<BroadcastRun | null> {
  const row = await broadcastTable().get(BROADCAST_KEY);
  if (!isBroadcastRun(row?.run)) return null;
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

/** Kitten, die sich verknüpfen lassen: freie plus alle bereits verknüpften. */
export async function selectableKittens(currentKittenIds: ID[] = []): Promise<Kitten[]> {
  const all = await db.kittens.toArray();
  const selected = new Set(currentKittenIds);
  return all.filter(
    (k) =>
      !k.stillborn &&
      !k.diedAt &&
      k.saleStatus !== 'deceased' &&
      (selected.has(k.id) || k.saleStatus === 'available'),
  );
}
