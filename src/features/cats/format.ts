/**
 * Formatierungen, die nur die Zuchttiere betreffen.
 *
 * Diese Datei ist frei von React und von Datenbankzugriffen.
 */

/**
 * Der Ahnenverlust kommt von PawPeds und ist dort auf zwei Nachkommastellen
 * genau (6,25 %, 12,5 %, 0,39 %). `formatPercent` aus src/lib/format.ts rundet
 * hart auf eine Stelle und macht aus 6,25 ein falsches "6,3 %" — deshalb hier
 * ein eigenes Format: bis zu zwei Stellen, aber keine unnötigen Nullen.
 */
const percentFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 6.25 -> "6,25 %", 6 -> "6 %", null -> undefined */
export function formatInbreeding(percent?: number | null): string | undefined {
  if (percent == null || !Number.isFinite(percent)) return undefined;
  return `${percentFormat.format(percent)} %`;
}

/** Grenzen für den Ahnenverlust — außerhalb ist es ein Vertipper. */
export const INBREEDING_MIN = 0;
export const INBREEDING_MAX = 100;

/**
 * Prüft eine Eingabe für den Ahnenverlust. Leer ist erlaubt (alles außer dem
 * Rufnamen darf fehlen), Unsinn nicht — der wird gemeldet, nicht verworfen.
 */
export function inbreedingError(percent: number | null | undefined): string | undefined {
  if (percent == null) return undefined;
  if (!Number.isFinite(percent) || percent < INBREEDING_MIN || percent > INBREEDING_MAX) {
    return 'Bitte einen Wert zwischen 0 und 100 eintragen.';
  }
  return undefined;
}
