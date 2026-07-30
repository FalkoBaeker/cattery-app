/**
 * Datums-Hilfsfunktionen.
 *
 * Grundregel: reine Datumsangaben werden als "YYYY-MM-DD" gespeichert und
 * immer in der *lokalen* Zeitzone interpretiert. Zeitpunkte werden als
 * ISO-String mit Z gespeichert. Niemals `new Date("2026-03-03")` benutzen —
 * das wäre UTC und verschiebt in Deutschland um einen Tag.
 */

import type { ISODate, ISODateTime } from '../types';

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/*  Umwandlung                                                         */
/* ------------------------------------------------------------------ */

/** "2026-03-03" -> Date (lokale Mitternacht). */
export function parseISODate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

/** Date -> "2026-03-03" in lokaler Zeitzone. */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowISO(): ISODateTime {
  return new Date().toISOString();
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

/** Zeitpunkt -> lokales Datum. */
export function dateOf(dt: ISODateTime): ISODate {
  return toISODate(new Date(dt));
}

/* ------------------------------------------------------------------ */
/*  Rechnen                                                            */
/* ------------------------------------------------------------------ */

export function addDays(d: ISODate, days: number): ISODate {
  const x = parseISODate(d);
  x.setDate(x.getDate() + days);
  return toISODate(x);
}

export function addWeeks(d: ISODate, weeks: number): ISODate {
  return addDays(d, weeks * 7);
}

export function addMonths(d: ISODate, months: number): ISODate {
  const x = parseISODate(d);
  const targetMonth = x.getMonth() + months;
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(targetMonth);
  // Monatsende korrekt behandeln: 31.01. + 1 Monat = 28./29.02.
  const lastDay = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, lastDay));
  return toISODate(x);
}

/** Ganze Tage zwischen zwei Datumsangaben (b - a). Zeitzonensicher. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  // Über UTC rechnen, damit Sommerzeitwechsel keine 23-/25-Stunden-Tage erzeugen.
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

/** Exakte Stunden zwischen zwei Zeitpunkten. */
export function hoursBetween(a: ISODateTime, b: ISODateTime): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

/** Exakte Tage (mit Nachkommastellen) zwischen zwei Zeitpunkten. */
export function exactDaysBetween(a: ISODateTime, b: ISODateTime): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;
}

/** Alter in Tagen, bezogen auf heute. */
export function ageInDays(birth: ISODate, ref: ISODate = todayISO()): number {
  return daysBetween(birth, ref);
}

/** Vollendete Lebenswochen. */
export function ageInWeeks(birth: ISODate, ref: ISODate = todayISO()): number {
  return Math.floor(ageInDays(birth, ref) / 7);
}

export function isPast(d: ISODate, ref: ISODate = todayISO()): boolean {
  return daysBetween(ref, d) < 0;
}

export function isToday(d: ISODate, ref: ISODate = todayISO()): boolean {
  return d === ref;
}

export function startOfWeek(d: ISODate): ISODate {
  const x = parseISODate(d);
  const wd = (x.getDay() + 6) % 7; // Montag = 0
  x.setDate(x.getDate() - wd);
  return toISODate(x);
}

export function clampDate(d: ISODate, min?: ISODate, max?: ISODate): ISODate {
  if (min && daysBetween(min, d) < 0) return min;
  if (max && daysBetween(d, max) < 0) return max;
  return d;
}

/* ------------------------------------------------------------------ */
/*  Anzeige (deutsch)                                                  */
/* ------------------------------------------------------------------ */

const fmtDate = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const fmtDateShort = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const fmtWeekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const fmtTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtMonthYear = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });

/** "03.03.2026" */
export function formatDate(d?: ISODate | null): string {
  if (!d) return '—';
  return fmtDate.format(parseISODate(d));
}

/** "03.03." */
export function formatDateShort(d?: ISODate | null): string {
  if (!d) return '—';
  return fmtDateShort.format(parseISODate(d));
}

/** "Di, 03.03.2026" */
export function formatDateWithWeekday(d?: ISODate | null): string {
  if (!d) return '—';
  const date = parseISODate(d);
  return `${fmtWeekday.format(date)}, ${fmtDate.format(date)}`;
}

/** "14:05" */
export function formatTime(dt?: ISODateTime | null): string {
  if (!dt) return '—';
  return fmtTime.format(new Date(dt));
}

/** "03.03.2026, 14:05" */
export function formatDateTime(dt?: ISODateTime | null): string {
  if (!dt) return '—';
  const d = new Date(dt);
  return `${fmtDate.format(d)}, ${fmtTime.format(d)}`;
}

/** "März 2026" */
export function formatMonthYear(d: ISODate): string {
  return fmtMonthYear.format(parseISODate(d));
}

/** "heute", "morgen", "gestern", "in 5 Tagen", "vor 3 Tagen" */
export function formatRelativeDay(d: ISODate, ref: ISODate = todayISO()): string {
  const diff = daysBetween(ref, d);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === 2) return 'übermorgen';
  if (diff === -1) return 'gestern';
  if (diff === -2) return 'vorgestern';
  if (diff > 0) return `in ${diff} Tagen`;
  return `vor ${Math.abs(diff)} Tagen`;
}

/** "3 Wochen, 2 Tage" — für das Kittenalter. */
export function formatAge(birth: ISODate, ref: ISODate = todayISO()): string {
  const days = ageInDays(birth, ref);
  if (days < 0) return '—';
  if (days === 0) return 'heute geboren';
  if (days < 14) return days === 1 ? '1 Tag' : `${days} Tage`;
  const w = Math.floor(days / 7);
  const rest = days % 7;
  if (rest === 0) return `${w} Wochen`;
  return `${w} Wo., ${rest} ${rest === 1 ? 'Tag' : 'Tage'}`;
}

/** "noch 7 Monate" / "abgelaufen seit 12 Tagen" — für Fristen. */
export function formatDeadline(deadline: ISODate, ref: ISODate = todayISO()): string {
  const days = daysBetween(ref, deadline);
  if (days < 0) return `abgelaufen seit ${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tagen'}`;
  if (days === 0) return 'läuft heute ab';
  if (days < 31) return `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  const months = Math.floor(days / 30.44);
  return `noch ${months} ${months === 1 ? 'Monat' : 'Monate'}`;
}

/** Für <input type="datetime-local"> — erwartet lokale Zeit ohne Zeitzone. */
export function toLocalInputValue(dt: ISODateTime): string {
  const d = new Date(dt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Gegenstück zu toLocalInputValue. */
export function fromLocalInputValue(v: string): ISODateTime {
  return new Date(v).toISOString();
}
