import { Outlet, useLocation } from 'react-router';
import { Suspense, useEffect } from 'react';
import { TabBar } from './TabBar';
import { useReminderRunner } from '../features/appointments/notify';
import { Spinner } from '../ui';
import { useSettings } from '../db/useSettings';

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

  const settings = useSettings();
  // Erst nach dem Laden starten: Ein bewusst ausgeschalteter Kalender darf
  // auch beim App-Start keinen kurzen Prüflauf mehr anstoßen.
  const remindersEnabled = settings?.modules.appointments === true;
  useReminderRunner(remindersEnabled);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app-surface min-h-full">
      <Suspense
        fallback={
          <div
            className="flex min-h-[60dvh] items-center justify-center text-text-faint"
            aria-label="Bildschirm wird geladen"
          >
            <Spinner size={26} />
          </div>
        }
      >
        <Outlet />
      </Suspense>
      <TabBar />
    </div>
  );
}
