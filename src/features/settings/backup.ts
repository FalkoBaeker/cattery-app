/**
 * Sicherung und Wiederherstellung.
 *
 * Es gibt keinen Server. Alles liegt in IndexedDB auf genau einem iPhone.
 * Geht das Gerät verloren oder wird es zurückgesetzt, sind die Daten weg —
 * es sei denn, es liegt eine Sicherungsdatei in iCloud Drive.
 *
 * Die Sicherung ist **eine** Datei: alle Tabellen als JSON, Anhänge als
 * Base64 im selben Dokument. Anhänge können groß sein, deshalb wird in
 * Blöcken gearbeitet und zwischendurch an den Browser zurückgegeben —
 * sonst friert die Oberfläche ein.
 */

import type { Table } from 'dexie';
import type { Attachment, ISODateTime } from '../../types';
import {
  APPOINTMENT_KIND_LABEL,
  BIRTH_EVENT_LABEL,
  BREEDING_USE_STAGE_LABEL,
  CARE_TASK_LABEL,
  CAT_STATUS_LABEL,
  COLLAR_COLORS,
  CONTACT_CHANNEL_LABEL,
  CONTRACT_TYPE_LABEL,
  COST_CATEGORY_LABEL,
  DOCUMENT_KIND_LABEL,
  HEALTH_TEST_LABEL,
  INTEREST_STATUS_LABEL,
  KITTEN_SALE_STATUS_LABEL,
  LITTER_STATUS_LABEL,
  MODULE_LABEL,
  WISH_SEX_LABEL,
} from '../../types';
import { clearSettingsCache, db } from '../../db/db';
import { nowISO } from '../../lib/date';
import { BROADCAST_KEY, isBroadcastRun } from '../waitlist/order';

/* ------------------------------------------------------------------ */
/*  Format                                                             */
/* ------------------------------------------------------------------ */

export const BACKUP_FORMAT = 'cattery-backup';
export const BACKUP_VERSION = 2;

/** Alle Tabellen außer `attachments` — die werden gesondert behandelt. */
export const BACKUP_TABLE_NAMES = [
  'cats',
  'heatCycles',
  'healthTests',
  'litters',
  'birthEvents',
  'kittens',
  'weights',
  'catWeights',
  'careTasks',
  'interests',
  'interestNotes',
  'appointments',
  'documents',
  'contracts',
  'breedingUses',
  'costs',
  'revenues',
  'settings',
  'notificationLog',
] as const;

export type BackupTableName = (typeof BACKUP_TABLE_NAMES)[number];

export const BACKUP_TABLE_LABEL: Record<BackupTableName | 'attachments', string> = {
  cats: 'Zuchttiere',
  heatCycles: 'Rolligkeiten',
  healthTests: 'Gesundheitstests',
  litters: 'Würfe',
  birthEvents: 'Geburtsprotokolle',
  kittens: 'Kitten',
  weights: 'Kitten-Gewichte',
  catWeights: 'Gewichte der Zuchttiere',
  careTasks: 'Fahrplan-Punkte',
  interests: 'Interessenten',
  interestNotes: 'Notizen zu Interessenten',
  appointments: 'Termine',
  documents: 'Dokumente',
  contracts: 'Verträge',
  breedingUses: 'Zuchtnutzungs-Vorgänge',
  costs: 'Kosten',
  revenues: 'Erlöse',
  settings: 'Einstellungen',
  notificationLog: 'Erinnerungs-Protokoll',
  attachments: 'Anhänge (Fotos, PDFs)',
};

/** Ein Anhang in der Sicherungsdatei — Binärdaten als Base64. */
export interface BackupAttachment {
  id: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  createdAt: ISODateTime;
  /** Base64 ohne Präfix. */
  data: string;
  /** SHA-256 der dekodierten Binärdaten, hexadezimal. Seit Formatversion 2 Pflicht. */
  sha256?: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: ISODateTime;
  tables: Record<BackupTableName, unknown[]>;
  attachments: BackupAttachment[];
}

/* ------------------------------------------------------------------ */
/*  Fortschritt                                                        */
/* ------------------------------------------------------------------ */

export type BackupPhase = 'tables' | 'attachments' | 'writing' | 'restoring' | 'done';

export interface BackupProgress {
  phase: BackupPhase;
  /** Erledigte Schritte. */
  done: number;
  /** Schritte insgesamt; 0 = unbekannt. */
  total: number;
  /** Kurzer deutscher Text für die Oberfläche. */
  label: string;
}

export type ProgressFn = (p: BackupProgress) => void;

/** Gibt die Kontrolle kurz an den Browser zurück, damit er zeichnen kann. */
function breathe(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* ------------------------------------------------------------------ */
/*  Base64                                                             */
/* ------------------------------------------------------------------ */

/** Ganze Zeichenketten auf einmal sprengen den Aufrufstapel — also blockweise. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------ */
/*  Anhänge                                                            */
/* ------------------------------------------------------------------ */

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 ist in diesem Browser nicht verfügbar.');
  }
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', source));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function encodeAttachment(a: Attachment): Promise<BackupAttachment> {
  const buffer = await a.blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return {
    id: a.id,
    mime: a.mime || 'application/octet-stream',
    bytes: bytes.length,
    width: a.width,
    height: a.height,
    createdAt: a.createdAt,
    data: bytesToBase64(bytes),
    sha256: await sha256Hex(bytes),
  };
}

export async function decodeAttachment(b: BackupAttachment): Promise<Attachment> {
  const bytes = base64ToBytes(b.data ?? '');
  if (bytes.length !== b.bytes) {
    throw new Error(`Der Anhang „${b.id}" hat nicht die erwartete Größe.`);
  }
  if (b.sha256 && (await sha256Hex(bytes)) !== b.sha256.toLowerCase()) {
    throw new Error(`Der Anhang „${b.id}" ist beschädigt.`);
  }
  const mime = b.mime || 'application/octet-stream';
  return {
    id: b.id,
    blob: new Blob([bytes as unknown as BlobPart], { type: mime }),
    mime,
    bytes: bytes.length,
    width: b.width,
    height: b.height,
    createdAt: b.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/*  Sicherung erstellen                                                */
/* ------------------------------------------------------------------ */

/** Wie viele Anhänge auf einmal umgewandelt werden, bevor durchgeatmet wird. */
const ATTACHMENT_CHUNK = 3;

export async function createBackup(onProgress?: ProgressFn): Promise<BackupFile> {
  const tables = {} as Record<BackupTableName, unknown[]>;

  const totalTables = BACKUP_TABLE_NAMES.length;
  let doneTables = 0;

  for (const name of BACKUP_TABLE_NAMES) {
    const table = db.table(name) as Table<unknown, unknown>;
    tables[name] = await table.toArray();
    doneTables += 1;
    onProgress?.({
      phase: 'tables',
      done: doneTables,
      total: totalTables,
      label: `${BACKUP_TABLE_LABEL[name]} gelesen`,
    });
  }

  // Anhänge einzeln und in Blöcken — hier liegen die großen Datenmengen.
  const ids = (await db.attachments.toCollection().primaryKeys()) as string[];
  const attachments: BackupAttachment[] = [];

  onProgress?.({
    phase: 'attachments',
    done: 0,
    total: ids.length,
    label: ids.length === 0 ? 'Keine Anhänge' : `0 von ${ids.length} Anhängen`,
  });

  for (let i = 0; i < ids.length; i += ATTACHMENT_CHUNK) {
    const block = ids.slice(i, i + ATTACHMENT_CHUNK);
    for (const id of block) {
      const record = await db.attachments.get(id);
      if (!record) continue;
      attachments.push(await encodeAttachment(record));
    }
    onProgress?.({
      phase: 'attachments',
      done: Math.min(i + ATTACHMENT_CHUNK, ids.length),
      total: ids.length,
      label: `${Math.min(i + ATTACHMENT_CHUNK, ids.length)} von ${ids.length} Anhängen`,
    });
    await breathe();
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: nowISO(),
    tables,
    attachments,
  };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file);
}

/** „cattery-sicherung-2026-07-31.json" */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `cattery-sicherung-${date}.json`;
}

/* ------------------------------------------------------------------ */
/*  Sicherung lesen und prüfen                                         */
/* ------------------------------------------------------------------ */

export interface BackupSummaryRow {
  label: string;
  count: number;
}

export type BackupParseResult =
  | { ok: true; file: BackupFile; summary: BackupSummaryRow[]; itemCount: number }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function base64ByteLength(value: string): number | undefined {
  if (value === '') return 0;
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return undefined;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function parseAttachments(
  raw: unknown,
  version: number,
): { ok: true; attachments: BackupAttachment[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'Der Abschnitt „Anhänge" in der Datei fehlt oder ist beschädigt.' };
  }

  const attachments: BackupAttachment[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    const label = `Anhang ${index + 1}`;
    if (!isRecord(value)) {
      return { ok: false, error: `${label} in der Sicherung ist beschädigt.` };
    }

    const { id, mime, bytes, width, height, createdAt, data, sha256 } = value;
    if (
      typeof id !== 'string' ||
      id.trim() === '' ||
      typeof mime !== 'string' ||
      mime.trim() === '' ||
      typeof bytes !== 'number' ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      typeof createdAt !== 'string' ||
      createdAt.trim() === '' ||
      typeof data !== 'string'
    ) {
      return { ok: false, error: `${label} in der Sicherung ist unvollständig oder beschädigt.` };
    }
    if (
      (width !== undefined &&
        (typeof width !== 'number' || !Number.isFinite(width) || width <= 0)) ||
      (height !== undefined &&
        (typeof height !== 'number' || !Number.isFinite(height) || height <= 0))
    ) {
      return { ok: false, error: `${label} enthält ungültige Bildmaße.` };
    }

    const decodedLength = base64ByteLength(data);
    if (decodedLength === undefined || decodedLength !== bytes) {
      return { ok: false, error: `${label} in der Sicherung ist beschädigt.` };
    }
    if (ids.has(id)) {
      return { ok: false, error: `Der Anhang „${id}" kommt in der Sicherung doppelt vor.` };
    }
    ids.add(id);

    if (
      (sha256 !== undefined && (typeof sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(sha256))) ||
      (version >= 2 && typeof sha256 !== 'string')
    ) {
      return { ok: false, error: `${label} hat keine gültige Prüfsumme.` };
    }

    attachments.push({
      id,
      mime,
      bytes,
      width: width as number | undefined,
      height: height as number | undefined,
      createdAt,
      data,
      sha256: typeof sha256 === 'string' ? sha256.toLowerCase() : undefined,
    });
  }

  return { ok: true, attachments };
}

/* ------------------------------------------------------------------ */
/*  Datensatz- und Referenzprüfung                                     */
/* ------------------------------------------------------------------ */

type ValueCheck = (value: unknown) => boolean;
type FieldRule = ValueCheck | { optional: ValueCheck };
type RowSchema = Record<string, FieldRule>;

const isString: ValueCheck = (value) => typeof value === 'string';
const isId: ValueCheck = (value) => typeof value === 'string' && value.trim() !== '';
const isBoolean: ValueCheck = (value) => typeof value === 'boolean';
const isFiniteNumber: ValueCheck = (value) =>
  typeof value === 'number' && Number.isFinite(value);
const isSafeInteger: ValueCheck = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value);
const isNonNegativeInteger: ValueCheck = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isPositiveInteger: ValueCheck = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isPositiveNumber: ValueCheck = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function optional(check: ValueCheck): FieldRule {
  return { optional: check };
}

function oneOf(values: readonly string[]): ValueCheck {
  const allowed = new Set(values);
  return (value) => typeof value === 'string' && allowed.has(value);
}

function isISODate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isISODateTime(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.includes('T') &&
    isISODate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}

function isArrayOf(check: ValueCheck): ValueCheck {
  return (value) => Array.isArray(value) && value.every(check);
}

const isIdArray: ValueCheck = (value) =>
  Array.isArray(value) &&
  value.every(isId) &&
  new Set(value as string[]).size === value.length;

function matchesSchema(value: unknown, schema: RowSchema): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const allowed = new Set(Object.keys(schema));
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  for (const [key, rule] of Object.entries(schema)) {
    if (typeof rule === 'function') {
      if (!rule(value[key])) return false;
    } else if (value[key] !== undefined && !rule.optional(value[key])) {
      return false;
    }
  }
  return true;
}

const timestamped: RowSchema = {
  id: isId,
  createdAt: isISODateTime,
  updatedAt: isISODateTime,
};

const sex = oneOf(['male', 'female']);
const sexOrUnknown = oneOf(['male', 'female', 'unknown']);
const collarColor = oneOf(COLLAR_COLORS.map((color) => color.key));

function isContractParty(value: unknown): boolean {
  return matchesSchema(value, {
    name: isString,
    address: optional(isString),
    birthDate: optional(isISODate),
    sex: optional(sex),
  });
}

function isContractAnimal(value: unknown): boolean {
  return matchesSchema(value, {
    kittenId: optional(isId),
    catId: optional(isId),
    name: isString,
    sex,
    birthDate: optional(isISODate),
    chipNo: optional(isString),
  });
}

function isContractData(value: unknown): boolean {
  return matchesSchema(value, {
    type: oneOf(Object.keys(CONTRACT_TYPE_LABEL)),
    buyers: isArrayOf(isContractParty),
    animals: isArrayOf(isContractAnimal),
    breed: isString,
    totalPriceCents: optional(isSafeInteger),
    depositCents: optional(isSafeInteger),
    handoverText: optional(isString),
    handoverPlace: optional(isString),
    regularPriceCents: optional(isSafeInteger),
    discountCents: optional(isSafeInteger),
    breedingUseStartDate: optional(isISODate),
    breedingUseMonths: optional(isPositiveInteger),
    breedingUseExtensionMonths: optional(isNonNegativeInteger),
    handoverDeadlineDays: optional(isNonNegativeInteger),
    matingAttempts: optional(isPositiveInteger),
    backPaymentDays: optional(isNonNegativeInteger),
    signPlace: optional(isString),
    signDate: optional(isISODate),
    additionalAgreement: optional(isString),
  });
}

function isBreedingHistory(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) =>
      matchesSchema(entry, {
        stage: oneOf(Object.keys(BREEDING_USE_STAGE_LABEL)),
        at: isISODateTime,
        note: optional(isString),
      }),
    )
  );
}

function isSeller(value: unknown): boolean {
  return matchesSchema(value, {
    name: isString,
    address: isString,
    birthDate: optional(isISODate),
    iban: optional(isString),
    place: optional(isString),
    catteryName: optional(isString),
    clubName: isString,
  });
}

function isWeightSettings(value: unknown): boolean {
  return matchesSchema(value, {
    goodGainG: isFiniteNumber,
    watchGainG: isFiniteNumber,
    concernBirthWeightG: isPositiveNumber,
    belowLitterAvgPercent: isFiniteNumber,
    typicalBirthWeightG: isPositiveNumber,
  });
}

function isScheduleSettings(value: unknown): boolean {
  return matchesSchema(value, {
    dewormingWeeks: isArrayOf(isNonNegativeInteger),
    vaccinationWeeks: isArrayOf(isNonNegativeInteger),
    chipWeek: isNonNegativeInteger,
    neuterWeek: isNonNegativeInteger,
    litterRegistrationWeek: isNonNegativeInteger,
    handoverWeek: isNonNegativeInteger,
    reminderLeadDays: isNonNegativeInteger,
    dewormingDrug: optional(isString),
  });
}

function isModules(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(MODULE_LABEL).every((key) => typeof value[key] === 'boolean')
  );
}

const ROW_SCHEMAS = {
  cats: {
    ...timestamped,
    callName: isId,
    catteryName: optional(isString),
    sex,
    birthDate: optional(isISODate),
    breed: isString,
    emsCode: optional(isString),
    registrationNo: optional(isString),
    chipNo: optional(isString),
    bloodGroup: optional(isString),
    breederName: optional(isString),
    status: oneOf(Object.keys(CAT_STATUS_LABEL)),
    isOwn: isBoolean,
    pedigreeDocumentId: optional(isId),
    inbreedingPercent: optional(isFiniteNumber),
    photoAttachmentId: optional(isId),
    notes: optional(isString),
  },
  heatCycles: {
    ...timestamped,
    catId: isId,
    startDate: isISODate,
    endDate: optional(isISODate),
    notes: optional(isString),
  },
  healthTests: {
    ...timestamped,
    catId: isId,
    kind: oneOf(Object.keys(HEALTH_TEST_LABEL)),
    label: optional(isString),
    date: isISODate,
    result: optional(isString),
    validMonths: optional(isNonNegativeInteger),
    nextDueDate: optional(isISODate),
    documentId: optional(isId),
    notes: optional(isString),
  },
  litters: {
    ...timestamped,
    motherId: isId,
    fatherId: optional(isId),
    fatherExternalName: optional(isString),
    matingDate: optional(isISODate),
    dueDate: optional(isISODate),
    birthDate: optional(isISODate),
    status: oneOf(Object.keys(LITTER_STATUS_LABEL)),
    notes: optional(isString),
  },
  birthEvents: {
    id: isId,
    litterId: isId,
    at: isISODateTime,
    kind: oneOf(Object.keys(BIRTH_EVENT_LABEL)),
    kittenId: optional(isId),
    note: optional(isString),
  },
  kittens: {
    ...timestamped,
    litterId: isId,
    collarColor,
    callName: optional(isString),
    sex: sexOrUnknown,
    birthWeightG: optional(isPositiveNumber),
    bornAt: optional(isISODateTime),
    stillborn: isBoolean,
    chipNo: optional(isString),
    saleStatus: oneOf(Object.keys(KITTEN_SALE_STATUS_LABEL)),
    interestId: optional(isId),
    priceCents: optional(isSafeInteger),
    diedAt: optional(isISODate),
    deathNote: optional(isString),
    photoAttachmentId: optional(isId),
    notes: optional(isString),
  },
  weights: {
    id: isId,
    kittenId: isId,
    at: isISODateTime,
    grams: isPositiveNumber,
    note: optional(isString),
  },
  catWeights: {
    id: isId,
    catId: isId,
    at: isISODateTime,
    grams: isPositiveNumber,
    note: optional(isString),
  },
  careTasks: {
    ...timestamped,
    kind: oneOf(Object.keys(CARE_TASK_LABEL)),
    title: isString,
    dueDate: isISODate,
    doneAt: optional(isISODate),
    litterId: optional(isId),
    kittenId: optional(isId),
    catId: optional(isId),
    autoGenerated: isBoolean,
    planKey: optional(isString),
    detail: optional(isString),
    skipped: optional(isBoolean),
  },
  interests: {
    ...timestamped,
    name: isId,
    phone: optional(isString),
    email: optional(isString),
    city: optional(isString),
    source: optional(isString),
    wishSex: oneOf(Object.keys(WISH_SEX_LABEL)),
    wishTimeframe: optional(isString),
    allergySufferer: optional(isBoolean),
    hasOtherPets: optional(isBoolean),
    hasChildren: optional(isBoolean),
    outdoorPlanned: optional(isBoolean),
    householdNote: optional(isString),
    offeredPriceCents: optional(isSafeInteger),
    status: oneOf(Object.keys(INTEREST_STATUS_LABEL)),
    sortIndex: isSafeInteger,
    kittenId: optional(isId),
    notes: optional(isString),
    deletedAt: optional(isISODateTime),
  },
  interestNotes: {
    id: isId,
    interestId: isId,
    at: isISODateTime,
    channel: oneOf(Object.keys(CONTACT_CHANNEL_LABEL)),
    text: isString,
  },
  appointments: {
    ...timestamped,
    kind: oneOf(Object.keys(APPOINTMENT_KIND_LABEL)),
    startAt: isISODateTime,
    durationMin: optional(isNonNegativeInteger),
    title: optional(isString),
    interestId: optional(isId),
    catId: optional(isId),
    litterId: optional(isId),
    kittenIds: optional(isIdArray),
    location: optional(isString),
    note: optional(isString),
    remind24h: isBoolean,
    remind1h: isBoolean,
    followUpDone: optional(isBoolean),
    doneAt: optional(isISODateTime),
    cancelledAt: optional(isISODateTime),
  },
  documents: {
    ...timestamped,
    kind: oneOf(Object.keys(DOCUMENT_KIND_LABEL)),
    title: isString,
    catId: optional(isId),
    kittenId: optional(isId),
    litterId: optional(isId),
    interestId: optional(isId),
    pageIds: isIdArray,
    customerVisible: isBoolean,
    notes: optional(isString),
  },
  contracts: {
    ...timestamped,
    type: oneOf(Object.keys(CONTRACT_TYPE_LABEL)),
    data: isContractData,
    pdfAttachmentId: optional(isId),
    litterId: optional(isId),
    interestId: optional(isId),
    notes: optional(isString),
  },
  breedingUses: {
    ...timestamped,
    contractId: isId,
    catId: optional(isId),
    kittenId: optional(isId),
    catName: isString,
    startDate: isISODate,
    months: isPositiveInteger,
    extensionMonths: isNonNegativeInteger,
    extendedAt: optional(isISODate),
    deadlineDate: isISODate,
    discountCents: optional(isSafeInteger),
    backPaymentDays: optional(isNonNegativeInteger),
    stage: oneOf(Object.keys(BREEDING_USE_STAGE_LABEL)),
    history: isBreedingHistory,
    notes: optional(isString),
  },
  costs: {
    ...timestamped,
    date: isISODate,
    category: oneOf(Object.keys(COST_CATEGORY_LABEL)),
    amountCents: isSafeInteger,
    litterId: optional(isId),
    catId: optional(isId),
    kittenId: optional(isId),
    note: optional(isString),
  },
  revenues: {
    ...timestamped,
    date: isISODate,
    amountCents: isSafeInteger,
    litterId: optional(isId),
    kittenId: optional(isId),
    note: optional(isString),
  },
  settings: {
    id: oneOf(['singleton']),
    seller: isSeller,
    breed: isString,
    gestationDays: isPositiveInteger,
    defaultKittenPriceCents: optional(isSafeInteger),
    maxLittersPerQueen: isPositiveInteger,
    maxLittersWithinMonths: isPositiveInteger,
    weight: isWeightSettings,
    schedule: isScheduleSettings,
    modules: isModules,
    theme: oneOf(['system', 'light', 'dark']),
    backupIntervalDays: isPositiveInteger,
    lastBackupAt: optional(isISODateTime),
    whatsappTemplate: optional(isString),
    onboardingDoneAt: optional(isISODateTime),
  },
  notificationLog: {
    key: isId,
    firedAt: isISODateTime,
    run: optional(isBroadcastRun),
  },
} satisfies Record<BackupTableName, RowSchema>;

function validateTableRows(
  name: BackupTableName,
  rows: unknown[],
): string | undefined {
  const ids = new Set<string>();
  const primaryKey = name === 'notificationLog' ? 'key' : 'id';

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!matchesSchema(row, ROW_SCHEMAS[name])) {
      return `Datensatz ${index + 1} im Abschnitt „${BACKUP_TABLE_LABEL[name]}" ist unvollständig oder beschädigt.`;
    }
    if (
      name === 'contracts' &&
      row.type !== (row.data as Record<string, unknown>).type
    ) {
      return `Datensatz ${index + 1} im Abschnitt „${BACKUP_TABLE_LABEL[name]}" enthält widersprüchliche Vertragsarten.`;
    }
    if (
      name === 'notificationLog' &&
      ((row.key === BROADCAST_KEY && !isBroadcastRun(row.run)) ||
        (row.key !== BROADCAST_KEY && row.run !== undefined))
    ) {
      return `Datensatz ${index + 1} im Abschnitt „${BACKUP_TABLE_LABEL[name]}" enthält einen beschädigten Versandfortschritt.`;
    }
    const id = row[primaryKey] as string;
    if (ids.has(id)) {
      return `Die Kennung „${id}" kommt im Abschnitt „${BACKUP_TABLE_LABEL[name]}" doppelt vor.`;
    }
    ids.add(id);
  }
  if (name === 'settings' && rows.length > 1) {
    return 'Die Sicherung enthält mehr als einen Einstellungs-Datensatz.';
  }
  return undefined;
}

function validateBackupReferences(
  tables: Record<BackupTableName, unknown[]>,
  attachments: BackupAttachment[],
): string | undefined {
  const rows = (name: BackupTableName) => tables[name] as Record<string, unknown>[];
  const ids = (name: BackupTableName, key = 'id') =>
    new Set(rows(name).map((row) => row[key] as string));

  const catIds = ids('cats');
  const litterIds = ids('litters');
  const kittenIds = ids('kittens');
  const interestIds = ids('interests');
  const documentIds = ids('documents');
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));

  function check(
    source: BackupTableName,
    targets: Set<string>,
    targetLabel: string,
    values: (row: Record<string, unknown>) => Array<string | undefined>,
  ): string | undefined {
    const sourceRows = rows(source);
    for (let index = 0; index < sourceRows.length; index += 1) {
      for (const value of values(sourceRows[index])) {
        if (value && !targets.has(value)) {
          return `Datensatz ${index + 1} im Abschnitt „${BACKUP_TABLE_LABEL[source]}" verweist auf ${targetLabel}, die nicht in der Sicherung enthalten sind.`;
        }
      }
    }
    return undefined;
  }

  const checks: Array<string | undefined> = [
    check('cats', documentIds, 'ein fehlendes Dokument', (row) => [
      row.pedigreeDocumentId as string | undefined,
    ]),
    check('cats', attachmentIds, 'ein fehlendes Foto', (row) => [
      row.photoAttachmentId as string | undefined,
    ]),
    check('heatCycles', catIds, 'ein fehlendes Zuchttier', (row) => [row.catId as string]),
    check('healthTests', catIds, 'ein fehlendes Zuchttier', (row) => [row.catId as string]),
    check('healthTests', documentIds, 'ein fehlendes Dokument', (row) => [
      row.documentId as string | undefined,
    ]),
    check('litters', catIds, 'ein fehlendes Zuchttier', (row) => [
      row.motherId as string,
      row.fatherId as string | undefined,
    ]),
    check('birthEvents', litterIds, 'einen fehlenden Wurf', (row) => [row.litterId as string]),
    check('birthEvents', kittenIds, 'ein fehlendes Kitten', (row) => [
      row.kittenId as string | undefined,
    ]),
    check('kittens', litterIds, 'einen fehlenden Wurf', (row) => [row.litterId as string]),
    check('kittens', interestIds, 'einen fehlenden Interessenten', (row) => [
      row.interestId as string | undefined,
    ]),
    check('kittens', attachmentIds, 'ein fehlendes Foto', (row) => [
      row.photoAttachmentId as string | undefined,
    ]),
    check('weights', kittenIds, 'ein fehlendes Kitten', (row) => [row.kittenId as string]),
    check('catWeights', catIds, 'ein fehlendes Zuchttier', (row) => [row.catId as string]),
    check('careTasks', litterIds, 'einen fehlenden Wurf', (row) => [
      row.litterId as string | undefined,
    ]),
    check('careTasks', kittenIds, 'ein fehlendes Kitten', (row) => [
      row.kittenId as string | undefined,
    ]),
    check('careTasks', catIds, 'ein fehlendes Zuchttier', (row) => [
      row.catId as string | undefined,
    ]),
    check('interests', kittenIds, 'ein fehlendes Kitten', (row) => [
      row.kittenId as string | undefined,
    ]),
    check('interestNotes', interestIds, 'einen fehlenden Interessenten', (row) => [
      row.interestId as string,
    ]),
    check('appointments', interestIds, 'einen fehlenden Interessenten', (row) => [
      row.interestId as string | undefined,
    ]),
    check('appointments', catIds, 'ein fehlendes Zuchttier', (row) => [
      row.catId as string | undefined,
    ]),
    check('appointments', litterIds, 'einen fehlenden Wurf', (row) => [
      row.litterId as string | undefined,
    ]),
    check('appointments', kittenIds, 'ein fehlendes Kitten', (row) =>
      (row.kittenIds as string[] | undefined) ?? [],
    ),
    check('documents', catIds, 'ein fehlendes Zuchttier', (row) => [
      row.catId as string | undefined,
    ]),
    check('documents', kittenIds, 'ein fehlendes Kitten', (row) => [
      row.kittenId as string | undefined,
    ]),
    check('documents', litterIds, 'einen fehlenden Wurf', (row) => [
      row.litterId as string | undefined,
    ]),
    check('documents', interestIds, 'einen fehlenden Interessenten', (row) => [
      row.interestId as string | undefined,
    ]),
    check('documents', attachmentIds, 'einen fehlenden Anhang', (row) =>
      row.pageIds as string[],
    ),
    check('contracts', litterIds, 'einen fehlenden Wurf', (row) => [
      row.litterId as string | undefined,
    ]),
    check('contracts', interestIds, 'einen fehlenden Interessenten', (row) => [
      row.interestId as string | undefined,
    ]),
    check('contracts', attachmentIds, 'ein fehlendes PDF', (row) => [
      row.pdfAttachmentId as string | undefined,
    ]),
    check('contracts', kittenIds, 'ein fehlendes Kitten', (row) =>
      ((row.data as Record<string, unknown>).animals as Record<string, unknown>[]).map(
        (animal) => animal.kittenId as string | undefined,
      ),
    ),
    check('contracts', catIds, 'ein fehlendes Zuchttier', (row) =>
      ((row.data as Record<string, unknown>).animals as Record<string, unknown>[]).map(
        (animal) => animal.catId as string | undefined,
      ),
    ),
    check('breedingUses', catIds, 'ein fehlendes Zuchttier', (row) => [
      row.catId as string | undefined,
    ]),
    check('breedingUses', kittenIds, 'ein fehlendes Kitten', (row) => [
      row.kittenId as string | undefined,
    ]),
    check('costs', litterIds, 'einen fehlenden Wurf', (row) => [
      row.litterId as string | undefined,
    ]),
    check('costs', catIds, 'ein fehlendes Zuchttier', (row) => [
      row.catId as string | undefined,
    ]),
    check('costs', kittenIds, 'ein fehlendes Kitten', (row) => [
      row.kittenId as string | undefined,
    ]),
    check('revenues', litterIds, 'einen fehlenden Wurf', (row) => [
      row.litterId as string | undefined,
    ]),
    check('revenues', kittenIds, 'ein fehlendes Kitten', (row) => [
      row.kittenId as string | undefined,
    ]),
  ];

  return checks.find((error) => error !== undefined);
}

/**
 * Prüft eine ausgewählte Datei, bevor irgendetwas ersetzt wird.
 * Alle Meldungen sind für die Züchterin geschrieben, nicht für Entwickler.
 */
export function parseBackup(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: 'Die Datei lässt sich nicht lesen. Vermutlich ist sie beschädigt oder es ist gar keine Sicherung.',
    };
  }

  if (!isRecord(raw)) {
    return { ok: false, error: 'Die Datei hat nicht den erwarteten Aufbau.' };
  }

  if (raw.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error: 'Das ist keine Sicherung dieser App.',
    };
  }

  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'In der Datei fehlt eine gültige Versionsangabe.' };
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `Diese Sicherung stammt aus einer neueren Version der App (Version ${version}). Bitte zuerst die App aktualisieren.`,
    };
  }

  if (!isRecord(raw.tables)) {
    return { ok: false, error: 'In der Datei fehlen die Daten.' };
  }

  const tables = {} as Record<BackupTableName, unknown[]>;
  for (const name of BACKUP_TABLE_NAMES) {
    const value = (raw.tables as Record<string, unknown>)[name];
    if (value === undefined) {
      return {
        ok: false,
        error: `In der Sicherung fehlt der Abschnitt „${BACKUP_TABLE_LABEL[name]}". Die Datei wird nicht eingespielt.`,
      };
    }
    if (!Array.isArray(value)) {
      return {
        ok: false,
        error: `Der Abschnitt „${BACKUP_TABLE_LABEL[name]}" in der Datei ist beschädigt.`,
      };
    }
    const rowError = validateTableRows(name, value);
    if (rowError) return { ok: false, error: rowError };
    tables[name] = value;
  }

  const parsedAttachments = parseAttachments(raw.attachments, version);
  if (!parsedAttachments.ok) return parsedAttachments;
  if (typeof raw.createdAt !== 'string' || raw.createdAt.trim() === '') {
    return { ok: false, error: 'In der Datei fehlt der Zeitpunkt der Sicherung.' };
  }

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version,
    createdAt: raw.createdAt,
    tables,
    attachments: parsedAttachments.attachments,
  };

  const referenceError = validateBackupReferences(file.tables, file.attachments);
  if (referenceError) return { ok: false, error: referenceError };

  return { ok: true, file, summary: summarizeBackup(file), itemCount: backupItemCount(file) };
}

/** Was steckt drin — für die Rückfrage vor dem Wiederherstellen. */
export function summarizeBackup(file: BackupFile): BackupSummaryRow[] {
  const rows: BackupSummaryRow[] = [];
  for (const name of BACKUP_TABLE_NAMES) {
    // Die Einstellungen sind genau ein Datensatz — das interessiert niemanden.
    if (name === 'settings' || name === 'notificationLog') continue;
    const count = file.tables[name]?.length ?? 0;
    if (count > 0) rows.push({ label: BACKUP_TABLE_LABEL[name], count });
  }
  if (file.attachments.length > 0) {
    rows.push({ label: BACKUP_TABLE_LABEL.attachments, count: file.attachments.length });
  }
  return rows;
}

export function backupItemCount(file: BackupFile): number {
  let total = 0;
  for (const name of BACKUP_TABLE_NAMES) total += file.tables[name]?.length ?? 0;
  return total + file.attachments.length;
}

/** Geschätzte Größe der Sicherung in Byte — für die Anzeige vor dem Teilen. */
export function backupByteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

/* ------------------------------------------------------------------ */
/*  Wiederherstellen                                                   */
/* ------------------------------------------------------------------ */

/**
 * Ersetzt **alles**. Der Aufrufer muss vorher doppelt zurückgefragt haben.
 *
 * Alles-oder-nichts: Zuerst werden sämtliche Anhänge außerhalb der
 * Datenbank entpackt (dort lauern die Fehler — kaputtes Base64, zu wenig
 * Speicher). Erst wenn alles im Speicher liegt, läuft **eine** Transaktion,
 * die leert und einspielt. Bricht irgendetwas ab, rollt Dexie zurück und
 * die bisherigen Daten bleiben unversehrt — niemals ein halber Stand.
 * Deshalb darf innerhalb der Transaktion auch kein `breathe()` stehen,
 * das würde sie beenden.
 */
export async function restoreBackup(file: BackupFile, onProgress?: ProgressFn): Promise<void> {
  // `restoreBackup` ist exportiert und wird in Tests auch direkt aufgerufen.
  // Deshalb gilt die Sicherheitsprüfung nicht nur für den üblichen Weg über
  // `parseBackup`: Kein Aufrufer darf semantisch kaputte Zeilen einspielen.
  for (const name of BACKUP_TABLE_NAMES) {
    const rows = (file.tables as Record<string, unknown>)[name];
    if (!Array.isArray(rows)) {
      throw new Error(`In der Sicherung fehlt der Abschnitt „${BACKUP_TABLE_LABEL[name]}".`);
    }
    const rowError = validateTableRows(name, rows);
    if (rowError) throw new Error(rowError);
  }
  const referenceError = validateBackupReferences(file.tables, file.attachments);
  if (referenceError) throw new Error(referenceError);

  const attachmentSteps = Math.ceil(file.attachments.length / ATTACHMENT_CHUNK);
  const total = attachmentSteps + BACKUP_TABLE_NAMES.length + 1;
  let done = 0;

  // Schritt 1: Anhänge entpacken — noch ohne jede Änderung an der Datenbank.
  const decoded: Attachment[] = [];
  for (let i = 0; i < file.attachments.length; i += ATTACHMENT_CHUNK) {
    const block = file.attachments.slice(i, i + ATTACHMENT_CHUNK);
    for (const b of block) decoded.push(await decodeAttachment(b));
    done += 1;
    onProgress?.({
      phase: 'restoring',
      done,
      total,
      label: `${Math.min(i + ATTACHMENT_CHUNK, file.attachments.length)} von ${file.attachments.length} Anhängen entpackt`,
    });
    await breathe();
  }

  // Schritt 2: eine einzige Transaktion — leeren und einspielen.
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));

    for (const name of BACKUP_TABLE_NAMES) {
      const rows = file.tables[name] ?? [];
      if (rows.length > 0) {
        const table = db.table(name) as Table<unknown, unknown>;
        await table.bulkPut(rows);
      }
      done += 1;
      onProgress?.({
        phase: 'restoring',
        done,
        total,
        label: `${BACKUP_TABLE_LABEL[name]} eingespielt`,
      });
    }

    if (decoded.length > 0) await db.attachments.bulkPut(decoded);
    done += 1;
    onProgress?.({ phase: 'restoring', done, total, label: 'Anhänge eingespielt' });
  });

  // Die Einstellungen liegen jetzt anders vor als im Zwischenspeicher.
  clearSettingsCache();
  onProgress?.({ phase: 'done', done: total, total, label: 'Fertig' });
}

/* ------------------------------------------------------------------ */
/*  Datei abgeben                                                      */
/* ------------------------------------------------------------------ */

export type DeliveryResult = 'geteilt' | 'heruntergeladen';

/**
 * Auf dem iPhone öffnet `navigator.share` das Teilen-Blatt — dort führt
 * „In Dateien sichern" nach iCloud Drive. Wo das fehlt, bleibt der
 * gewöhnliche Download.
 */
export async function deliverBackup(text: string, fileName: string): Promise<DeliveryResult> {
  const blob = new Blob([text], { type: 'application/json' });

  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (typeof File === 'function' && nav.share && nav.canShare) {
    const file = new File([blob], fileName, { type: 'application/json' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'Sicherung der Cattery-App' });
        return 'geteilt';
      } catch (error) {
        // Abbruch durch die Nutzerin: nach oben melden, damit die Oberfläche
        // „abgebrochen" sagt statt heimlich einen Download anzustoßen.
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        // Jeder andere Fehler beim Teilen: dann eben gewöhnlicher Download.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Etwas Luft lassen, sonst bricht Safari den Download ab.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'heruntergeladen';
}
