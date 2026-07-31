/**
 * Schreibende Vorgänge des Katzen-Moduls, deren Nebenwirkungen über die
 * eigentlichen Stammdaten hinausreichen.
 */

import { db, patch } from '../../db/db';
import type { Cat, ID } from '../../types';

/** Wird ausgelöst, wenn ein Tier noch als Mutter oder Vater an Würfen hängt. */
export class CatHasLittersError extends Error {
  readonly litterCount: number;

  constructor(litterCount: number) {
    super('Die Katze ist noch mit Würfen verknüpft.');
    this.name = 'CatHasLittersError';
    this.litterCount = litterCount;
  }
}

/**
 * Löscht ein Tier mitsamt seinen rein operativen Kinddaten.
 *
 * Historische Termine, Unterlagen, Kosten, Verträge und
 * Zuchtnutzungsvorgänge bleiben erhalten. Nur ihre nicht mehr gültige
 * Stammdaten-Verknüpfung wird atomar gelöst.
 */
export async function deleteCatWithReferences(cat: Cat): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.cats,
      db.litters,
      db.heatCycles,
      db.healthTests,
      db.catWeights,
      db.careTasks,
      db.appointments,
      db.documents,
      db.contracts,
      db.breedingUses,
      db.costs,
      db.attachments,
    ],
    async () => {
      // Noch einmal in derselben Transaktion prüfen: Die Anzeige im Editor
      // kann zwischenzeitlich veraltet sein.
      const [asMother, asFather] = await Promise.all([
        db.litters.where('motherId').equals(cat.id).count(),
        db.litters.where('fatherId').equals(cat.id).count(),
      ]);
      const litterCount = asMother + asFather;
      if (litterCount > 0) throw new CatHasLittersError(litterCount);

      const appointments = await db.appointments.where('catId').equals(cat.id).toArray();
      for (const appointment of appointments) {
        await patch(db.appointments, appointment.id, { catId: undefined });
      }

      const documents = await db.documents.where('catId').equals(cat.id).toArray();
      for (const document of documents) {
        await patch(db.documents, document.id, { catId: undefined });
      }

      const costs = await db.costs.where('catId').equals(cat.id).toArray();
      for (const cost of costs) {
        await patch(db.costs, cost.id, { catId: undefined });
      }

      const breedingUses = await db.breedingUses.where('catId').equals(cat.id).toArray();
      for (const breedingUse of breedingUses) {
        await patch(db.breedingUses, breedingUse.id, { catId: undefined });
      }

      // catId ist nur die interne Zuordnung. Name, Geschlecht und alle
      // Vertragsinhalte bleiben unverändert; ein vorhandenes PDF bleibt daher
      // weiterhin inhaltlich aktuell.
      const contracts = (await db.contracts.toArray()).filter((contract) =>
        contract.data.animals.some((animal) => animal.catId === cat.id),
      );
      for (const contract of contracts) {
        await patch(db.contracts, contract.id, {
          data: {
            ...contract.data,
            animals: contract.data.animals.map((animal) =>
              animal.catId === cat.id ? { ...animal, catId: undefined } : animal,
            ),
          },
        });
      }

      await db.heatCycles.where('catId').equals(cat.id).delete();
      await db.healthTests.where('catId').equals(cat.id).delete();
      await db.catWeights.where('catId').equals(cat.id).delete();
      await db.careTasks.where('catId').equals(cat.id).delete();
      await db.cats.delete(cat.id);

      if (cat.photoAttachmentId) {
        await db.attachments.delete(cat.photoAttachmentId as ID);
      }
    },
  );
}
