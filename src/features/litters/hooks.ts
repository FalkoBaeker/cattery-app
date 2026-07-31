/**
 * Datenzugriffe des Wurf-Moduls.
 *
 * Alles Lesende läuft über `useLiveQuery`, damit die Oberfläche automatisch
 * nachzieht, sobald irgendwo geschrieben wird.
 */

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';
import type { Settings } from '../../types';

/**
 * Ergänzt gespeicherte Einstellungen um fehlende Zweige. Eine eigene Kopie,
 * weil `mergeSettings` in src/db/db.ts nicht ausgeführt wird — die Einstellungen
 * dort werden zwischengespeichert und wären damit nicht mehr „live".
 */
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

/** Einstellungen, die auf Änderungen reagieren. `undefined` = wird noch geladen. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => mergeSettings(await db.settings.get('singleton')), []);
}

/**
 * Tickt im Sekundentakt, solange `active` gilt — für den Wehen-Timer.
 * Der Wert selbst kommt immer aus der Datenbank; das hier erzwingt nur das
 * Neuzeichnen. Nach einer Bildschirmsperre stimmt die Anzeige damit sofort
 * wieder.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setTick(Date.now());
    const handle = window.setInterval(() => setTick(Date.now()), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, intervalMs]);

  return tick;
}
