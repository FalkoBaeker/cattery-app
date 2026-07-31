/**
 * Wochenlisten im Fahrplan („Entwurmung in Woche 4, 6, 8").
 *
 * In der Oberfläche steht dafür ein einziges Textfeld — das ist einhändig
 * schneller ausgefüllt als drei Zahlenfelder. Diese beiden Funktionen
 * übersetzen zwischen Text und Zahlenliste und schlucken jede Schreibweise,
 * die dabei tatsächlich vorkommt.
 */

/** Höchste sinnvolle Wochenzahl — darüber ist es ein Tippfehler. */
export const MAX_WEEK = 52;

/**
 * "4, 6, 8" -> [4, 6, 8]
 *
 * Trennt an Komma, Semikolon, Leerzeichen und Schrägstrich. Doppelte Werte
 * fallen weg, alles wird aufsteigend sortiert. Unsinn wird still übergangen,
 * damit die Eingabe nie blockiert.
 */
export function parseWeekList(input: string): number[] {
  const found = input
    .split(/[^0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= MAX_WEEK)
    .map((n) => Math.round(n));

  return [...new Set(found)].sort((a, b) => a - b);
}

/** [4, 6, 8] -> "4, 6, 8" */
export function formatWeekList(weeks: number[]): string {
  return weeks.join(', ');
}

/**
 * Schreibt eine Wochenliste aus: "Woche 4, 6 und 8".
 * Für die Erklärtexte unter den Feldern.
 */
export function describeWeekList(weeks: number[]): string {
  if (weeks.length === 0) return 'keine';
  if (weeks.length === 1) return `Woche ${weeks[0]}`;
  const head = weeks.slice(0, -1).join(', ');
  return `Woche ${head} und ${weeks[weeks.length - 1]}`;
}

/** Begrenzt eine einzelne Wochenangabe auf einen brauchbaren Bereich. */
export function clampWeek(value: number | null, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_WEEK, Math.max(0, Math.round(value)));
}

/** Begrenzt eine Zahl auf einen Bereich; leere Eingabe fällt auf den Vorgabewert. */
export function clampNumber(
  value: number | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
