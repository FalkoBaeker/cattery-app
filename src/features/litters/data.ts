/**
 * Schreibende Vorgänge des Wurf-Moduls an einer Stelle.
 *
 * Warum gebündelt: An mehreren Vorgängen hängt der Fahrplan. Wer den
 * Verkaufsstatus eines Kittens ändert, muss `syncLitterSchedule` rufen —
 * sonst bleibt eine Kastration stehen, die es nicht mehr geben darf.
 */

import { db, insert, insertPlain, patch } from '../../db/db';
import { syncLitterSchedule } from '../../domain/schedule';
import { deleteWeight, updateWeight } from '../weights';
import { nowISO, parseISODate, todayISO } from '../../lib/date';
import type {
  BirthEventKind,
  CollarColorKey,
  ID,
  ISODate,
  ISODateTime,
  Kitten,
  KittenSaleStatus,
  SexOrUnknown,
  Settings,
} from '../../types';

/** Zeitpunkt „mittags" an einem reinen Datum — für nachgetragene Angaben. */
export function noonOf(date: ISODate): ISODateTime {
  const d = parseISODate(date);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/* ------------------------------------------------------------------ */
/*  Wurf                                                               */
/* ------------------------------------------------------------------ */

/**
 * Setzt Geburtsdatum und Status, sobald das erste Kitten da ist.
 * Ein bereits erfasstes Geburtsdatum bleibt unangetastet.
 */
export async function ensureLitterBorn(
  litterId: ID,
  at: ISODateTime,
  settings: Settings,
): Promise<void> {
  // Frisch aus der Datenbank lesen: Während der Geburt kommen die Einträge
  // schneller, als die Oberfläche nachzieht.
  const litter = await db.litters.get(litterId);
  if (!litter) return;
  if (litter.birthDate && litter.status === 'born') return;
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  const birthDate =
    litter.birthDate ?? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  await patch(db.litters, litterId, { birthDate, status: 'born' });
  await syncLitterSchedule(litterId, settings);
}

/* ------------------------------------------------------------------ */
/*  Kitten                                                             */
/* ------------------------------------------------------------------ */

export interface NewKittenInput {
  litterId: ID;
  collarColor: CollarColorKey;
  callName?: string;
  sex?: SexOrUnknown;
  birthWeightG?: number;
  bornAt?: ISODateTime;
  stillborn?: boolean;
  saleStatus?: KittenSaleStatus;
  notes?: string;
}

/**
 * Notiz, an der die aus dem Geburtsgewicht erzeugte Wiegung erkennbar ist.
 * Nur so lässt sie sich später nachziehen, wenn das Gewicht korrigiert wird.
 */
export const BIRTH_WEIGHT_NOTE = 'Geburtsgewicht';

/**
 * Legt ein Kitten an. Ist ein Geburtsgewicht dabei, wird daraus gleich die
 * erste Wiegung — sonst beginnt die Gewichtskurve erst bei der zweiten
 * Messung.
 */
export async function addKitten(input: NewKittenInput, settings: Settings): Promise<Kitten> {
  const stillborn = input.stillborn ?? false;
  const kitten = await insert<Kitten>(db.kittens, {
    litterId: input.litterId,
    collarColor: input.collarColor,
    callName: input.callName?.trim() || undefined,
    sex: input.sex ?? 'unknown',
    birthWeightG: input.birthWeightG,
    bornAt: input.bornAt,
    stillborn,
    saleStatus: input.saleStatus ?? (stillborn ? 'deceased' : 'available'),
    notes: input.notes?.trim() || undefined,
  });

  if (!stillborn && input.birthWeightG && input.birthWeightG > 0 && input.bornAt) {
    await insertPlain(db.weights, {
      kittenId: kitten.id,
      at: input.bornAt,
      grams: Math.round(input.birthWeightG),
      note: BIRTH_WEIGHT_NOTE,
    });
  }

  await syncLitterSchedule(input.litterId, settings);
  return kitten;
}

/**
 * Zieht die aus dem Geburtsgewicht erzeugte Wiegung nach, wenn das Gewicht
 * später korrigiert wird.
 *
 * Ohne das driften Kopfzeile („Geburtsgewicht 95 g") und Gewichtskurve
 * auseinander: In der Kurve stünde weiter der Tippfehler. Wird das Gewicht
 * ganz gelöscht, verschwindet auch die Wiegung; ist noch keine da, entsteht
 * sie — sofern ein Geburtszeitpunkt bekannt ist.
 */
export async function syncBirthWeightEntry(
  kitten: Pick<Kitten, 'id' | 'bornAt' | 'stillborn'>,
  birthWeightG?: number,
): Promise<void> {
  const grams =
    birthWeightG != null && Number.isFinite(birthWeightG) && birthWeightG > 0
      ? Math.round(birthWeightG)
      : undefined;

  const entries = await db.weights.where('kittenId').equals(kitten.id).toArray();
  const existing = entries.find((w) => w.note === BIRTH_WEIGHT_NOTE);

  if (existing) {
    if (grams == null) await deleteWeight(existing.id);
    else if (existing.grams !== grams) await updateWeight(existing.id, { grams });
    return;
  }

  // Neu anlegen nur, wenn es überhaupt eine Wiegung geben darf.
  if (grams == null || kitten.stillborn || !kitten.bornAt) return;
  await insertPlain(db.weights, {
    kittenId: kitten.id,
    at: kitten.bornAt,
    grams,
    note: BIRTH_WEIGHT_NOTE,
  });
}

/** Verkaufsstatus ändern und den Fahrplan nachziehen. */
export async function updateSaleStatus(
  kitten: Kitten,
  saleStatus: KittenSaleStatus,
  settings: Settings,
): Promise<void> {
  if (kitten.saleStatus === saleStatus) return;
  await patch(db.kittens, kitten.id, { saleStatus });
  await syncLitterSchedule(kitten.litterId, settings);
}

/**
 * Verknüpft ein Kitten mit einem Interessenten — in beide Richtungen,
 * damit die Warteliste dieselbe Verbindung sieht.
 */
export async function linkInterest(kitten: Kitten, interestId?: ID): Promise<void> {
  await db.transaction('rw', db.kittens, db.interests, async () => {
    const current = await db.kittens.get(kitten.id);
    if (!current || current.interestId === interestId) return;

    // Eine nicht mehr vorhandene Zielkennung darf die aktuelle Verbindung
    // nicht beschädigen.
    const next = interestId ? await db.interests.get(interestId) : undefined;
    if (interestId && !next) return;

    if (current.interestId) {
      const old = await db.interests.get(current.interestId);
      if (old?.kittenId === current.id) {
        await patch(db.interests, old.id, { kittenId: undefined });
      }
    }

    if (next?.kittenId && next.kittenId !== current.id) {
      const formerlyLinked = await db.kittens.get(next.kittenId);
      if (formerlyLinked?.interestId === next.id) {
        const saleStatus =
          formerlyLinked.saleStatus === 'reserved' || formerlyLinked.saleStatus === 'sold'
            ? 'available'
            : formerlyLinked.saleStatus;
        await patch(db.kittens, formerlyLinked.id, {
          interestId: undefined,
          saleStatus,
        });
      }
    }

    await patch(db.kittens, current.id, { interestId });
    if (next) await patch(db.interests, next.id, { kittenId: current.id });
  });
}

/** Behutsam: verstorben vermerken, mit Datum und Notiz. */
export async function markKittenDeceased(
  kitten: Kitten,
  diedAt: ISODate,
  deathNote: string | undefined,
  settings: Settings,
): Promise<void> {
  await patch(db.kittens, kitten.id, {
    saleStatus: 'deceased',
    diedAt,
    deathNote: deathNote?.trim() || undefined,
  });
  await syncLitterSchedule(kitten.litterId, settings);
}

/** Vermerk wieder aufheben — Tippfehler passieren. */
export async function revokeKittenDeath(kitten: Kitten, settings: Settings): Promise<void> {
  await patch(db.kittens, kitten.id, {
    saleStatus: 'available',
    diedAt: undefined,
    deathNote: undefined,
    stillborn: false,
  });
  await syncLitterSchedule(kitten.litterId, settings);
}

/**
 * Löst Verweise auf gelöschte Kitten, ohne historische Dokumente, Termine
 * oder Geldbewegungen zu vernichten.
 *
 * Muss innerhalb einer Transaktion aufgerufen werden, die alle hier
 * verwendeten Tabellen umfasst.
 */
async function clearKittenReferences(kittenIds: ID[]): Promise<void> {
  if (kittenIds.length === 0) return;
  const ids = new Set(kittenIds);

  const interests = await db.interests.where('kittenId').anyOf(kittenIds).toArray();
  for (const interest of interests) {
    await patch(db.interests, interest.id, { kittenId: undefined });
  }

  const documents = await db.documents.where('kittenId').anyOf(kittenIds).toArray();
  for (const document of documents) {
    await patch(db.documents, document.id, { kittenId: undefined });
  }

  const costs = await db.costs.where('kittenId').anyOf(kittenIds).toArray();
  for (const cost of costs) await patch(db.costs, cost.id, { kittenId: undefined });

  const revenues = await db.revenues.where('kittenId').anyOf(kittenIds).toArray();
  for (const revenue of revenues) await patch(db.revenues, revenue.id, { kittenId: undefined });

  const uses = await db.breedingUses.where('kittenId').anyOf(kittenIds).toArray();
  for (const use of uses) await patch(db.breedingUses, use.id, { kittenId: undefined });

  const appointments = (await db.appointments.toArray()).filter((appointment) =>
    appointment.kittenIds?.some((id) => ids.has(id)),
  );
  for (const appointment of appointments) {
    const remaining = appointment.kittenIds?.filter((id) => !ids.has(id)) ?? [];
    await patch(db.appointments, appointment.id, {
      kittenIds: remaining.length > 0 ? remaining : undefined,
    });
  }

  // Die Tierdaten im Vertrag sind eine historische Momentaufnahme und
  // bleiben lesbar. Nur die interne Kennung des inzwischen gelöschten
  // Kittens wird entfernt; Name, Geschlecht und ein vorhandenes PDF ändern
  // sich dadurch inhaltlich nicht.
  const contracts = (await db.contracts.toArray()).filter((contract) =>
    contract.data.animals.some((animal) => animal.kittenId && ids.has(animal.kittenId)),
  );
  for (const contract of contracts) {
    await patch(db.contracts, contract.id, {
      data: {
        ...contract.data,
        animals: contract.data.animals.map((animal) =>
          animal.kittenId && ids.has(animal.kittenId)
            ? { ...animal, kittenId: undefined }
            : animal,
        ),
      },
    });
  }
}

/** Löscht ein Kitten atomar mitsamt Wiegungen, Protokolleinträgen, Aufgaben und Foto. */
export async function deleteKitten(kitten: Kitten, settings: Settings): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.kittens,
      db.weights,
      db.careTasks,
      db.birthEvents,
      db.interests,
      db.documents,
      db.costs,
      db.revenues,
      db.breedingUses,
      db.appointments,
      db.contracts,
      db.attachments,
      db.litters,
    ],
    async () => {
      await clearKittenReferences([kitten.id]);
      await db.weights.where('kittenId').equals(kitten.id).delete();
      await db.careTasks.where('kittenId').equals(kitten.id).delete();
      await db.birthEvents
        .where('litterId')
        .equals(kitten.litterId)
        .and((event) => event.kittenId === kitten.id)
        .delete();
      await db.kittens.delete(kitten.id);
      if (kitten.photoAttachmentId) await db.attachments.delete(kitten.photoAttachmentId);
      await syncLitterSchedule(kitten.litterId, settings);
    },
  );
}

/**
 * Löscht einen Wurf und seine operativen Kinddaten atomar.
 * Historische Verträge, Dokumente, Termine und Finanzeinträge bleiben erhalten;
 * nur ihre nicht mehr gültigen Verknüpfungen werden gelöst.
 */
export async function deleteLitterCascade(litterId: ID): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.litters,
      db.kittens,
      db.weights,
      db.careTasks,
      db.birthEvents,
      db.interests,
      db.documents,
      db.costs,
      db.revenues,
      db.breedingUses,
      db.appointments,
      db.contracts,
      db.attachments,
    ],
    async () => {
      const kittens = await db.kittens.where('litterId').equals(litterId).toArray();
      const kittenIds = kittens.map((kitten) => kitten.id);
      await clearKittenReferences(kittenIds);

      const documents = await db.documents.where('litterId').equals(litterId).toArray();
      for (const document of documents) {
        await patch(db.documents, document.id, { litterId: undefined });
      }

      const costs = await db.costs.where('litterId').equals(litterId).toArray();
      for (const cost of costs) await patch(db.costs, cost.id, { litterId: undefined });

      const revenues = await db.revenues.where('litterId').equals(litterId).toArray();
      for (const revenue of revenues) await patch(db.revenues, revenue.id, { litterId: undefined });

      const appointments = await db.appointments.where('litterId').equals(litterId).toArray();
      for (const appointment of appointments) {
        await patch(db.appointments, appointment.id, { litterId: undefined });
      }

      const contracts = await db.contracts.where('litterId').equals(litterId).toArray();
      for (const contract of contracts) {
        await patch(db.contracts, contract.id, { litterId: undefined });
      }

      if (kittenIds.length > 0) {
        await db.weights.where('kittenId').anyOf(kittenIds).delete();
      }
      await db.careTasks.where('litterId').equals(litterId).delete();
      await db.birthEvents.where('litterId').equals(litterId).delete();
      await db.kittens.where('litterId').equals(litterId).delete();
      const photoIds = kittens
        .map((kitten) => kitten.photoAttachmentId)
        .filter((id): id is ID => Boolean(id));
      if (photoIds.length > 0) await db.attachments.bulkDelete(photoIds);
      await db.litters.delete(litterId);
    },
  );
}

/* ------------------------------------------------------------------ */
/*  Geburtsprotokoll                                                   */
/* ------------------------------------------------------------------ */

/** Ein Protokolleintrag. Alles liegt sofort in der Datenbank — nichts im Speicher. */
export async function addBirthEvent(
  litterId: ID,
  kind: BirthEventKind,
  options: { note?: string; kittenId?: ID; at?: ISODateTime } = {},
): Promise<void> {
  await insertPlain(db.birthEvents, {
    litterId,
    at: options.at ?? nowISO(),
    kind,
    kittenId: options.kittenId,
    note: options.note?.trim() || undefined,
  });
}

/* ------------------------------------------------------------------ */
/*  Fahrplan                                                           */
/* ------------------------------------------------------------------ */

/** Hakt einen Fahrplan-Punkt ab oder nimmt das Häkchen wieder weg. */
export async function toggleTaskDone(taskId: ID, done: boolean): Promise<void> {
  await patch(db.careTasks, taskId, { doneAt: done ? todayISO() : undefined });
}
