/**
 * Der laufende Zuchtnutzungs-Vorgang aus Vertrag B.
 *
 * Die reine Logik (Statuskette, Frist, Erinnerungsstufen) steht hier ohne
 * React. Die Schreibzugriffe benutzen ausschließlich die Helfer aus
 * src/db/db.ts.
 */

import { db, insert, patch } from '../../db/db';
import { dateOf, nowISO, parseISODate, todayISO, toISODate } from '../../lib/date';
import type { BreedingUse, BreedingUseStage, Contract, ID, ISODate, ISODateTime } from '../../types';
import { BREEDING_USE_STAGE_ORDER } from '../../types';
import {
  fristende,
  VORGABE_NUTZUNGSMONATE,
  VORGABE_VERLAENGERUNGSMONATE,
} from './calc';
import { tierNamen, vertragsregelnAnwenden } from './helpers';

function vorgangsName(data: Contract['data']): string {
  const name = tierNamen(data);
  return name === 'ohne Tier' ? 'Katze' : name;
}

/* ------------------------------------------------------------------ */
/*  Statuskette                                                        */
/* ------------------------------------------------------------------ */

/** Position in der Kette. „Abgebrochen" steht außerhalb und liefert -1. */
export function stufenIndex(stage: BreedingUseStage): number {
  return BREEDING_USE_STAGE_ORDER.indexOf(stage);
}

/** Der nächste reguläre Schritt, oder null am Ende der Kette. */
export function naechsteStufe(stage: BreedingUseStage): BreedingUseStage | null {
  const i = stufenIndex(stage);
  if (i < 0) return null;
  return BREEDING_USE_STAGE_ORDER[i + 1] ?? null;
}

/** Abgebrochen und abgeschlossen zählen als beendet. */
export function istBeendet(stage: BreedingUseStage): boolean {
  return stage === 'closed' || stage === 'cancelled';
}

/**
 * Ab „Wurf da" ist die Zuchtnutzung durchgeführt — der Preisnachlass
 * ist damit endgültig verdient und die Frist spielt keine Rolle mehr.
 */
export function zuchtnutzungErfuellt(stage: BreedingUseStage): boolean {
  const i = stufenIndex(stage);
  return i >= stufenIndex('littered');
}

/** Ist die Katze gerade bei uns? */
export function beiUns(stage: BreedingUseStage): boolean {
  const i = stufenIndex(stage);
  return i >= stufenIndex('with_us') && i <= stufenIndex('littered');
}

/* ------------------------------------------------------------------ */
/*  Frist                                                              */
/* ------------------------------------------------------------------ */

/** Fristende aus den gespeicherten Feldern eines Vorgangs. */
export function deadlineVon(
  use: Pick<BreedingUse, 'startDate' | 'months' | 'extensionMonths' | 'extendedAt'>,
): ISODate {
  return fristende(use.startDate, use.months, use.extensionMonths, Boolean(use.extendedAt));
}

/* ------------------------------------------------------------------ */
/*  Schreiben                                                          */
/* ------------------------------------------------------------------ */

function ereignisZeitpunkt(at: ISODateTime): ISODateTime {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(at);
  const time = new Date(at).getTime();
  if (!match || !Number.isFinite(time) || toISODate(parseISODate(match[1])) !== match[1] ||
    Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) {
    throw new Error('Bitte einen gültigen Ereigniszeitpunkt eintragen.');
  }
  if (time > Date.now()) throw new Error('Das Ereignis darf nicht in der Zukunft liegen.');
  return new Date(at).toISOString();
}

/** Der Vorgang, der zu einem Vertrag gehört — falls es ihn schon gibt. */
export async function vorgangZuVertrag(contractId: ID): Promise<BreedingUse | undefined> {
  return db.breedingUses.where('contractId').equals(contractId).first();
}

/**
 * Legt den Vorgang zu einem Vertrag B an, sofern es noch keinen gibt.
 * Ohne Datum der erstmaligen Überlassung wird der heutige Tag benutzt —
 * das Feld lässt sich im Vorgang jederzeit korrigieren.
 */
export async function vorgangAnlegen(contract: Contract): Promise<BreedingUse | null> {
  if (contract.type !== 'breeding_reserved') return null;
  const vorhanden = await vorgangZuVertrag(contract.id);
  if (vorhanden) return vorhanden;

  const data = vertragsregelnAnwenden(contract.data);
  const tier = data.animals[0];
  const startDate = data.breedingUseStartDate ?? todayISO();
  const months = data.breedingUseMonths ?? VORGABE_NUTZUNGSMONATE;
  const extensionMonths =
    data.breedingUseExtensionMonths ?? VORGABE_VERLAENGERUNGSMONATE;

  return insert(db.breedingUses, {
    contractId: contract.id,
    catId: tier?.catId,
    kittenId: tier?.kittenId,
    catName: vorgangsName(data),
    startDate,
    months,
    extensionMonths,
    deadlineDate: fristende(startDate, months),
    discountCents: data.discountCents,
    backPaymentDays: data.backPaymentDays,
    stage: 'at_buyer',
    history: [{ stage: 'at_buyer', at: nowISO(), note: 'Vorgang aus dem Vertrag angelegt' }],
  });
}

/**
 * Hält den Vorgang mit dem Vertrag im Gleichklang, solange noch nichts
 * passiert ist. Sobald die Züchterin am Vorgang selbst etwas geändert
 * hat (Verlängerung, Statuswechsel), wird nicht mehr überschrieben.
 */
export async function vorgangAusVertragAktualisieren(contract: Contract): Promise<void> {
  const vorgang = await vorgangZuVertrag(contract.id);
  if (!vorgang) return;
  if (vorgang.stage !== 'at_buyer' || vorgang.extendedAt) return;

  const data = vertragsregelnAnwenden(contract.data);
  const tier = data.animals[0];
  const startDate = data.breedingUseStartDate ?? vorgang.startDate;
  const months = data.breedingUseMonths ?? vorgang.months;
  const extensionMonths = data.breedingUseExtensionMonths ?? vorgang.extensionMonths;

  await patch(db.breedingUses, vorgang.id, {
    catId: tier?.catId,
    kittenId: tier?.kittenId,
    catName: vorgangsName(data),
    startDate,
    months,
    extensionMonths,
    deadlineDate: fristende(startDate, months),
    discountCents: data.discountCents,
    backPaymentDays: data.backPaymentDays,
  });
}

/** Wechselt die Stufe und schreibt sie in den Verlauf. */
export async function stufeSetzen(
  use: BreedingUse,
  stage: BreedingUseStage,
  note?: string,
  at: ISODateTime = nowISO(),
): Promise<void> {
  const eventAt = ereignisZeitpunkt(at);
  await patch(db.breedingUses, use.id, {
    stage,
    history: [...use.history, { stage, at: eventAt, note }],
  });
}

/** Verlängert die Frist einmalig um die vereinbarten Monate. */
export async function fristVerlaengern(use: BreedingUse, at: ISODateTime = nowISO()): Promise<void> {
  if (use.extendedAt) return;
  const eventAt = ereignisZeitpunkt(at);
  const neu = fristende(use.startDate, use.months, use.extensionMonths, true);
  await patch(db.breedingUses, use.id, {
    extendedAt: dateOf(eventAt),
    deadlineDate: neu,
    history: [
      ...use.history,
      {
        stage: use.stage,
        at: eventAt,
        note: `Frist um ${use.extensionMonths} Monate verlängert`,
      },
    ],
  });
}

export async function verlaufsnotizHinzufuegen(
  use: BreedingUse,
  note: string,
  at: ISODateTime = nowISO(),
): Promise<void> {
  const eventAt = ereignisZeitpunkt(at);
  await patch(db.breedingUses, use.id, {
    history: [...use.history, { stage: use.stage, at: eventAt, note }],
  });
}

/** Die gespeicherte Reihenfolge beschreibt Statuswechsel; Datumskorrekturen ändern nur die Zeit. */
export async function verlaufDatumSetzen(use: BreedingUse, index: number, at: ISODateTime): Promise<void> {
  const eventAt = ereignisZeitpunkt(at);
  const entry = use.history[index];
  if (!entry) throw new Error('Dieser Verlaufseintrag ist nicht mehr vorhanden.');
  const history = use.history.map((item, i) => i === index ? { ...item, at: eventAt } : item);
  const isExtension = Boolean(use.extendedAt) && dateOf(entry.at) === use.extendedAt &&
    entry.note === `Frist um ${use.extensionMonths} Monate verlängert`;
  await patch(db.breedingUses, use.id, {
    history,
    ...(isExtension ? { extendedAt: dateOf(eventAt) } : {}),
  });
}

/** Ändert das Datum der erstmaligen Überlassung und rechnet die Frist neu. */
export async function fristbeginnSetzen(use: BreedingUse, startDate: ISODate): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || toISODate(parseISODate(startDate)) !== startDate || startDate > todayISO()) {
    throw new Error('Bitte ein gültiges Überlassungsdatum bis heute eintragen.');
  }
  await patch(db.breedingUses, use.id, {
    startDate,
    deadlineDate: fristende(startDate, use.months, use.extensionMonths, Boolean(use.extendedAt)),
  });
}
