/**
 * Reaktiver Live-Zugriff auf die Einstellungen — die eine gemeinsame Quelle
 * für alle Module.
 *
 * `getSettings()` aus db.ts arbeitet mit einem Zwischenspeicher und zieht
 * deshalb nicht nach, wenn gespeichert wird. Die Oberfläche braucht eine
 * Abfrage, die Dexie beobachtet; die drei Varianten hier unterscheiden sich
 * nur darin, wie sie den Ladezustand ausdrücken.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db, mergeSettings } from './db';
import { DEFAULT_SETTINGS, type Settings } from '../types';

export { mergeSettings };

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

/**
 * Liefert während des Ladens bereits die Vorgabewerte — für Anzeigen, die
 * nie leer sein sollen. Wer Werte daraus *übernimmt* (etwa als Vorbelegung
 * in ein Formular), muss zusätzlich `useSettingsLoaded()` abwarten.
 */
export function useSettingsValues(): Settings {
  return useSettings() ?? DEFAULT_SETTINGS;
}

/**
 * Sind die Einstellungen schon aus der Datenbank da? `null` in der Abfrage
 * heißt „geladen, aber nie gespeichert" — dann gelten die Vorgaben zu Recht.
 */
export function useSettingsLoaded(): boolean {
  const stored = useLiveQuery(async () => (await db.settings.get('singleton')) ?? null, []);
  return stored !== undefined;
}
