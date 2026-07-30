import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/routes';
import { ConfirmProvider, ToastProvider } from './ui';
import { getSettings, requestPersistentStorage } from './db/db';

/** Setzt das Farbschema aus den Einstellungen auf das Wurzelelement. */
function useTheme() {
  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (cancelled) return;
        if (s.theme === 'system') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', s.theme);
      })
      .catch(() => {
        /* Vorgabe: Systemeinstellung */
      });
    return () => {
      cancelled = true;
    };
  }, []);
}

export default function App() {
  useTheme();

  useEffect(() => {
    // Ohne diese Zusage darf iOS die Datenbank bei Speicherdruck verwerfen.
    void requestPersistentStorage();
  }, []);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ToastProvider>
  );
}
