/** Reine Kalender- und Zeitlogik für das Nachtragen einzelner Kittengewichte. */

import type { ISODate, ISODateTime, WeightEntry } from '../../types';
import { dateOf, parseISODate, toISODate } from '../../lib/date';

/** Der Monat eines Datums, immer am ersten Tag. */
export function monthStart(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

/**
 * Alle sichtbaren Zellen eines Monatskalenders. Die Woche beginnt montags;
 * leere Zellen halten den ersten Tag unter dem richtigen Wochentag.
 */
export function monthCells(month: ISODate): Array<ISODate | null> {
  const first = parseISODate(monthStart(month));
  const offset = (first.getDay() + 6) % 7;
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: Array<ISODate | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(toISODate(new Date(first.getFullYear(), first.getMonth(), day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Ein lokales Datum und eine lokale Uhrzeit als gespeicherten ISO-Zeitpunkt verbinden. */
export function localDateTime(date: ISODate, time: string): ISODateTime | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  const value = parseISODate(date);
  value.setHours(hours, minutes, 0, 0);
  return value.toISOString();
}

/** Messungen eines Kalendertags, chronologisch sortiert. */
export function entriesOnDate(entries: WeightEntry[], date: ISODate): WeightEntry[] {
  return entries
    .filter((entry) => dateOf(entry.at) === date)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Sinnvolle Startzeit mit möglichst wenig Tipparbeit: erst morgens, dann
 * abends. Sind beide Tageshälften belegt, bleibt die letzte Uhrzeit sichtbar
 * und kann für einen Sonderfall direkt geändert werden.
 */
export function suggestedTime(entries: WeightEntry[]): string {
  const minutes = entries.map((entry) => {
    const date = new Date(entry.at);
    return date.getHours() * 60 + date.getMinutes();
  });
  if (!minutes.some((value) => value < 14 * 60)) return '08:00';
  if (!minutes.some((value) => value >= 14 * 60)) return '20:00';
  const latest = entries[entries.length - 1];
  if (!latest) return '08:00';
  const value = new Date(latest.at);
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}
