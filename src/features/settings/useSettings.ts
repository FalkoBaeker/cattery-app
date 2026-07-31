/**
 * Live-Zugriff auf die Einstellungen.
 *
 * `getSettings()` aus src/db/db.ts liefert einen Zwischenspeicher und zieht
 * deshalb nicht nach, wenn etwas gespeichert wird. Für die Oberfläche brauchen
 * wir eine Abfrage, die Dexie beobachtet — sonst müsste nach jedem Speichern
 * die Seite neu geladen werden.
 */

import type { Settings } from '../../types';

// Die Live-Abfrage wohnt inzwischen zentral in src/db/useSettings.ts,
// weil drei Module dieselbe Logik brauchten.
export { mergeSettings, useSettings } from '../../db/useSettings';

/** Setzt das Farbschema sofort auf das Wurzelelement (siehe src/App.tsx). */
export function applyTheme(theme: Settings['theme']): void {
  if (typeof document === 'undefined') return;
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
