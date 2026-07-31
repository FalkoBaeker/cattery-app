/**
 * Live-Zugriff auf die Einstellungen.
 *
 * `getSettings()` aus src/db/db.ts liefert einen Zwischenspeicher und zieht
 * deshalb nicht nach, wenn etwas gespeichert wird. Für die Oberfläche brauchen
 * wir eine Abfrage, die Dexie beobachtet — sonst müsste nach jedem Speichern
 * die Seite neu geladen werden.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { DEFAULT_SETTINGS, type Settings } from '../../types';

/** Ergänzt fehlende Zweige, damit ältere Datenstände nicht abstürzen. */
export function mergeSettings(stored?: Settings | null): Settings {
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    seller: { ...DEFAULT_SETTINGS.seller, ...stored.seller },
    weight: { ...DEFAULT_SETTINGS.weight, ...stored.weight },
    schedule: { ...DEFAULT_SETTINGS.schedule, ...stored.schedule },
    modules: { ...DEFAULT_SETTINGS.modules, ...stored.modules },
    id: 'singleton',
  };
}

/**
 * `undefined` bedeutet „wird noch geladen" — das ist etwas anderes als
 * „keine Einstellungen vorhanden" und darf nie als leer gezeichnet werden.
 */
export function useSettings(): Settings | undefined {
  const raw = useLiveQuery(
    () => db.settings.get('singleton').then((s) => s ?? null),
    [],
  );
  if (raw === undefined) return undefined;
  return mergeSettings(raw);
}

/** Setzt das Farbschema sofort auf das Wurzelelement (siehe src/App.tsx). */
export function applyTheme(theme: Settings['theme']): void {
  if (typeof document === 'undefined') return;
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
