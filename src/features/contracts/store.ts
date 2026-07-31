/**
 * Persistenzoperationen für Verträge.
 *
 * Ein Zuchtnutzungs-Vorgang ist ein eigenständiger Frist- und Geldvorgang.
 * Er bleibt beim Löschen des Dokuments absichtlich erhalten; seine dafür
 * nötigen Werte liegen als Momentaufnahme am Vorgang selbst.
 */

import { db, patch } from '../../db/db';
import type { Contract, ContractData, ContractType } from '../../types';

function kanonisch(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(kanonisch);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, kanonisch(entry)]),
  );
}

/** Inhalt, der im gespeicherten PDF steht — Zeitstempel und Anhang zählen nicht dazu. */
function gleicherVertragsinhalt(
  contract: Contract,
  type: ContractType,
  data: ContractData,
): boolean {
  return (
    contract.type === type &&
    JSON.stringify(kanonisch(contract.data)) === JSON.stringify(kanonisch(data))
  );
}

/**
 * Aktualisiert einen Vertrag atomar. Ändert sich sein Inhalt, ist ein bereits
 * erzeugtes PDF rechtlich veraltet: Die Verknüpfung und der alte Blob werden
 * deshalb im selben Schreibvorgang entfernt.
 */
export async function vertragAktualisieren(
  contract: Contract,
  type: ContractType,
  data: ContractData,
): Promise<Contract> {
  const pdfIstVeraltet = !gleicherVertragsinhalt(contract, type, data);
  const altesPdf = pdfIstVeraltet ? contract.pdfAttachmentId : undefined;

  await db.transaction('rw', db.contracts, db.attachments, async () => {
    await patch(db.contracts, contract.id, {
      type,
      data,
      pdfAttachmentId: pdfIstVeraltet ? undefined : contract.pdfAttachmentId,
    });
    if (altesPdf) await db.attachments.delete(altesPdf);
  });

  return {
    ...contract,
    type,
    data,
    pdfAttachmentId: pdfIstVeraltet ? undefined : contract.pdfAttachmentId,
  };
}

/** Löscht Vertrag und zugehöriges PDF in einer einzigen Transaktion. */
export async function vertragMitPdfLoeschen(contract: Contract): Promise<void> {
  await db.transaction('rw', db.contracts, db.attachments, async () => {
    if (contract.pdfAttachmentId) await db.attachments.delete(contract.pdfAttachmentId);
    await db.contracts.delete(contract.id);
  });
}
