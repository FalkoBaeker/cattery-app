import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Card, IconButton } from '../../ui';

/**
 * Karte, die sich zur Seite wegwischen lässt.
 *
 * Für die Nachbereitungs-Frage („Wie war's?"): sie soll da sein, aber sich
 * mit einer Handbewegung loswerden lassen. Weil Wischen nichts ist, was man
 * sieht, gibt es zusätzlich immer einen sichtbaren Schließen-Knopf —
 * das ist auch der Weg für die Sprachausgabe.
 *
 * Senkrechtes Scrollen bleibt möglich: Die Geste greift erst, wenn die
 * Bewegung eindeutig waagerecht ist.
 *
 * `onDismiss` darf `false` (auch als Versprechen) zurückgeben, wenn das
 * Ausblenden nicht geklappt hat — dann kommt die Karte sichtbar zurück,
 * statt als unsichtbare Lücke im Layout stehen zu bleiben.
 */
export function SwipeCard({
  onDismiss,
  dismissLabel = 'Ausblenden',
  children,
}: {
  onDismiss: () => void | boolean | Promise<void | boolean>;
  dismissLabel?: string;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [leaving, setLeaving] = useState<null | number>(null);
  const drag = useRef<{ x: number; y: number; engaged: boolean } | null>(null);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  /** Karte zurückholen: das Ausblenden ist fehlgeschlagen. */
  function comeBack() {
    if (!alive.current) return;
    setLeaving(null);
    setOffset(0);
  }

  function finish(direction: number) {
    setLeaving(direction);
    timer.current = window.setTimeout(() => {
      let result: void | boolean | Promise<void | boolean>;
      try {
        result = onDismiss();
      } catch {
        comeBack();
        return;
      }
      if (result === false) {
        comeBack();
        return;
      }
      if (result && typeof (result as Promise<void | boolean>).then === 'function') {
        void (result as Promise<void | boolean>).then(
          (ok) => {
            if (ok === false) comeBack();
          },
          () => comeBack(),
        );
      }
    }, 180);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (leaving !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, engaged: false };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.engaged) {
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
        // Das ist Scrollen, kein Wischen.
        drag.current = null;
        return;
      }
      if (Math.abs(dx) > 14) {
        d.engaged = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } else {
        return;
      }
    }
    setOffset(dx);
  }

  function onPointerEnd() {
    const d = drag.current;
    drag.current = null;
    if (!d?.engaged) {
      setOffset(0);
      return;
    }
    if (Math.abs(offset) > 90) finish(offset > 0 ? 1 : -1);
    else setOffset(0);
  }

  const x = leaving !== null ? leaving * 500 : offset;
  const dragging = drag.current?.engaged === true;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{
        touchAction: 'pan-y',
        transform: `translateX(${x}px)`,
        opacity: leaving !== null ? 0 : 1 - Math.min(Math.abs(offset) / 260, 0.6),
        transition: dragging ? 'none' : 'transform 180ms ease-out, opacity 180ms ease-out',
      }}
    >
      <Card>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {/* Volle 44 px — die Karte wird oft einhändig weggetippt. */}
          <IconButton icon="x" label={dismissLabel} variant="quiet" onClick={() => finish(1)} />
        </div>
      </Card>
    </div>
  );
}
