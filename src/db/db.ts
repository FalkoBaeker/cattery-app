/**
 * IndexedDB über Dexie. Die Datenbank ist die einzige Wahrheit —
 * es gibt keinen Server, keine Synchronisierung.
 *
 * Regeln für Modul-Entwickler:
 *  - Keine neuen Tabellen ohne Erhöhung von DB_VERSION und Eintrag in der
 *    Versionshistorie unten. Tabellen werden hier zentral definiert.
 *  - Schreibende Zugriffe immer über die Helfer `insert`, `patch`, `remove`,
 *    damit createdAt/updatedAt konsistent bleiben.
 *  - Blobs gehören ausschließlich in `attachments`, niemals in andere Tabellen.
 */

import Dexie, { type Table } from 'dexie';
import type {
  Appointment,
  Attachment,
  BirthEvent,
  BreedingUse,
  Cat,
  CatWeightEntry,
  CareTask,
  Contract,
  CostEntry,
  DocumentRec,
  HealthTest,
  HeatCycle,
  ID,
  Interest,
  InterestNote,
  Kitten,
  Litter,
  RevenueEntry,
  Settings,
  Timestamped,
  WeightEntry,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { newId } from '../lib/id';
import { nowISO } from '../lib/date';

export const DB_NAME = 'cattery';
export const DB_VERSION = 1;

/** Merker, welche geplanten Benachrichtigungen bereits ausgelöst wurden. */
export interface NotificationLogEntry {
  /** Stabiler Schlüssel, z. B. "appt:<id>:24h". */
  key: string;
  firedAt: string;
}

export class CatteryDB extends Dexie {
  cats!: Table<Cat, ID>;
  heatCycles!: Table<HeatCycle, ID>;
  healthTests!: Table<HealthTest, ID>;
  litters!: Table<Litter, ID>;
  birthEvents!: Table<BirthEvent, ID>;
  kittens!: Table<Kitten, ID>;
  weights!: Table<WeightEntry, ID>;
  catWeights!: Table<CatWeightEntry, ID>;
  careTasks!: Table<CareTask, ID>;
  interests!: Table<Interest, ID>;
  interestNotes!: Table<InterestNote, ID>;
  appointments!: Table<Appointment, ID>;
  documents!: Table<DocumentRec, ID>;
  attachments!: Table<Attachment, ID>;
  contracts!: Table<Contract, ID>;
  breedingUses!: Table<BreedingUse, ID>;
  costs!: Table<CostEntry, ID>;
  revenues!: Table<RevenueEntry, ID>;
  settings!: Table<Settings, string>;
  notificationLog!: Table<NotificationLogEntry, string>;

  constructor() {
    super(DB_NAME);

    // ---- Version 1 -------------------------------------------------
    this.version(1).stores({
      cats: 'id, sex, status, isOwn, callName',
      heatCycles: 'id, catId, startDate, [catId+startDate]',
      healthTests: 'id, catId, kind, nextDueDate, [catId+kind]',
      litters: 'id, motherId, fatherId, status, birthDate, dueDate',
      birthEvents: 'id, litterId, at, [litterId+at]',
      kittens: 'id, litterId, saleStatus, interestId, [litterId+collarColor]',
      weights: 'id, kittenId, at, [kittenId+at]',
      catWeights: 'id, catId, at, [catId+at]',
      careTasks:
        'id, kind, dueDate, doneAt, litterId, kittenId, catId, [litterId+planKey], [kittenId+planKey]',
      interests: 'id, status, sortIndex, deletedAt, kittenId, name',
      interestNotes: 'id, interestId, at, [interestId+at]',
      appointments: 'id, kind, startAt, interestId, catId, litterId, doneAt, cancelledAt',
      documents: 'id, kind, catId, kittenId, litterId, interestId, customerVisible',
      attachments: 'id, createdAt',
      contracts: 'id, type, litterId, interestId, createdAt',
      breedingUses: 'id, contractId, catId, kittenId, stage, deadlineDate',
      costs: 'id, date, category, litterId, catId, kittenId',
      revenues: 'id, date, litterId, kittenId',
      settings: 'id',
      notificationLog: 'key, firedAt',
    });
  }
}

export const db = new CatteryDB();

/* ------------------------------------------------------------------ */
/*  Schreibhelfer                                                      */
/* ------------------------------------------------------------------ */

/** Legt einen Datensatz mit Kennung und Zeitstempeln an und gibt ihn zurück. */
export async function insert<T extends Timestamped & { id: ID }>(
  table: Table<T, ID>,
  data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: ID },
): Promise<T> {
  const at = nowISO();
  const record = {
    ...(data as object),
    id: data.id ?? newId(),
    createdAt: at,
    updatedAt: at,
  } as T;
  await table.add(record);
  return record;
}

/** Aktualisiert Felder und setzt updatedAt. */
export async function patch<T extends Timestamped & { id: ID }>(
  table: Table<T, ID>,
  id: ID,
  changes: Partial<Omit<T, 'id' | 'createdAt'>>,
): Promise<void> {
  await table.update(id, { ...changes, updatedAt: nowISO() } as never);
}

export async function remove<T, K>(table: Table<T, K>, id: K): Promise<void> {
  await table.delete(id);
}

/** Für Datensätze ohne Zeitstempel (BirthEvent, WeightEntry …). */
export async function insertPlain<T extends { id: ID }>(
  table: Table<T, ID>,
  data: Omit<T, 'id'> & { id?: ID },
): Promise<T> {
  const record = { ...(data as object), id: data.id ?? newId() } as T;
  await table.add(record);
  return record;
}

/* ------------------------------------------------------------------ */
/*  Einstellungen                                                      */
/* ------------------------------------------------------------------ */

let settingsCache: Settings | null = null;

/** Liest die Einstellungen; legt beim ersten Aufruf die Vorgabewerte an. */
export async function getSettings(): Promise<Settings> {
  if (settingsCache) return settingsCache;
  const existing = await db.settings.get('singleton');
  if (existing) {
    // Fehlende Felder aus späteren Versionen ergänzen.
    const merged = mergeSettings(existing);
    settingsCache = merged;
    return merged;
  }
  await db.settings.put(DEFAULT_SETTINGS);
  settingsCache = DEFAULT_SETTINGS;
  return DEFAULT_SETTINGS;
}

export async function saveSettings(next: Settings): Promise<void> {
  settingsCache = next;
  await db.settings.put({ ...next, id: 'singleton' });
}

export async function updateSettings(changes: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...changes, id: 'singleton' as const };
  await saveSettings(next);
  return next;
}

/** Nur für Tests: Zwischenspeicher leeren. */
export function clearSettingsCache(): void {
  settingsCache = null;
}

/** Ergänzt fehlende Zweige, damit ältere Datenstände nicht abstürzen. */
function mergeSettings(stored: Settings): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    seller: { ...DEFAULT_SETTINGS.seller, ...stored.seller },
    weight: { ...DEFAULT_SETTINGS.weight, ...stored.weight },
    schedule: { ...DEFAULT_SETTINGS.schedule, ...stored.schedule },
    modules: { ...DEFAULT_SETTINGS.modules, ...stored.modules },
    id: 'singleton',
  };
}

/* ------------------------------------------------------------------ */
/*  Anhänge                                                            */
/* ------------------------------------------------------------------ */

export async function putAttachment(
  blob: Blob,
  meta?: { width?: number; height?: number },
): Promise<Attachment> {
  const record: Attachment = {
    id: newId(),
    blob,
    mime: blob.type || 'application/octet-stream',
    bytes: blob.size,
    width: meta?.width,
    height: meta?.height,
    createdAt: nowISO(),
  };
  await db.attachments.add(record);
  return record;
}

/**
 * Erzeugt eine Objekt-URL für einen Anhang. Der Aufrufer muss sie mit
 * URL.revokeObjectURL wieder freigeben, sonst leckt Speicher.
 */
export async function attachmentUrl(id: ID): Promise<string | null> {
  const a = await db.attachments.get(id);
  return a ? URL.createObjectURL(a.blob) : null;
}

/** Löscht Anhänge, auf die kein Dokument, Vertrag, Tier oder Kitten mehr zeigt. */
export async function collectOrphanAttachments(): Promise<ID[]> {
  const [docs, contracts, cats, kittens, all] = await Promise.all([
    db.documents.toArray(),
    db.contracts.toArray(),
    db.cats.toArray(),
    db.kittens.toArray(),
    db.attachments.toCollection().primaryKeys(),
  ]);
  const used = new Set<ID>();
  for (const d of docs) d.pageIds.forEach((p) => used.add(p));
  for (const c of contracts) if (c.pdfAttachmentId) used.add(c.pdfAttachmentId);
  for (const c of cats) if (c.photoAttachmentId) used.add(c.photoAttachmentId);
  for (const k of kittens) if (k.photoAttachmentId) used.add(k.photoAttachmentId);
  return (all as ID[]).filter((id) => !used.has(id));
}

/* ------------------------------------------------------------------ */
/*  Wartung                                                            */
/* ------------------------------------------------------------------ */

/** Leert alle Tabellen. Nur für Tests und den Zurücksetzen-Knopf. */
export async function wipeDatabase(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  clearSettingsCache();
}

/**
 * Bittet den Browser, die Daten dauerhaft zu behalten. Ohne das kann iOS
 * die Datenbank bei Speicherdruck verwerfen. Liefert true, wenn gewährt.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
