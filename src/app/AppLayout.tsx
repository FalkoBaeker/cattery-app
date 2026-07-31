import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TabBar } from './TabBar';
import { db } from '../db/db';
import { useReminderRunner } from '../features/appointments/notify';

/**
 * Grundgerüst: Inhalt oben, Tab-Leiste unten.
 *
 * Hier hängt außerdem der Erinnerungs-Prüflauf. Er gehört bewusst in die
 * Hülle und nicht auf den Kalender-Bildschirm: Erinnerungen müssen kommen,
 * sobald die App offen ist — nicht erst, wenn man zufällig den Kalender
 * aufschlägt. Der Prüflauf selbst läuft nur einmal, egal wie viele Stellen
 * ihn anfordern (siehe `ensureReminderRunner`).
 */
export function AppLayout() {
  const { pathname } = useLocation();

  const settings = useLiveQuery(() => db.settings.get('singleton'), []);
  // Solange die Einstellungen noch laden, wird geprüft — ein verpasster
  // Termin wiegt schwerer als ein überflüssiger Prüflauf.
  const remindersEnabled = settings?.modules?.appointments !== false;
  useReminderRunner(remindersEnabled);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-full">
      <Outlet />
      <TabBar />
    </div>
  );
}
