/**
 * Formatierung von Zahlen, Geld und Gewichten — durchgehend deutsch.
 */

const currency = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const currencyRounded = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const decimal1 = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const integer = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** 248000 -> "2.480,00 €" */
export function formatMoney(cents?: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return currency.format(cents / 100);
}

/** 248000 -> "2.480 €" */
export function formatMoneyShort(cents?: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return currencyRounded.format(cents / 100);
}

/**
 * Wandelt eine Nutzereingabe in Cent um. Akzeptiert "2480", "2.480,00",
 * "2480,5", "2 480,50 €". Gibt null zurück, wenn nichts Sinnvolles drinsteht.
 */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9,.-]/g, '').trim();
  if (!cleaned) return null;
  // Deutsches Format: Punkt = Tausender, Komma = Dezimal.
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** 1234 -> "1.234 g" */
export function formatGrams(g?: number | null): string {
  if (g == null || !Number.isFinite(g)) return '—';
  return `${integer.format(Math.round(g))} g`;
}

/** Tageszunahme mit Vorzeichen: 11 -> "+11 g", -4 -> "−4 g" */
export function formatGainG(g?: number | null): string {
  if (g == null || !Number.isFinite(g)) return '—';
  const rounded = Math.round(g);
  if (rounded > 0) return `+${integer.format(rounded)} g`;
  if (rounded < 0) return `−${integer.format(Math.abs(rounded))} g`;
  return '±0 g';
}

/** 11.37 -> "11,4 g/Tag" */
export function formatGainPerDay(g?: number | null): string {
  if (g == null || !Number.isFinite(g)) return '—';
  return `${decimal1.format(g)} g/Tag`;
}

/** 0.153 -> "+15,3 %" */
export function formatPercent(ratio?: number | null, withSign = false): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  const v = ratio * 100;
  const s = decimal1.format(Math.abs(v));
  if (!withSign) return `${decimal1.format(v)} %`;
  if (v > 0) return `+${s} %`;
  if (v < 0) return `−${s} %`;
  return '±0 %';
}

export function formatInt(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return integer.format(n);
}

/** 1536000 -> "1,5 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${decimal1.format(bytes / 1024)} kB`;
  return `${decimal1.format(bytes / (1024 * 1024))} MB`;
}

/**
 * Deutsche Aufzählung: ["A"] -> "A", ["A","B"] -> "A und B",
 * ["A","B","C"] -> "A, B und C"
 */
export function joinAnd(parts: string[]): string {
  const list = parts.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}`;
}

/** Zahlwort für die Vertragstexte: 1 -> "ein", 2 -> "zwei" … */
const NUMBER_WORDS = [
  'null',
  'ein',
  'zwei',
  'drei',
  'vier',
  'fünf',
  'sechs',
  'sieben',
  'acht',
  'neun',
  'zehn',
  'elf',
  'zwölf',
];

export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** Einfache Ein-/Mehrzahl: plural(1,"Kitten","Kitten") */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Initialen für Platzhalter-Avatare. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Telefonnummer für wa.me: nur Ziffern, deutsche 0 -> 49. */
export function toWhatsAppNumber(phone: string): string | null {
  // In internationaler Schreibweise bezeichnet „(0)" nur die inländische
  // Amts-/Ortsnetzkennzahl und darf nicht mitgewählt werden: +49 (0)171 …
  const withoutInternationalTrunk = phone.replace(
    /^(\s*(?:\+|00)\s*\d{1,3})[\s./-]*\(\s*0\s*\)/,
    '$1',
  );
  let digits = withoutInternationalTrunk.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `49${digits.slice(1)}`;
  return digits.length >= 8 ? digits : null;
}
