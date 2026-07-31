/**
 * Nur für die Tests der Sicherung.
 *
 * jsdom-Blobs überstehen den strukturierten Klon von fake-indexeddb nicht —
 * sie kommen als leeres Objekt zurück. Der Blob aus Node überlebt ihn.
 * `@types/node` ist in dieser Typprüfung bewusst nicht eingebunden, deshalb
 * hier die eine Zeile, die wirklich gebraucht wird.
 */
declare module 'node:buffer' {
  export const Blob: new (
    parts: unknown[],
    options?: { type?: string },
  ) => globalThis.Blob;
}
