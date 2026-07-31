import { useEffect, useState } from 'react';
import { Badge, Button, Callout, Sheet, Stack, useToast } from '../../ui';
import {
  INSTALL_HINT,
  NOTIFY_ASK_TEXT,
  NOTIFY_HONESTY,
  NOTIFY_STATE_LABEL,
  notifyState,
  requestNotificationPermission,
  type NotifyState,
} from './notify';

const TONE: Record<NotifyState, 'ok' | 'warn' | 'neutral' | 'alert'> = {
  granted: 'ok',
  ask: 'warn',
  needs_install: 'warn',
  denied: 'alert',
  unsupported: 'neutral',
};

function Punkte({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-[0.9rem] leading-relaxed text-text-dim">
          <span aria-hidden="true" className="text-text-faint">
            •
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Alles zu den Erinnerungen an einer Stelle: Zustand, ehrliche Erklärung,
 * und — falls noch nicht geschehen — die Frage nach der Berechtigung.
 *
 * Der Systemdialog kommt nur ein einziges Mal. Deshalb wird hier vorher
 * erklärt, worum es geht, und erst auf ausdrücklichen Knopfdruck gefragt.
 */
export function NotifySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<NotifyState>('unsupported');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (open) setState(notifyState());
  }, [open]);

  async function ask() {
    setAsking(true);
    try {
      const result = await requestNotificationPermission();
      setState(notifyState());
      if (result === 'granted') toast.success('Erinnerungen sind eingeschaltet.');
      else if (result === 'denied')
        toast.show('Das iPhone hat Mitteilungen abgelehnt. Umstellen geht nur noch in den iPhone-Einstellungen.', {
          tone: 'warn',
          durationMs: 6000,
        });
      else if (result === 'unsupported')
        toast.error('Auf diesem Gerät sind Mitteilungen nicht möglich.');
    } finally {
      setAsking(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Erinnerungen">
      <Stack gap="lg">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.95rem] font-medium text-text">Mitteilungen</span>
          <Badge tone={TONE[state]}>{NOTIFY_STATE_LABEL[state]}</Badge>
        </div>

        {state === 'ask' && (
          <Stack gap="sm">
            <p className="text-[0.95rem] leading-relaxed text-text">{NOTIFY_ASK_TEXT.lead}</p>
            <Punkte items={NOTIFY_ASK_TEXT.points} />
            <Button variant="primary" size="lg" block icon="bell" loading={asking} onClick={ask}>
              Jetzt fragen
            </Button>
          </Stack>
        )}

        {state === 'needs_install' && (
          <Callout tone="warn" icon="info" title="Die App muss auf dem Home-Bildschirm liegen">
            <p className="mt-1">
              In einem Browser-Tab erlaubt das iPhone keine Mitteilungen. So kommt die App auf
              den Home-Bildschirm:
            </p>
            <ol className="mt-2 flex flex-col gap-1.5">
              {INSTALL_HINT.map((t, i) => (
                <li key={t} className="flex gap-2">
                  <span className="text-text-faint tabular">{i + 1}.</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </Callout>
        )}

        {state === 'denied' && (
          <Callout tone="alert" icon="alert" title="Mitteilungen sind abgelehnt">
            Das lässt sich nur noch am iPhone selbst ändern: Einstellungen → Mitteilungen →
            Cattery → „Mitteilungen erlauben". Bis dahin zeigt der Kalender fällige Erinnerungen
            weiterhin als Karte in der App.
          </Callout>
        )}

        {state === 'unsupported' && (
          <Callout tone="neutral" icon="info" title="Auf diesem Gerät nicht möglich">
            Dieser Browser kennt keine Mitteilungen. Die Erinnerungen erscheinen deshalb nur als
            Karte im Kalender — sie gehen nicht verloren.
          </Callout>
        )}

        {state === 'granted' && (
          <Callout tone="ok" icon="check-circle" title="Erinnerungen sind eingeschaltet">
            Du bekommst eine Mitteilung 24 Stunden vor einem Termin und noch einmal 1 Stunde
            vorher. Bei jedem Termin lässt sich beides einzeln abschalten.
          </Callout>
        )}

        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
          <h3 className="text-[0.95rem] font-semibold text-text">{NOTIFY_HONESTY.title}</h3>
          <Punkte items={NOTIFY_HONESTY.points} />
        </section>

        <p className="px-1 text-[0.82rem] leading-relaxed text-text-faint">
          Eine Verbindung zum iPhone-Kalender gibt es bewusst nicht. Termine bleiben in dieser
          App.
        </p>
      </Stack>
    </Sheet>
  );
}
