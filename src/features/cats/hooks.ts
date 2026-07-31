/**
 * Kleine Helfer für das Modul Zuchttiere.
 *
 * Sie liegen bewusst hier und nicht in src/ui — erst wenn ein zweites Modul
 * sie braucht, wandern sie nach oben (siehe CLAUDE.md).
 */

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { attachmentUrl, db } from '../../db/db';
import { DEFAULT_SETTINGS, type ID, type Settings } from '../../types';

/**
 * Einstellungen reaktiv lesen. Solange nichts gespeichert ist (frische App),
 * gelten die Vorgabewerte — so hat die Oberfläche nie einen leeren Zustand.
 */
export function useSettings(): Settings {
  const stored = useLiveQuery(() => db.settings.get('singleton'), []);
  return useMemo<Settings>(() => {
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
  }, [stored]);
}

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
