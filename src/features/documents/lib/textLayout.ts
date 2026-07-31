/**
 * Textumbruch für die Canvas-Ausgabe.
 *
 * Canvas kann keinen Zeilenumbruch. Die Breite eines Textes kennt nur die
 * Canvas selbst (`measureText`), deshalb wird die Messfunktion hereingereicht.
 * So bleibt die Logik ohne Browser prüfbar — und genau hier bricht es sonst:
 * sehr lange Rufnamen, Wörter ohne Leerzeichen, leere Eingaben.
 */

export type MeasureText = (text: string) => number;

export interface WrapOptions {
  /** Höchstzahl Zeilen; die letzte wird bei Bedarf mit „…" gekürzt. */
  maxLines?: number;
}

/** Kürzt einen einzeiligen Text auf die verfügbare Breite, mit „…" am Ende. */
export function truncateToWidth(text: string, maxWidth: number, measure: MeasureText): string {
  const value = text ?? '';
  if (value === '') return '';
  if (measure(value) <= maxWidth) return value;
  if (maxWidth <= 0) return '';

  const ellipsis = '…';
  if (measure(ellipsis) > maxWidth) return '';

  let low = 0;
  let high = value.length;
  // Binäre Suche nach der längsten passenden Vorsilbe.
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(value.slice(0, mid) + ellipsis) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low === 0 ? ellipsis : value.slice(0, low).trimEnd() + ellipsis;
}

/**
 * Bricht Text auf `maxWidth` um.
 *
 *  - Absätze (`\n`) bleiben Absätze, auch leere.
 *  - Wörter, die allein schon zu breit sind (sehr lange Namen, URLs),
 *    werden zeichenweise getrennt statt über den Rand zu laufen.
 *  - `maxLines` kürzt und setzt „…" ans Ende der letzten Zeile.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: MeasureText,
  options: WrapOptions = {},
): string[] {
  const value = (text ?? '').replace(/\r\n?/g, '\n');
  if (value.trim() === '') return [];
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [];

  const lines: string[] = [];

  for (const paragraph of value.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current !== '') {
        lines.push(current);
        current = '';
      }

      // Einzelnes Wort passt nicht in eine ganze Zeile: hart trennen.
      if (measure(word) > maxWidth) {
        let rest = word;
        while (rest !== '' && measure(rest) > maxWidth) {
          let cut = 1;
          while (cut < rest.length && measure(rest.slice(0, cut + 1)) <= maxWidth) cut++;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        current = rest;
      } else {
        current = word;
      }
    }
    if (current !== '') lines.push(current);
  }

  // Nachlaufende Leerzeilen sind im Bild nur Luft.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const max = options.maxLines;
  if (max != null && max > 0 && lines.length > max) {
    const kept = lines.slice(0, max);
    kept[max - 1] = withEllipsis(kept[max - 1], maxWidth, measure);
    return kept;
  }

  return lines;
}

/** Hängt „…" an und kürzt so weit, bis die Zeile passt. */
function withEllipsis(line: string, maxWidth: number, measure: MeasureText): string {
  let value = line;
  while (value.length > 0 && measure(`${value}…`) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value.trimEnd()}…`;
}
