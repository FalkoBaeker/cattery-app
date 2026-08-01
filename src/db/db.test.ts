import { beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupOrphanAttachments,
  db,
  mergeSettings,
  patchPlain,
  wipeDatabase,
} from './db';
import { DEFAULT_SETTINGS, type Attachment, type WeightEntry } from '../types';

function attachment(id: string, createdAt: string): Attachment {
  const blob = new Blob([id], { type: 'image/jpeg' });
  return {
    id,
    blob,
    mime: blob.type,
    bytes: blob.size,
    createdAt,
  };
}

beforeEach(async () => {
  await wipeDatabase();
});

describe('gemeinsame Datenbankhelfer', () => {
  it('ergänzt auch unvollständige Einstellungen vollständig', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(
      mergeSettings({
        ...DEFAULT_SETTINGS,
        seller: { ...DEFAULT_SETTINGS.seller, name: 'Test' },
        modules: { ...DEFAULT_SETTINGS.modules, costs: false },
      }),
    ).toMatchObject({
      id: 'singleton',
      seller: { name: 'Test' },
      modules: { costs: false, documents: true },
    });
  });

  it('hebt nur den alten Russisch-Blau-Standard für niedriges Geburtsgewicht auf 86 g an', () => {
    const legacy = {
      ...DEFAULT_SETTINGS,
      breed: 'Russisch Blau',
      weight: { ...DEFAULT_SETTINGS.weight, concernBirthWeightG: 80 },
    };
    expect(mergeSettings(legacy).weight.concernBirthWeightG).toBe(86);
    expect(
      mergeSettings({
        ...legacy,
        weight: { ...legacy.weight, concernBirthWeightG: 79 },
      }).weight.concernBirthWeightG,
    ).toBe(79);
  });

  it('ändert zeitstempellose Datensätze über patchPlain', async () => {
    const row: WeightEntry = {
      id: 'gewicht-1',
      kittenId: 'kitten-1',
      at: '2026-07-31T08:00:00.000Z',
      grams: 101,
    };
    await db.weights.add(row);
    await patchPlain(db.weights, row.id, { grams: 108, note: 'Abends' });
    await expect(db.weights.get(row.id)).resolves.toMatchObject({
      grams: 108,
      note: 'Abends',
    });
  });
});

describe('Bereinigung verwaister Anhänge', () => {
  it('löscht nur alte Waisen und bewahrt neue sowie verwendete Anhänge', async () => {
    await db.attachments.bulkAdd([
      attachment('alt-verwaist', '2000-01-01T00:00:00.000Z'),
      attachment('neu-verwaist', '2999-01-01T00:00:00.000Z'),
      attachment('verwendet', '2000-01-01T00:00:00.000Z'),
    ]);
    await db.cats.add({
      id: 'katze-1',
      callName: 'Mascha',
      sex: 'female',
      breed: 'Russisch Blau',
      status: 'active',
      isOwn: true,
      photoAttachmentId: 'verwendet',
      createdAt: '2026-07-31T08:00:00.000Z',
      updatedAt: '2026-07-31T08:00:00.000Z',
    });

    await expect(cleanupOrphanAttachments()).resolves.toBe(1);
    await expect(db.attachments.get('alt-verwaist')).resolves.toBeUndefined();
    await expect(db.attachments.get('neu-verwaist')).resolves.toBeDefined();
    await expect(db.attachments.get('verwendet')).resolves.toBeDefined();
  });
});
