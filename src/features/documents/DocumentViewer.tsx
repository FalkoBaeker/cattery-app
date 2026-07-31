/**
 * Vollbild-Betrachter für Dokumentseiten.
 *
 * Das Szenario aus den Anforderungen (F93): beim Tierarzt, der Impfpass liegt
 * zu Hause. Der Weg dorthin muss kurz sein und **ohne Netz** funktionieren —
 * die Seiten kommen aus IndexedDB, nichts wird nachgeladen.
 *
 * Bedienung: waagerecht wischen zwischen den Seiten, mit zwei Fingern zoomen,
 * doppelt tippen für schnelles Heranholen.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { ID } from '../../types';
import { Icon, IconButton, Spinner, EmptyState, Button } from '../../ui';
import { useAttachmentPages, type LoadedPage } from './useObjectUrls';
import { buildPageFileName } from './lib/filenames';
import { shareOrDownload } from './share/shareFile';

export interface DocumentViewerProps {
  /** Dokument aus der Datenbank; Titel und Seiten werden selbst geladen. */
  documentId?: ID;
  /** Alternativ: Seiten direkt vorgeben (z. B. eine einzelne Vorschau). */
  pageIds?: ID[];
  title?: string;
  initialIndex?: number;
  onClose: () => void;
}

const MAX_ZOOM = 6;

export function DocumentViewer({
  documentId,
  pageIds,
  title,
  initialIndex = 0,
  onClose,
}: DocumentViewerProps) {
  // `undefined` = wird geladen, `null` = gibt es nicht mehr.
  const doc = useLiveQuery(
    async () => (documentId ? ((await db.documents.get(documentId)) ?? null) : null),
    [documentId],
  );

  const ids = documentId
    ? doc === undefined
      ? undefined
      : (doc?.pageIds ?? [])
    : (pageIds ?? []);
  const { pages, error } = useAttachmentPages(ids);
  const heading = title ?? doc?.title ?? 'Dokument';

  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Seite hinter dem Betrachter darf nicht mitscrollen.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const count = pages?.length ?? 0;

  const scrollToPage = useCallback(
    (next: number) => {
      const el = scrollerRef.current;
      if (!el || count === 0) return;
      const target = Math.min(Math.max(next, 0), count - 1);
      const left = target * el.clientWidth;
      if (typeof el.scrollTo === 'function') el.scrollTo({ left, behavior: 'smooth' });
      else el.scrollLeft = left;
      // Sicherheitsnetz: „smooth" wird nicht überall ausgeführt (etwa bei
      // reduzierter Bewegung). Dann wird hart gesprungen — Hauptsache, der
      // Knopf tut das, was draufsteht.
      window.setTimeout(() => {
        if (Math.abs(el.scrollLeft - left) > 2) el.scrollLeft = left;
      }, 420);
    },
    [count],
  );

  // Escape schließt, Pfeiltasten blättern (hilft beim Prüfen am Rechner).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') scrollToPage(index + 1);
      if (e.key === 'ArrowLeft') scrollToPage(index - 1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, onClose, scrollToPage]);

  // Startseite anspringen, sobald die Seiten da sind.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pages || pages.length === 0) return;
    const target = Math.min(Math.max(initialIndex, 0), pages.length - 1);
    el.scrollLeft = target * el.clientWidth;
    setIndex(target);
  }, [pages, initialIndex]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((current) => (current === next ? current : next));
  }

  const current = pages?.[index];

  async function onShare() {
    if (!current) return;
    // Direkt aus der Datenbank lesen — kein fetch, kein Netz, nichts.
    const record = await db.attachments.get(current.id);
    if (!record) return;
    await shareOrDownload(
      record.blob,
      buildPageFileName(heading, index, count, current.mime),
      heading,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/75 to-transparent px-2 pb-6 safe-top">
        <IconButton
          icon="x"
          label="Betrachter schließen"
          onClick={onClose}
          className="border-transparent bg-white/12 text-white active:bg-white/25"
        />
        <div className="min-w-0 flex-1 px-1 text-white">
          <p className="truncate text-[0.95rem] font-semibold">{heading}</p>
          {count > 1 && (
            <p className="text-[0.78rem] text-white/70 tabular">
              Seite {index + 1} von {count}
            </p>
          )}
        </div>
        {current && (
          <IconButton
            icon="share"
            label="Seite teilen"
            onClick={onShare}
            className="border-transparent bg-white/12 text-white active:bg-white/25"
          />
        )}
      </header>

      {pages === undefined ? (
        <div className="flex flex-1 items-center justify-center text-white">
          <Spinner size={28} />
        </div>
      ) : pages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-sm text-white">
            <EmptyState
              icon="image"
              title="Keine Seiten vorhanden"
              description={
                error ??
                'Zu diesem Dokument ist kein Bild gespeichert. Nimm eine Seite mit der Kamera auf.'
              }
              action={
                <Button variant="quiet" onClick={onClose}>
                  Zurück
                </Button>
              }
            />
          </div>
        </div>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="no-scrollbar flex flex-1 snap-x snap-mandatory"
          style={{
            overflowX: zoomed ? 'hidden' : 'auto',
            overflowY: 'hidden',
          }}
        >
          {pages.map((page, i) => (
            <ZoomablePage
              key={page.id}
              page={page}
              active={i === index}
              onZoomChange={setZoomed}
            />
          ))}
        </div>
      )}

      {count > 1 && (
        <footer className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-3 bg-gradient-to-t from-black/75 to-transparent px-4 pt-8 pb-3 safe-bottom">
          <IconButton
            icon="chevron-left"
            label="Vorherige Seite"
            onClick={() => scrollToPage(index - 1)}
            disabled={index === 0}
            className="border-transparent bg-white/12 text-white active:bg-white/25"
          />
          <div className="flex items-center gap-1.5">
            {pages?.map((page, i) => (
              <span
                key={page.id}
                aria-hidden="true"
                className={[
                  'size-1.5 rounded-full transition-opacity',
                  i === index ? 'bg-white' : 'bg-white/35',
                ].join(' ')}
              />
            ))}
          </div>
          <IconButton
            icon="chevron-right"
            label="Nächste Seite"
            onClick={() => scrollToPage(index + 1)}
            disabled={index >= count - 1}
            className="border-transparent bg-white/12 text-white active:bg-white/25"
          />
        </footer>
      )}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  Eine zoombare Seite                                                */
/* ------------------------------------------------------------------ */

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const NEUTRAL: Transform = { scale: 1, x: 0, y: 0 };

function ZoomablePage({
  page,
  active,
  onZoomChange,
}: {
  page: LoadedPage;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>(NEUTRAL);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Verlässt man die Seite, wird der Zoom zurückgesetzt — sonst landet man
  // beim Zurückwischen in einem Ausschnitt, den man nicht mehr zuordnet.
  useEffect(() => {
    if (!active && transformRef.current.scale !== 1) setTransform(NEUTRAL);
  }, [active]);

  useEffect(() => {
    if (active) onZoomChange(transform.scale > 1.01);
  }, [active, transform.scale, onZoomChange]);

  /**
   * Die Gesten laufen über native Ereignisse mit `passive: false`. React
   * registriert `touchmove` passiv, dort greift `preventDefault()` nicht —
   * und Safari würde die ganze Seite mitziehen.
   */
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;

    let mode: 'none' | 'pinch' | 'pan' = 'none';
    let startDistance = 0;
    let startScale = 1;
    let startCenter = { x: 0, y: 0 };
    let startPoint = { x: 0, y: 0 };
    let origin = { x: 0, y: 0 };
    let lastTapAt = 0;

    function clampOffset(next: Transform): Transform {
      const box = node!.getBoundingClientRect();
      const limitX = (Math.max(next.scale, 1) - 1) * box.width * 0.5;
      const limitY = (Math.max(next.scale, 1) - 1) * box.height * 0.5;
      return {
        scale: next.scale,
        x: Math.min(Math.max(next.x, -limitX), limitX),
        y: Math.min(Math.max(next.y, -limitY), limitY),
      };
    }

    function distance(a: Touch, b: Touch) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function center(a: Touch, b: Touch) {
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        mode = 'pinch';
        startDistance = distance(e.touches[0], e.touches[1]) || 1;
        startScale = transformRef.current.scale;
        startCenter = center(e.touches[0], e.touches[1]);
        origin = { x: transformRef.current.x, y: transformRef.current.y };
        e.preventDefault();
      } else if (e.touches.length === 1 && transformRef.current.scale > 1.01) {
        mode = 'pan';
        startPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        origin = { x: transformRef.current.x, y: transformRef.current.y };
      } else {
        mode = 'none';
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (mode === 'pinch' && e.touches.length >= 2) {
        e.preventDefault();
        const factor = distance(e.touches[0], e.touches[1]) / startDistance;
        const scale = Math.min(Math.max(startScale * factor, 1), MAX_ZOOM);
        const now = center(e.touches[0], e.touches[1]);
        setTransform(
          clampOffset({
            scale,
            x: origin.x + (now.x - startCenter.x),
            y: origin.y + (now.y - startCenter.y),
          }),
        );
      } else if (mode === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        setTransform(
          clampOffset({
            scale: transformRef.current.scale,
            x: origin.x + (e.touches[0].clientX - startPoint.x),
            y: origin.y + (e.touches[0].clientY - startPoint.y),
          }),
        );
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length === 0) {
        if (mode === 'none') {
          // Doppeltippen: heranholen bzw. wieder ganz zeigen.
          const now = Date.now();
          if (now - lastTapAt < 320) {
            setTransform((t) => (t.scale > 1.01 ? NEUTRAL : { scale: 2.5, x: 0, y: 0 }));
            lastTapAt = 0;
          } else {
            lastTapAt = now;
          }
        }
        if (transformRef.current.scale <= 1.01) setTransform(NEUTRAL);
        mode = 'none';
      } else if (e.touches.length === 1 && transformRef.current.scale > 1.01) {
        mode = 'pan';
        startPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        origin = { x: transformRef.current.x, y: transformRef.current.y };
      }
    }

    node.addEventListener('touchstart', onTouchStart, { passive: false });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd);
    node.addEventListener('touchcancel', onTouchEnd);
    return () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const isZoomed = transform.scale > 1.01;

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full w-full shrink-0 snap-center snap-always items-center justify-center overflow-hidden"
      style={{ touchAction: isZoomed ? 'none' : 'pan-x' }}
    >
      <img
        src={page.url}
        alt=""
        draggable={false}
        className="max-h-full max-w-full object-contain select-none"
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transition: transform.scale === 1 ? 'transform 0.2s ease-out' : 'none',
        }}
      />
      {active && !isZoomed && (
        <span className="pointer-events-none absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[0.75rem] whitespace-nowrap text-white/70">
          <Icon name="search" size={13} />
          Doppelt tippen zum Vergrößern
        </span>
      )}
    </div>
  );
}
