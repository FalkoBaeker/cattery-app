import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
/* eslint-disable react/only-export-components -- Bestätigungs-Provider und Zugriffshook werden als gemeinsame UI-API exportiert. */
import { createPortal } from 'react-dom';
import { Button, IconButton } from './Button';

/* ------------------------------------------------------------------ */
/*  Hintergrund-Sperre                                                 */
/* ------------------------------------------------------------------ */

let lockCount = 0;
let savedScrollY = 0;
const escapeStack: symbol[] = [];

/**
 * Verhindert, dass die Seite hinter einem Blatt mitscrollt. Auf iOS reicht
 * `overflow: hidden` nicht — die Position muss festgesetzt werden.
 */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.width = '100%';
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}

/** Hält den Tastaturfokus innerhalb des Blattes. */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;

    const selector =
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

    // Ersten sinnvollen Fokus setzen, aber keine Tastatur aufpoppen lassen:
    // Eingabefelder werden bewusst übersprungen.
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(selector));
    const firstButton = focusables.find((el) => el.tagName === 'BUTTON');
    (firstButton ?? node).focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const list = Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null,
      );
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      previous?.focus?.({ preventScroll: true });
    };
  }, [ref, active]);
}

/**
 * Schließt bei Escape ausschließlich die oberste Dialogebene.
 *
 * Ein Bestätigungsdialog kann über einem noch geöffneten Sheet liegen. Ohne
 * gemeinsamen Stapel reagieren sonst beide globalen Listener auf denselben
 * Tastendruck und der ungespeicherte Entwurf darunter geht ebenfalls zu.
 */
function useTopmostEscape(active: boolean, onEscape: () => void) {
  const token = useRef(Symbol('dialog'));
  const callback = useRef(onEscape);
  callback.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const current = token.current;
    escapeStack.push(current);

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || escapeStack[escapeStack.length - 1] !== current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      callback.current();
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = escapeStack.lastIndexOf(current);
      if (index >= 0) escapeStack.splice(index, 1);
    };
  }, [active]);
}

/* ------------------------------------------------------------------ */
/*  Blatt von unten                                                    */
/* ------------------------------------------------------------------ */

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Rechts oben, z. B. ein Speichern-Knopf. */
  action?: ReactNode;
  children: ReactNode;
  /** Fester Fußbereich, der nicht mitscrollt. */
  footer?: ReactNode;
  /** Blatt füllt fast den ganzen Bildschirm. */
  tall?: boolean;
}

export function Sheet({ open, onClose, title, action, children, footer, tall }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);
  useFocusTrap(panelRef, open);
  useTopmostEscape(open, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          'sheet-surface relative flex animate-sheet-in flex-col rounded-t-[1.5rem] bg-bg shadow-[var(--shadow-sheet)] outline-none',
          tall ? 'h-[92dvh]' : 'max-h-[88dvh]',
        ].join(' ')}
      >
        <div className="screen-header flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          <IconButton icon="x" label="Schließen" size="sm" onClick={onClose} />
          <h2 className="min-w-0 flex-1 truncate text-center text-[1rem] font-semibold">
            {title}
          </h2>
          <span className="flex min-w-9 justify-end">{action}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>

        {footer && (
          <div className="pearl-panel shrink-0 border-t border-border bg-surface px-4 pt-3 safe-bottom">
            <div className="pb-3">{footer}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  Rückfrage                                                          */
/* ------------------------------------------------------------------ */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(state !== null);
  useFocusTrap(panelRef, state !== null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setState({ ...options, resolve }));
  }, []);

  const close = useCallback(
    (result: boolean) => {
      setState((s) => {
        s?.resolve(result);
        return null;
      });
    },
    [],
  );

  useTopmostEscape(state !== null, () => close(false));

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <div
              className="absolute inset-0 animate-fade-in bg-black/40"
              onClick={() => close(false)}
              aria-hidden="true"
            />
            <div
              ref={panelRef}
              role="alertdialog"
              aria-modal="true"
              aria-label={state.title}
              tabIndex={-1}
              className="pearl-panel relative w-full max-w-sm animate-fade-in rounded-[1.25rem] border border-border bg-surface p-5 shadow-[var(--shadow-raised)] outline-none"
            >
              <h2 className="text-[1.05rem] font-semibold text-text">{state.title}</h2>
              {state.message && (
                <p className="mt-2 text-[0.9rem] leading-relaxed text-text-dim">{state.message}</p>
              )}
              <div className="mt-5 flex gap-2">
                <Button block onClick={() => close(false)}>
                  {state.cancelLabel ?? 'Abbrechen'}
                </Button>
                <Button
                  block
                  variant={state.danger ? 'danger' : 'primary'}
                  onClick={() => close(true)}
                >
                  {state.confirmLabel ?? 'OK'}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}

/** `const confirm = useConfirm(); if (await confirm({title: '…'})) …` */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm benötigt einen ConfirmProvider im Baum.');
  return ctx;
}
