/**
 * Reine Fachlogik der Warteliste — ohne React, ohne Datenbank.
 *
 * Hier liegt alles, was sich rechnen lässt und deshalb geprüft gehört:
 *  - die Neuvergabe der Reihenfolge beim Verschieben (sortIndex),
 *  - die 30-Tage-Frist des Papierkorbs,
 *  - der Aufbau der Kontakt-Verweise (wa.me, tel:, mailto:),
 *  - der Fortschritt einer Sammelnachricht.
 *
 * Grundsatz: Diese Datei kennt keine Oberfläche. Sie liefert Zahlen, Texte
 * und neue Datensätze zurück — gespeichert wird woanders.
 */

import type { ID, ISODate, ISODateTime, Interest, InterestStatus, WishSex } from '../../types';
import { addDays, dateOf, daysBetween, todayISO } from '../../lib/date';
import { toWhatsAppNumber } from '../../lib/format';

/* ================================================================== */
/*  Reihenfolge                                                        */
/* ================================================================== */

/** Das Minimum, das ein Eintrag zum Sortieren mitbringen muss. */
export interface Sortable {
  id: ID;
  sortIndex: number;
}

/** Eine zu speichernde Änderung an der Reihenfolge. */
export interface SortUpdate {
  id: ID;
  sortIndex: number;
}

/** sortIndex, der beim Sortieren an letzter Stelle einsortiert. */
function safeIndex(value: number): number {
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

/**
 * Bringt die Einträge in Anzeigereihenfolge.
 *
 * Altdaten enthalten erfahrungsgemäß gleiche oder fehlende sortIndex-Werte
 * (etwa nach einem Import oder wenn zwei Einträge in derselben Sekunde
 * entstanden sind). Damit die Liste trotzdem bei jedem Aufruf gleich
 * aussieht, wird bei Gleichstand nach Anlagezeitpunkt und zuletzt nach
 * Kennung entschieden — beides ist stabil.
 */
export function sortWaitlist<T extends Sortable & { createdAt?: ISODateTime }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const byIndex = safeIndex(a.sortIndex) - safeIndex(b.sortIndex);
    if (byIndex !== 0) return byIndex;
    const byCreated = (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Verschiebt ein Element innerhalb einer Liste. Ungültige Positionen ändern
 * nichts, Zielpositionen außerhalb werden an den Rand geklemmt.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (next.length === 0) return next;
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  if (from === target) return next;
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Vergibt lückenlose sortIndex-Werte 0…n-1 in der übergebenen Reihenfolge
 * und liefert nur die Einträge zurück, die sich tatsächlich ändern.
 * So bleibt die Zahl der Schreibvorgänge klein.
 */
export function resequence(items: readonly Sortable[]): SortUpdate[] {
  const updates: SortUpdate[] = [];
  items.forEach((item, index) => {
    if (item.sortIndex !== index) updates.push({ id: item.id, sortIndex: index });
  });
  return updates;
}

/**
 * Das Ergebnis eines Zieh-Vorgangs: Element von `from` nach `to`, danach
 * lückenlose Indizes. Liefert nur die nötigen Änderungen.
 *
 * Erwartet die Liste bereits in Anzeigereihenfolge (siehe `sortWaitlist`).
 */
export function moveAndResequence(
  items: readonly Sortable[],
  from: number,
  to: number,
): SortUpdate[] {
  return resequence(moveItem(items, from, to));
}

/** Neuer Eintrag landet unten. */
export function nextSortIndex(items: readonly Sortable[]): number {
  let max = -1;
  for (const item of items) {
    const value = item.sortIndex;
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max + 1;
}

/* ================================================================== */
/*  Papierkorb                                                         */
/* ================================================================== */

/** Nach so vielen Tagen im Papierkorb wird endgültig gelöscht. */
export const TRASH_RETENTION_DAYS = 30;

/**
 * Tag, an dem der Eintrag endgültig verschwindet.
 * Gerechnet wird über Kalendertage ab dem Löschtag — das übersteht
 * Sommerzeitwechsel, Monatswechsel und Schaltjahre unbeschadet.
 */
export function purgeDate(deletedAt: ISODateTime): ISODate {
  return addDays(dateOf(deletedAt), TRASH_RETENTION_DAYS);
}

/** Verbleibende Tage. 0 oder weniger heißt: jetzt fällig. */
export function daysUntilPurge(deletedAt: ISODateTime, ref: ISODate = todayISO()): number {
  return daysBetween(ref, purgeDate(deletedAt));
}

export function isPurgeDue(deletedAt: ISODateTime, ref: ISODate = todayISO()): boolean {
  return daysUntilPurge(deletedAt, ref) <= 0;
}

/** „wird in 12 Tagen endgültig gelöscht" */
export function formatPurgeHint(deletedAt: ISODateTime, ref: ISODate = todayISO()): string {
  const days = daysUntilPurge(deletedAt, ref);
  if (days <= 0) return 'wird jetzt endgültig gelöscht';
  if (days === 1) return 'wird morgen endgültig gelöscht';
  return `wird in ${days} Tagen endgültig gelöscht`;
}

/** Die Einträge, die beim nächsten Aufräumen wirklich gelöscht werden. */
export function duePurgeIds(
  items: readonly Pick<Interest, 'id' | 'deletedAt'>[],
  ref: ISODate = todayISO(),
): ID[] {
  return items.filter((i) => i.deletedAt && isPurgeDue(i.deletedAt, ref)).map((i) => i.id);
}

/* ================================================================== */
/*  Verweise auf Telefon, WhatsApp und E-Mail                          */
/* ================================================================== */

/**
 * Baut den wa.me-Verweis. Der Text wird vollständig prozentkodiert —
 * Umlaute werden dabei zu ihrer UTF-8-Form („ü" → „%C3%BC"), Zeilenumbrüche
 * zu „%0A". Ohne brauchbare Nummer gibt es keinen Verweis.
 */
export function buildWhatsAppUrl(phone?: string | null, text?: string | null): string | null {
  const number = phone ? toWhatsAppNumber(phone) : null;
  if (!number) return null;
  const body = text?.trim();
  return body ? `https://wa.me/${number}?text=${encodeURIComponent(body)}` : `https://wa.me/${number}`;
}

/** `tel:`-Verweis in internationaler Schreibweise, wenn möglich. */
export function buildTelUrl(phone?: string | null): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  const number = toWhatsAppNumber(raw);
  if (number) return `tel:+${number}`;
  const digits = raw.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

/** `mailto:`-Verweis mit optionalem Betreff und Text. */
export function buildMailtoUrl(
  email?: string | null,
  subject?: string | null,
  body?: string | null,
): string | null {
  const address = email?.trim();
  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  const params: string[] = [];
  if (subject?.trim()) params.push(`subject=${encodeURIComponent(subject.trim())}`);
  if (body?.trim()) params.push(`body=${encodeURIComponent(body.trim())}`);
  return params.length > 0 ? `mailto:${address}?${params.join('&')}` : `mailto:${address}`;
}

/**
 * Setzt {name} in der Vorlage ein. Groß-/Kleinschreibung und Leerzeichen
 * innerhalb der Klammern sind egal.
 *
 * Der Ersatz erfolgt über eine Funktion, damit Zeichen wie „$&" im Namen
 * nicht als Ersetzungsmuster missverstanden werden.
 */
export function fillTemplate(template: string, name: string): string {
  const clean = name.trim();
  return template.replace(/\{\s*name\s*\}/gi, () => clean);
}

/* ================================================================== */
/*  Sammelnachricht                                                    */
/* ================================================================== */

export interface BroadcastRecipient {
  interestId: ID;
  /** Name zum Zeitpunkt des Starts — die Liste bleibt lesbar, auch wenn
   *  der Eintrag zwischendurch umbenannt oder gelöscht wird. */
  name: string;
  phone?: string;
  sentAt?: ISODateTime;
  skippedAt?: ISODateTime;
}

/**
 * Ein laufender Versand. Weil iOS beim Öffnen von WhatsApp die App in den
 * Hintergrund schickt (und sie dabei auch neu laden kann), lebt dieser
 * Datensatz in der Datenbank — nicht im Arbeitsspeicher.
 */
export interface BroadcastRun {
  startedAt: ISODateTime;
  /** Der einmal verfasste Text, noch mit {name} als Platzhalter. */
  text: string;
  recipients: BroadcastRecipient[];
}

export interface BroadcastProgress {
  total: number;
  sent: number;
  skipped: number;
  /** Noch nicht verschickt und nicht übersprungen. */
  open: number;
  /** Nichts mehr offen. */
  finished: boolean;
}

export function broadcastProgress(run: BroadcastRun): BroadcastProgress {
  let sent = 0;
  let skipped = 0;
  for (const r of run.recipients) {
    if (r.sentAt) sent += 1;
    else if (r.skippedAt) skipped += 1;
  }
  const total = run.recipients.length;
  const open = total - sent - skipped;
  return { total, sent, skipped, open, finished: open === 0 };
}

/** Der Nächste, der dran ist. */
export function nextOpenRecipient(run: BroadcastRun): BroadcastRecipient | undefined {
  return run.recipients.find((r) => !r.sentAt && !r.skippedAt);
}

/** Setzt einen Empfänger auf „verschickt" und gibt einen neuen Vorgang zurück. */
export function markSent(run: BroadcastRun, interestId: ID, at: ISODateTime): BroadcastRun {
  return {
    ...run,
    recipients: run.recipients.map((r) =>
      r.interestId === interestId ? { ...r, sentAt: at, skippedAt: undefined } : r,
    ),
  };
}

/** Setzt einen Empfänger auf „übersprungen". */
export function markSkipped(run: BroadcastRun, interestId: ID, at: ISODateTime): BroadcastRun {
  return {
    ...run,
    recipients: run.recipients.map((r) =>
      r.interestId === interestId && !r.sentAt ? { ...r, skippedAt: at } : r,
    ),
  };
}

/** Nimmt „verschickt"/„übersprungen" zurück, damit der Eintrag erneut drankommt. */
export function markOpen(run: BroadcastRun, interestId: ID): BroadcastRun {
  return {
    ...run,
    recipients: run.recipients.map((r) =>
      r.interestId === interestId ? { ...r, sentAt: undefined, skippedAt: undefined } : r,
    ),
  };
}

/** „2 von 4 verschickt" */
export function formatBroadcastProgress(run: BroadcastRun): string {
  const p = broadcastProgress(run);
  const base = `${p.sent} von ${p.total} verschickt`;
  return p.skipped > 0 ? `${base}, ${p.skipped} übersprungen` : base;
}

/* ================================================================== */
/*  Suchen und Filtern                                                 */
/* ================================================================== */

export type SexFilter = WishSex | 'all';
export type StatusFilter = InterestStatus | 'all';

export interface WaitlistFilter {
  query: string;
  sex: SexFilter;
  status: StatusFilter;
}

export const EMPTY_FILTER: WaitlistFilter = { query: '', sex: 'all', status: 'all' };

export function isFilterActive(filter: WaitlistFilter): boolean {
  return filter.query.trim() !== '' || filter.sex !== 'all' || filter.status !== 'all';
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('de-DE');
}

/** Sucht in Name und Notizen — mehrere Wörter müssen alle vorkommen. */
export function matchesQuery(
  interest: Pick<Interest, 'name' | 'notes' | 'householdNote'>,
  query: string,
): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(
    [interest.name, interest.notes ?? '', interest.householdNote ?? ''].join(' '),
  );
  return words.every((w) => haystack.includes(w));
}

/**
 * Wunschgeschlecht-Filter. „Kater" zeigt auch alle, denen das Geschlecht
 * egal ist — sie kommen für einen Kater ebenso in Frage.
 */
export function matchesSex(wish: WishSex, filter: SexFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'any') return wish === 'any';
  return wish === filter || wish === 'any';
}

/** Wendet alle Filter an; die Reihenfolge der Liste bleibt erhalten. */
export function filterInterests<T extends Interest>(
  items: readonly T[],
  filter: WaitlistFilter,
): T[] {
  return items.filter(
    (i) =>
      matchesSex(i.wishSex, filter.sex) &&
      (filter.status === 'all' || i.status === filter.status) &&
      matchesQuery(i, filter.query),
  );
}

/* ================================================================== */
/*  Kleinteiliges für die Anzeige                                      */
/* ================================================================== */

/** Kurzfassung einer Notiz für die Listenzeile. */
export function shortNote(text: string | undefined, maxChars = 90): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Jüngster Kontakt aus dem Verlauf. */
export function lastContactAt(
  notes: readonly { at: ISODateTime }[],
): ISODateTime | undefined {
  let latest: ISODateTime | undefined;
  for (const n of notes) {
    if (!latest || n.at.localeCompare(latest) > 0) latest = n.at;
  }
  return latest;
}
