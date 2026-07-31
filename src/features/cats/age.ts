/**
 * Alter erwachsener Tiere.
 *
 * `formatAge` aus src/lib/date.ts rechnet in Wochen — richtig für Kitten,
 * unbrauchbar für eine sechsjährige Königin. Deshalb hier eine eigene,
 * getestete Variante in Jahren und Monaten.
 */

import type { ISODate } from '../../types';
import { daysBetween, parseISODate, todayISO } from '../../lib/date';
import { isValidISODate } from './heat';

/** Vollendete Monate zwischen zwei Datumsangaben. Negativ, wenn b vor a liegt. */
export function fullMonthsBetween(a: ISODate, b: ISODate): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  let months = (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
  if (db.getDate() < da.getDate()) months -= 1;
  return months;
}

/**
 * "6 Jahre, 3 Monate" · "8 Monate" · "12 Tage".
 * Ohne (oder mit unbrauchbarem) Geburtsdatum: „Alter unbekannt".
 */
export function catAgeLabel(birthDate?: ISODate | null, ref: ISODate = todayISO()): string {
  if (!isValidISODate(birthDate)) return 'Alter unbekannt';
  const days = daysBetween(birthDate, ref);
  if (days < 0) return 'Wurfdatum liegt in der Zukunft';
  if (days === 0) return 'heute geboren';
  if (days < 31) return `${days} ${days === 1 ? 'Tag' : 'Tage'}`;

  const months = fullMonthsBetween(birthDate, ref);
  if (months < 12) return `${months} ${months === 1 ? 'Monat' : 'Monate'}`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = `${years} ${years === 1 ? 'Jahr' : 'Jahre'}`;
  if (rest === 0) return yearPart;
  return `${yearPart}, ${rest} ${rest === 1 ? 'Monat' : 'Monate'}`;
}
