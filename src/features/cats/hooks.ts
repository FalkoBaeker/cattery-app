/**
 * Kleine Helfer für das Modul Zuchttiere.
 *
 * Sie liegen bewusst hier und nicht in src/ui — erst wenn ein zweites Modul
 * sie braucht, wandern sie nach oben (siehe CLAUDE.md).
 */

import { useEffect, useState } from 'react';
import { attachmentUrl } from '../../db/db';
import type { ID } from '../../types';

// Einstellungen reaktiv lesen — zentrale Quelle in src/db/useSettings.ts.
// Dieses Modul braucht die Variante, die während des Ladens schon die
// Vorgabewerte liefert (Oberfläche nie leer), plus `useSettingsLoaded` für
// Formular-Vorbelegungen.
export { useSettingsValues as useSettings, useSettingsLoaded } from '../../db/useSettings';

/**
 * Objekt-URL zu einem Anhang. Gibt die URL beim Wechsel und beim Aufräumen
 * wieder frei — sonst hält der Browser den Blob für immer fest.
 */
export function useAttachmentUrl(id?: ID | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;

    void attachmentUrl(id).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      created = u;
      setUrl(u);
    });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [id]);

  return url;
}
