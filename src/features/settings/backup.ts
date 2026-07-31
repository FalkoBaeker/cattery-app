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
import { clearSettingsCache, db, wipeDatabase } from '../../db/db';
import { nowISO } from '../../lib/date';

/* ------------------------------------------------------------------ */
/*  Format                                                             */
/* ------------------------------------------------------------------ */

export const BACKUP_FORMAT = 'cattery-backup';
export const BACKUP_VERSION = 1;

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
  };
}

export function decodeAttachment(b: BackupAttachment): Attachment {
  const bytes = base64ToBytes(b.data ?? '');
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
  if (typeof version !== 'number' || !Number.isFinite(version) || version < 1) {
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
      // Eine ältere Sicherung darf jüngere Tabellen nicht kennen.
      tables[name] = [];
      continue;
    }
    if (!Array.isArray(value)) {
      return {
        ok: false,
        error: `Der Abschnitt „${BACKUP_TABLE_LABEL[name]}" in der Datei ist beschädigt.`,
      };
    }
    tables[name] = value;
  }

  const rawAttachments = raw.attachments;
  if (rawAttachments !== undefined && !Array.isArray(rawAttachments)) {
    return { ok: false, error: 'Der Abschnitt „Anhänge" in der Datei ist beschädigt.' };
  }
  const attachments = ((rawAttachments as unknown[]) ?? []).filter(
    (a): a is BackupAttachment => isRecord(a) && typeof a.id === 'string' && typeof a.data === 'string',
  );

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowISO(),
    tables,
    attachments,
  };

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
 */
export async function restoreBackup(file: BackupFile, onProgress?: ProgressFn): Promise<void> {
  const total = BACKUP_TABLE_NAMES.length + Math.ceil(file.attachments.length / ATTACHMENT_CHUNK);
  let done = 0;

  onProgress?.({ phase: 'restoring', done, total, label: 'Vorhandene Daten werden geleert' });
  await wipeDatabase();

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

  for (let i = 0; i < file.attachments.length; i += ATTACHMENT_CHUNK) {
    const block = file.attachments.slice(i, i + ATTACHMENT_CHUNK);
    await db.attachments.bulkPut(block.map(decodeAttachment));
    done += 1;
    onProgress?.({
      phase: 'restoring',
      done,
      total,
      label: `${Math.min(i + ATTACHMENT_CHUNK, file.attachments.length)} von ${file.attachments.length} Anhängen`,
    });
    await breathe();
  }

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
        // Abbruch durch die Nutzerin ist kein Fehler — dann eben Download.
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
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
