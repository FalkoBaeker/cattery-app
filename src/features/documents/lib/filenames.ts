/**
 * Dateinamen für geteilte und heruntergeladene Dateien.
 *
 * Die Namen landen in WhatsApp, im Datei-Programm und in iCloud Drive.
 * Sie müssen deshalb ohne Umlaute, Leerzeichen und Sonderzeichen auskommen,
 * dürfen nicht beliebig lang werden und sollen trotzdem lesbar bleiben.
 */

import type { ISODate } from '../../../types';

const UMLAUTS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'ae',
  Ö: 'oe',
  Ü: 'ue',
  ß: 'ss',
};

/**
 * „Familie Müller-Schmidt" -> „familie-mueller-schmidt".
 * Leer oder nur Sonderzeichen -> leerer String; der Aufrufer entscheidet dann
 * über den Ersatznamen.
 */
export function slugify(input: string, maxLength = 40): string {
  const replaced = (input ?? '').replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c] ?? c);

  const ascii = replaced
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (ascii.length <= maxLength) return ascii;

  // An der letzten Trennstelle kürzen, damit kein Wort zerhackt wird.
  const cut = ascii.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  const trimmed = lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut;
  return trimmed.replace(/-+$/g, '');
}

/** Endung aus dem MIME-Typ. Unbekanntes wird zu „bin". */
export function extensionFor(mime: string | undefined): string {
  switch ((mime ?? '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

/**
 * Name für das WhatsApp-Bild eines Kittens.
 *
 *  ("Mira", 24)          -> "kitten-mira-tag-24.jpg"
 *  ("Rot", null, Datum)  -> "kitten-rot-2026-07-31.jpg"
 *  ("", 3)               -> "kitten-tag-3.jpg"
 */
export function buildShareFileName(options: {
  kittenName?: string | null;
  ageDays?: number | null;
  date?: ISODate;
  extension?: string;
}): string {
  const parts = ['kitten'];

  const name = slugify(options.kittenName ?? '', 28);
  if (name) parts.push(name);

  const age = options.ageDays;
  if (age != null && Number.isFinite(age) && age >= 0) {
    parts.push('tag', String(Math.floor(age)));
  } else if (options.date) {
    parts.push(options.date);
  }

  return `${parts.join('-')}.${options.extension ?? 'jpg'}`;
}

/**
 * Name für eine einzelne Dokumentseite beim Herunterladen.
 *
 *  ("Impfpass Mira", 0, 1)  -> "impfpass-mira.jpg"
 *  ("Impfpass Mira", 1, 3)  -> "impfpass-mira-seite-2-von-3.jpg"
 */
export function buildPageFileName(
  title: string,
  index: number,
  total: number,
  mime = 'image/jpeg',
): string {
  const base = slugify(title, 44) || 'dokument';
  const ext = extensionFor(mime);
  if (total <= 1) return `${base}.${ext}`;
  const page = Math.min(Math.max(Math.floor(index) + 1, 1), Math.floor(total));
  return `${base}-seite-${page}-von-${Math.floor(total)}.${ext}`;
}
