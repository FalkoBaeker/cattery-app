/**
 * Kennungen. Bewusst sortierbar: die ersten Stellen sind ein Zeitstempel,
 * damit Datensätze auch ohne extra Index in Erstellreihenfolge liegen.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomPart(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** z. B. "m8x1k4p2-7fq3zt" */
export function newId(): string {
  return `${Date.now().toString(36)}-${randomPart(8)}`;
}
