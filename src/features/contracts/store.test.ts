import { beforeEach, describe, expect, it } from 'vitest';

import { db, insert, putAttachment, wipeDatabase } from '../../db/db';
import { vorgangAnlegen } from './breedingUse';
import { vertragAktualisieren, vertragMitPdfLoeschen } from './store';

beforeEach(async () => {
  await wipeDatabase();
});

describe('Vertrag löschen', () => {
  it('löscht Vertrag und PDF gemeinsam, lässt den eigenständigen Vorgang aber vollständig bestehen', async () => {
    const pdf = await putAttachment(new Blob(['PDF'], { type: 'application/pdf' }));
    const vertrag = await insert(db.contracts, {
      type: 'breeding_reserved',
      data: {
        type: 'breeding_reserved',
        buyers: [{ name: 'Anna Muster', sex: 'female' }],
        animals: [
          { name: 'Mia', sex: 'female' },
          { name: 'Nala', sex: 'female' },
        ],
        breed: 'Russisch Blau',
        discountCents: 138_000,
        backPaymentDays: 14,
      },
      pdfAttachmentId: pdf.id,
    });
    const vorgang = await vorgangAnlegen(vertrag);

    await vertragMitPdfLoeschen(vertrag);

    expect(await db.contracts.get(vertrag.id)).toBeUndefined();
    expect(await db.attachments.get(pdf.id)).toBeUndefined();
    expect(await db.breedingUses.get(vorgang!.id)).toMatchObject({
      catName: 'Mia und Nala',
      discountCents: 138_000,
      backPaymentDays: 14,
    });
  });
});

describe('Vertrag aktualisieren', () => {
  it('entfernt ein rechtlich veraltetes PDF, sobald sich Vertragsdaten ändern', async () => {
    const pdf = await putAttachment(new Blob(['alter Stand'], { type: 'application/pdf' }));
    const vertrag = await insert(db.contracts, {
      type: 'standard',
      data: {
        type: 'standard',
        buyers: [{ name: 'Anna Alt', sex: 'female' }],
        animals: [{ name: 'Mia', sex: 'female' }],
        breed: 'Russisch Blau',
      },
      pdfAttachmentId: pdf.id,
    });

    const data = {
      ...vertrag.data,
      buyers: [{ name: 'Anna Neu', sex: 'female' as const }],
    };
    const aktualisiert = await vertragAktualisieren(vertrag, 'standard', data);

    expect(aktualisiert.pdfAttachmentId).toBeUndefined();
    expect((await db.contracts.get(vertrag.id))?.pdfAttachmentId).toBeUndefined();
    expect((await db.contracts.get(vertrag.id))?.data.buyers[0].name).toBe('Anna Neu');
    expect(await db.attachments.get(pdf.id)).toBeUndefined();
  });

  it('behält das PDF, wenn derselbe Vertragsstand nur erneut gespeichert wird', async () => {
    const pdf = await putAttachment(new Blob(['aktueller Stand'], { type: 'application/pdf' }));
    const vertrag = await insert(db.contracts, {
      type: 'standard',
      data: {
        type: 'standard',
        buyers: [{ name: 'Anna Muster', sex: 'female' }],
        animals: [{ name: 'Mia', sex: 'female' }],
        breed: 'Russisch Blau',
      },
      pdfAttachmentId: pdf.id,
    });

    const aktualisiert = await vertragAktualisieren(vertrag, vertrag.type, vertrag.data);

    expect(aktualisiert.pdfAttachmentId).toBe(pdf.id);
    expect((await db.contracts.get(vertrag.id))?.pdfAttachmentId).toBe(pdf.id);
    expect(await db.attachments.get(pdf.id)).toBeDefined();
  });
});
