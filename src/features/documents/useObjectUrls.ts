/**
 * Objekt-URLs mit garantierter Freigabe.
 *
 * Jede `URL.createObjectURL` hält den Blob im Speicher, bis
 * `URL.revokeObjectURL` kommt. Bei zwanzig Impfpass-Seiten mit je 300 kB
 * ist das der Unterschied zwischen „läuft" und „Safari beendet die App".
 * Deshalb geht in diesem Modul keine Objekt-URL an den Hooks hier vorbei.
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '../../db/db';
import type { ID } from '../../types';

/**
 * `URL.createObjectURL` wirft, wenn ein Datensatz beschädigt ist oder gar
 * kein Blob mehr enthält. Eine einzelne kaputte Seite darf nicht das ganze
 * Dokument unlesbar machen.
 */
function safeObjectUrl(blob: Blob): string | null {
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** Objekt-URL für einen Blob; wird beim Wechsel und beim Abbau freigegeben. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = safeObjectUrl(blob);
    setUrl(next);
    if (!next) return;
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [blob]);

  return url;
}

/** Lädt einen Anhang aus der Datenbank und liefert eine Objekt-URL. */
export function useAttachmentUrl(id: ID | null | undefined): {
  url: string | null;
  loading: boolean;
  missing: boolean;
} {
  const [state, setState] = useState<{ url: string | null; loading: boolean; missing: boolean }>({
    url: null,
    loading: Boolean(id),
    missing: false,
  });

  useEffect(() => {
    if (!id) {
      setState({ url: null, loading: false, missing: false });
      return;
    }

    let cancelled = false;
    let created: string | null = null;
    setState({ url: null, loading: true, missing: false });

    db.attachments
      .get(id)
      .then((attachment) => {
        if (cancelled) return;
        if (!attachment) {
          setState({ url: null, loading: false, missing: true });
          return;
        }
        created = safeObjectUrl(attachment.blob);
        setState({ url: created, loading: false, missing: created === null });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, loading: false, missing: true });
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id]);

  return state;
}

export interface LoadedPage {
  id: ID;
  url: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
}

/**
 * Lädt mehrere Anhänge auf einmal — für den Betrachter, der alle Seiten
 * eines Dokuments gleichzeitig zeigen können muss.
 */
export function useAttachmentPages(ids: ID[] | undefined): {
  pages: LoadedPage[] | undefined;
  error: string | null;
} {
  const key = useMemo(() => (ids ?? []).join('|'), [ids]);
  const [pages, setPages] = useState<LoadedPage[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids === undefined) {
      setPages(undefined);
      return;
    }
    const list = key === '' ? [] : key.split('|');
    if (list.length === 0) {
      setPages([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const created: string[] = [];
    setPages(undefined);
    setError(null);

    Promise.all(list.map((id) => db.attachments.get(id)))
      .then((records) => {
        if (cancelled) return;
        const loaded: LoadedPage[] = [];
        for (const record of records) {
          if (!record) continue;
          const url = safeObjectUrl(record.blob);
          if (!url) continue;
          created.push(url);
          loaded.push({
            id: record.id,
            url,
            mime: record.mime,
            bytes: record.bytes,
            width: record.width,
            height: record.height,
          });
        }
        if (cancelled) {
          created.forEach((u) => URL.revokeObjectURL(u));
          return;
        }
        setPages(loaded);
        if (loaded.length < records.length) {
          setError('Einzelne Seiten fehlen — vermutlich beim Aufräumen gelöscht.');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPages([]);
          setError('Die Seiten konnten nicht geladen werden.');
        }
      });

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // `key` steht stellvertretend für den Inhalt von `ids`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ids === undefined]);

  return { pages, error };
}
