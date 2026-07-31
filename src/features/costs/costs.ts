/**
 * Auswertung von Kosten und Erlösen.
 *
 * Ausdrücklich **nicht** fürs Finanzamt (F106): keine Umsatzsteuer, keine
 * Belegpflicht, keine Perioden. Nur die Frage „hat sich der Wurf gerechnet"
 * (F107) und „was kostet mich dieses Zuchttier laufend".
 *
 * Alle Beträge sind Cent als Ganzzahl.
 */

import type { CostCategory, CostEntry, ID, ISODate, RevenueEntry } from '../../types';
import { COST_CATEGORY_LABEL } from '../../types';

/* ------------------------------------------------------------------ */
/*  Grundrechnen                                                       */
/* ------------------------------------------------------------------ */

/** Summiert Beträge und überspringt kaputte Werte, statt NaN zu liefern. */
export function sumCents(entries: { amountCents?: number | null }[]): number {
  let total = 0;
  for (const e of entries) {
    const v = e.amountCents;
    if (typeof v === 'number' && Number.isFinite(v)) total += Math.round(v);
  }
  return total;
}

/**
 * Welchem Wurf gehört ein Eintrag? Ein Eintrag am Kitten zählt zum Wurf
 * dieses Kittens, auch wenn kein Wurf ausdrücklich gewählt wurde.
 */
export function litterIdOf(
  entry: { litterId?: ID; kittenId?: ID },
  kittenToLitter: Map<ID, ID>,
): ID | undefined {
  if (entry.litterId) return entry.litterId;
  if (entry.kittenId) return kittenToLitter.get(entry.kittenId);
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Auswertung je Wurf                                                 */
/* ------------------------------------------------------------------ */

export interface CategoryBucket {
  category: CostCategory;
  label: string;
  totalCents: number;
  count: number;
}

export interface LitterFinance {
  litterId: ID;
  costCents: number;
  revenueCents: number;
  /** Erlöse minus Kosten. Negativ = draufgelegt. */
  resultCents: number;
  costCount: number;
  revenueCount: number;
  byCategory: CategoryBucket[];
}

const EMPTY_FINANCE = (litterId: ID): LitterFinance => ({
  litterId,
  costCents: 0,
  revenueCents: 0,
  resultCents: 0,
  costCount: 0,
  revenueCount: 0,
  byCategory: [],
});

/** Fasst Kosten nach Kategorie zusammen, absteigend nach Betrag. */
export function summarizeByCategory(costs: CostEntry[]): CategoryBucket[] {
  const map = new Map<CostCategory, { totalCents: number; count: number }>();
  for (const c of costs) {
    const v =
      typeof c.amountCents === 'number' && Number.isFinite(c.amountCents)
        ? Math.round(c.amountCents)
        : 0;
    const cur = map.get(c.category);
    if (cur) {
      cur.totalCents += v;
      cur.count += 1;
    } else {
      map.set(c.category, { totalCents: v, count: 1 });
    }
  }
  return [...map.entries()]
    .map(([category, v]) => ({
      category,
      label: COST_CATEGORY_LABEL[category],
      totalCents: v.totalCents,
      count: v.count,
    }))
    .sort((a, b) => b.totalCents - a.totalCents || a.label.localeCompare(b.label, 'de'));
}

/**
 * Auswertung für genau einen Wurf. `costs` und `revenues` dürfen die
 * vollständigen Tabellen sein — es wird selbst gefiltert.
 */
export function summarizeLitter(
  litterId: ID,
  costs: CostEntry[],
  revenues: RevenueEntry[],
  kittenToLitter: Map<ID, ID> = new Map(),
): LitterFinance {
  const own = costs.filter((c) => litterIdOf(c, kittenToLitter) === litterId);
  const rev = revenues.filter((r) => litterIdOf(r, kittenToLitter) === litterId);

  const costCents = sumCents(own);
  const revenueCents = sumCents(rev);

  return {
    litterId,
    costCents,
    revenueCents,
    resultCents: revenueCents - costCents,
    costCount: own.length,
    revenueCount: rev.length,
    byCategory: summarizeByCategory(own),
  };
}

/** Auswertung für alle genannten Würfe auf einen Rutsch. */
export function summarizeLitters(
  litterIds: ID[],
  costs: CostEntry[],
  revenues: RevenueEntry[],
  kittenToLitter: Map<ID, ID> = new Map(),
): Map<ID, LitterFinance> {
  const result = new Map<ID, LitterFinance>(litterIds.map((id) => [id, EMPTY_FINANCE(id)]));

  const costsByLitter = new Map<ID, CostEntry[]>();
  for (const c of costs) {
    const id = litterIdOf(c, kittenToLitter);
    if (!id || !result.has(id)) continue;
    const list = costsByLitter.get(id);
    if (list) list.push(c);
    else costsByLitter.set(id, [c]);
  }

  const revByLitter = new Map<ID, RevenueEntry[]>();
  for (const r of revenues) {
    const id = litterIdOf(r, kittenToLitter);
    if (!id || !result.has(id)) continue;
    const list = revByLitter.get(id);
    if (list) list.push(r);
    else revByLitter.set(id, [r]);
  }

  for (const id of litterIds) {
    const own = costsByLitter.get(id) ?? [];
    const rev = revByLitter.get(id) ?? [];
    const costCents = sumCents(own);
    const revenueCents = sumCents(rev);
    result.set(id, {
      litterId: id,
      costCents,
      revenueCents,
      resultCents: revenueCents - costCents,
      costCount: own.length,
      revenueCount: rev.length,
      byCategory: summarizeByCategory(own),
    });
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Auswertung je Zuchttier (wurfübergreifend)                         */
/* ------------------------------------------------------------------ */

export interface CatFinance {
  catId: ID;
  totalCents: number;
  count: number;
  /** Ältester und jüngster Beleg — für „seit …". */
  firstDate?: ISODate;
  lastDate?: ISODate;
  byCategory: CategoryBucket[];
}

/**
 * Laufende Kosten je Zuchttier. Gezählt wird alles, was ausdrücklich am
 * Tier hängt — Wurfkosten bleiben beim Wurf.
 */
export function summarizeCats(costs: CostEntry[]): Map<ID, CatFinance> {
  const byCat = new Map<ID, CostEntry[]>();
  for (const c of costs) {
    if (!c.catId) continue;
    const list = byCat.get(c.catId);
    if (list) list.push(c);
    else byCat.set(c.catId, [c]);
  }

  const result = new Map<ID, CatFinance>();
  for (const [catId, list] of byCat) {
    const dates = list.map((c) => c.date).filter(Boolean).sort();
    result.set(catId, {
      catId,
      totalCents: sumCents(list),
      count: list.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      byCategory: summarizeByCategory(list),
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Erlöse je Kitten                                                   */
/* ------------------------------------------------------------------ */

export interface KittenRevenue {
  kittenId: ID;
  totalCents: number;
  count: number;
}

export function summarizeKittenRevenues(revenues: RevenueEntry[]): Map<ID, KittenRevenue> {
  const result = new Map<ID, KittenRevenue>();
  for (const r of revenues) {
    if (!r.kittenId) continue;
    const cur = result.get(r.kittenId);
    const v =
      typeof r.amountCents === 'number' && Number.isFinite(r.amountCents)
        ? Math.round(r.amountCents)
        : 0;
    if (cur) {
      cur.totalCents += v;
      cur.count += 1;
    } else {
      result.set(r.kittenId, { kittenId: r.kittenId, totalCents: v, count: 1 });
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Nicht zugeordnet                                                   */
/* ------------------------------------------------------------------ */

/** Kosten ohne Wurf, ohne Tier, ohne Kitten — die allgemeinen Ausgaben. */
export function unassignedCosts(costs: CostEntry[]): CostEntry[] {
  return costs.filter((c) => !c.litterId && !c.catId && !c.kittenId);
}

/** Erlöse ohne jede Zuordnung. */
export function unassignedRevenues(revenues: RevenueEntry[]): RevenueEntry[] {
  return revenues.filter((r) => !r.litterId && !r.kittenId);
}

/* ------------------------------------------------------------------ */
/*  Gesamtbild                                                         */
/* ------------------------------------------------------------------ */

export interface OverallFinance {
  costCents: number;
  revenueCents: number;
  resultCents: number;
  costCount: number;
  revenueCount: number;
}

export function summarizeAll(costs: CostEntry[], revenues: RevenueEntry[]): OverallFinance {
  const costCents = sumCents(costs);
  const revenueCents = sumCents(revenues);
  return {
    costCents,
    revenueCents,
    resultCents: revenueCents - costCents,
    costCount: costs.length,
    revenueCount: revenues.length,
  };
}

/** Sortiert Belege: jüngste zuerst, bei gleichem Datum stabil nach Kennung. */
export function sortEntriesNewestFirst<T extends { date: ISODate; id: ID }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
