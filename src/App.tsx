import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './app/routes';
import { ConfirmProvider, ToastProvider, useToast } from './ui';
import {
  cleanupOrphanAttachments,
  getSettings,
  requestPersistentStorage,
} from './db/db';

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

function AppContent() {
  const toast = useToast();
  useEffect(() => {
    // Ohne diese Zusage darf iOS die Datenbank bei Speicherdruck verwerfen.
    void requestPersistentStorage().catch(() => {
      // Nicht unterstützte oder abgelehnte dauerhafte Speicherung ist kein
      // Absturzgrund; die Sicherungshinweise bleiben der verlässliche Schutz.
    });

    // Abgebrochene Foto-/PDF-Speichervorgänge können Blobs ohne Verweis
    // hinterlassen. Nur mindestens eine Stunde alte Waisen werden entfernt.
    void cleanupOrphanAttachments().catch(() => {
      toast.error('Die automatische Speicherbereinigung ist fehlgeschlagen.');
    });
  }, [toast]);

  return <RouterProvider router={router} />;
}

export default function App() {
  useTheme();

  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppContent />
      </ConfirmProvider>
    </ToastProvider>
  );
}
