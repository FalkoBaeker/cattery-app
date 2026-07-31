/**
 * Datenzugriffe des Wurf-Moduls.
 *
 * Alles Lesende läuft über `useLiveQuery`, damit die Oberfläche automatisch
 * nachzieht, sobald irgendwo geschrieben wird.
 */

import { useEffect, useState } from 'react';

// Einstellungen reaktiv lesen — zentrale Quelle in src/db/useSettings.ts.
export { mergeSettings, useSettings } from '../../db/useSettings';

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
