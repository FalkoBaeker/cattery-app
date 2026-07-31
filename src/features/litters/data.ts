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
  const previous = kitten.interestId;
  if (previous === interestId) return;

  await patch(db.kittens, kitten.id, { interestId });

  if (previous) {
    const old = await db.interests.get(previous);
    if (old?.kittenId === kitten.id) await patch(db.interests, previous, { kittenId: undefined });
  }
  if (interestId) {
    const next = await db.interests.get(interestId);
    if (next) await patch(db.interests, interestId, { kittenId: kitten.id });
  }
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

/** Löscht ein Kitten mitsamt Wiegungen, Protokolleinträgen und Aufgaben. */
export async function deleteKitten(kitten: Kitten, settings: Settings): Promise<void> {
  await db.weights.where('kittenId').equals(kitten.id).delete();
  await db.careTasks.where('kittenId').equals(kitten.id).delete();
  await db.birthEvents.where('litterId').equals(kitten.litterId).and((e) => e.kittenId === kitten.id).delete();
  if (kitten.interestId) {
    const interest = await db.interests.get(kitten.interestId);
    if (interest?.kittenId === kitten.id)
      await patch(db.interests, kitten.interestId, { kittenId: undefined });
  }
  await db.kittens.delete(kitten.id);
  await syncLitterSchedule(kitten.litterId, settings);
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
