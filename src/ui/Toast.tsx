import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { newId } from '../lib/id';

type ToastTone = 'neutral' | 'ok' | 'warn' | 'alert';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  icon?: IconName;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, options?: { tone?: ToastTone; icon?: IconName; durationMs?: number; action?: ToastItem['action'] }) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  neutral: 'bg-surface-3 text-text',
  ok: 'bg-ok text-white',
  warn: 'bg-warn text-white',
  alert: 'bg-alert text-white',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, options) => {
      const item: ToastItem = {
        id: newId(),
        message,
        tone: options?.tone ?? 'neutral',
        icon: options?.icon,
        action: options?.action,
      };
      // Höchstens drei gleichzeitig, sonst verdeckt es den halben Bildschirm.
      setItems((list) => [...list.slice(-2), item]);
      const handle = window.setTimeout(() => dismiss(item.id), options?.durationMs ?? 3200);
      timers.current.set(item.id, handle);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, { tone: 'ok', icon: 'check-circle' }),
      error: (m) => show(m, { tone: 'alert', icon: 'alert', durationMs: 5000 }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
          role="status"
          aria-live="polite"
        >
          {items.map((t) => (
            <div
              key={t.id}
              className={[
                'pointer-events-auto flex w-full max-w-sm animate-toast-in items-center gap-2.5 rounded-full px-4 py-3 shadow-[var(--shadow-raised)]',
                TONE_CLASS[t.tone],
              ].join(' ')}
            >
              {t.icon && <Icon name={t.icon} size={19} />}
              <span className="min-w-0 flex-1 text-[0.9rem] font-medium">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  className="shrink-0 text-[0.88rem] font-semibold underline underline-offset-2"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Meldung schließen"
                className="shrink-0 opacity-70"
                onClick={() => dismiss(t.id)}
              >
                <Icon name="x" size={17} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast benötigt einen ToastProvider im Baum.');
  return ctx;
}
