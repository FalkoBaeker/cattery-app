/**
 * Sammelnachricht — ausdrücklich **kein Gruppenchat** (F76).
 *
 * Der Text wird einmal verfasst, dann öffnet die App für jeden Interessenten
 * einzeln nacheinander WhatsApp über einen wa.me-Verweis. Weil iOS dabei die
 * App wechselt und sie im Hintergrund verwerfen kann, liegt der Fortschritt
 * in der Datenbank: Nach dem Zurückkommen steht sofort wieder da, wer schon
 * dran war und wer noch aussteht.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Icon,
  Sheet,
  Stack,
  TextArea,
  useConfirm,
  useToast,
} from '../../ui';
import type { Interest } from '../../types';
import { db } from '../../db/db';
import { nowISO } from '../../lib/date';
import {
  broadcastProgress,
  buildWhatsAppUrl,
  fillTemplate,
  formatBroadcastProgress,
  markOpen,
  markSent,
  markSkipped,
  nextOpenRecipient,
  type BroadcastRecipient,
  type BroadcastRun,
} from './order';
import { addContactNote, clearBroadcastRun, saveBroadcastRun } from './store';

/* ================================================================== */
/*  Verfassen                                                          */
/* ================================================================== */

export function BroadcastComposeSheet({
  open,
  onClose,
  interests,
  template,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  /** Alle sichtbaren Interessenten in Listenreihenfolge. */
  interests: Interest[];
  /** Vorlage aus den Einstellungen. */
  template: string;
  onStarted: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState(template);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);

  // Die Vorlage wird nur beim Öffnen übernommen. Hinge der Effekt an
  // `template`, würde die nachgeladene Einstellungs-Abfrage getippten Text
  // und Empfängerauswahl zurücksetzen, während das Blatt offen ist.
  const templateRef = useRef(template);
  templateRef.current = template;
  useEffect(() => {
    if (open) {
      setText(templateRef.current);
      setSelected(new Set());
    }
  }, [open]);

  const reachable = useMemo(
    () => interests.filter((i) => buildWhatsAppUrl(i.phone) !== null),
    [interests],
  );
  const unreachable = interests.length - reachable.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chosen = reachable.filter((i) => selected.has(i.id));
  const allChosen = reachable.length > 0 && chosen.length === reachable.length;
  const canStart = chosen.length > 0 && text.trim() !== '';

  const preview = chosen[0] ? fillTemplate(text, chosen[0].name) : null;

  async function start() {
    if (!canStart) return;
    setStarting(true);
    try {
      const run: BroadcastRun = {
        startedAt: nowISO(),
        text,
        recipients: chosen.map((i) => ({
          interestId: i.id,
          name: i.name,
          phone: i.phone,
        })),
      };
      await saveBroadcastRun(run);
      onStarted();
      onClose();
    } catch {
      toast.error('Der Versand ließ sich nicht starten. Bitte noch einmal versuchen.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title="Sammelnachricht"
      footer={
        <Button variant="primary" block disabled={!canStart} loading={starting} onClick={start}>
          {chosen.length > 0
            ? `Versand starten (${chosen.length})`
            : 'Versand starten'}
        </Button>
      }
    >
      <Stack gap="lg">
        <Callout tone="accent" icon="info" title="Einzeln, nicht als Gruppe">
          Die App öffnet WhatsApp nacheinander für jede Person einzeln. Es entsteht kein
          Gruppenchat.
        </Callout>

        <TextArea
          label="Nachricht"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          hint="{name} wird durch den jeweiligen Namen ersetzt."
          placeholder="Hallo {name}, …"
        />

        {preview && (
          <Card className="bg-surface-2">
            <p className="mb-1.5 text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
              Vorschau für {chosen[0].name}
            </p>
            <p className="selectable text-[0.92rem] leading-relaxed whitespace-pre-wrap text-text">
              {preview}
            </p>
          </Card>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3 px-1">
            <h2 className="text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
              Empfänger
            </h2>
            {reachable.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelected(allChosen ? new Set() : new Set(reachable.map((i) => i.id)))
                }
              >
                {allChosen ? 'Keine' : 'Alle'}
              </Button>
            )}
          </div>

          {interests.length === 0 ? (
            <EmptyState
              icon="users"
              title="Niemand auf der Warteliste"
              description="Sobald Interessenten eingetragen sind, kannst du ihnen allen auf einmal schreiben."
            />
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
              {interests.map((i) => {
                const hasNumber = buildWhatsAppUrl(i.phone) !== null;
                const checked = selected.has(i.id);
                return (
                  <label
                    key={i.id}
                    className={[
                      'flex min-h-14 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0',
                      hasNumber ? 'active:bg-surface-2' : 'opacity-60',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={checked}
                      disabled={!hasNumber}
                      onChange={() => toggle(i.id)}
                    />
                    <span
                      aria-hidden="true"
                      className={[
                        'flex size-6 shrink-0 items-center justify-center rounded-md border',
                        checked
                          ? 'border-accent bg-accent text-on-accent'
                          : 'border-border-strong bg-surface',
                      ].join(' ')}
                    >
                      {checked && <Icon name="check" size={15} strokeWidth={2.6} />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[0.95rem] font-medium text-text">{i.name}</span>
                      <span className="truncate text-[0.82rem] text-text-dim">
                        {hasNumber ? i.phone : 'Keine Telefonnummer hinterlegt'}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {unreachable > 0 && (
            <p className="px-1 text-[0.82rem] text-text-faint">
              {unreachable === 1
                ? 'Eine Person hat keine Telefonnummer und kann nicht ausgewählt werden.'
                : `${unreachable} Personen haben keine Telefonnummer und können nicht ausgewählt werden.`}
            </p>
          )}
        </div>
      </Stack>
    </Sheet>
  );
}

/* ================================================================== */
/*  Versenden                                                          */
/* ================================================================== */

function RecipientRow({
  recipient,
  isNext,
  onReopen,
}: {
  recipient: BroadcastRecipient;
  isNext: boolean;
  onReopen: () => void;
}) {
  const done = Boolean(recipient.sentAt);
  const skipped = Boolean(recipient.skippedAt);

  return (
    <div
      className={[
        'flex min-h-14 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0',
        isNext ? 'bg-accent-soft' : '',
      ].join(' ')}
    >
      <span
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          done ? 'bg-ok-soft text-ok' : skipped ? 'bg-surface-2 text-text-faint' : 'bg-surface-2 text-text-dim',
        ].join(' ')}
      >
        <Icon name={done ? 'check' : skipped ? 'minus' : 'clock'} size={17} strokeWidth={2.2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[0.95rem] font-medium text-text">{recipient.name}</span>
        <span className="truncate text-[0.82rem] text-text-dim">
          {done ? 'verschickt' : skipped ? 'übersprungen' : isNext ? 'als Nächstes' : 'steht noch aus'}
        </span>
      </span>
      {(done || skipped) && (
        <Button size="sm" variant="ghost" onClick={onReopen}>
          Nochmal
        </Button>
      )}
    </div>
  );
}

export function BroadcastRunSheet({
  open,
  onClose,
  run,
}: {
  open: boolean;
  onClose: () => void;
  run: BroadcastRun;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const progress = broadcastProgress(run);
  const next = nextOpenRecipient(run);

  // Die Nummer kommt frisch aus der Datenbank, nicht aus dem eingefrorenen
  // Vorgang — sonst hülfe der Hinweis „Nummer im Eintrag ergänzen" nichts.
  // Solange die Abfrage lädt (oder der Eintrag gelöscht wurde), gilt die
  // beim Start gemerkte Nummer.
  const liveNext = useLiveQuery(
    async () => (next ? ((await db.interests.get(next.interestId)) ?? null) : null),
    [next?.interestId],
  );
  const nextPhone = liveNext?.phone ?? next?.phone;
  const nextUrl = next ? buildWhatsAppUrl(nextPhone, fillTemplate(run.text, next.name)) : null;

  async function send() {
    if (!next) return;
    const message = fillTemplate(run.text, next.name);
    const url = buildWhatsAppUrl(nextPhone, message);
    if (!url) {
      toast.error(`Für ${next.name} ist keine brauchbare Telefonnummer hinterlegt.`);
      return;
    }
    setBusy(true);
    // Das Fenster muss synchron im Fingertipp entstehen — nach einem `await`
    // blockt iOS Safari `window.open` grundsätzlich. Deshalb: erst leeres
    // Fenster öffnen, dann speichern, zuletzt die Adresse setzen. Erst merken,
    // dann losschicken: Sobald WhatsApp startet, kann iOS die App jederzeit
    // verwerfen — was dann nicht gespeichert ist, wäre verloren.
    const win = window.open('about:blank', '_blank');
    if (win) win.opener = null;
    try {
      await saveBroadcastRun(markSent(run, next.interestId, nowISO()));
      await addContactNote(next.interestId, 'whatsapp', message);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch {
      win?.close();
      toast.error('Die Nachricht konnte nicht vorbereitet werden.');
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!next) return;
    setBusy(true);
    try {
      await saveBroadcastRun(markSkipped(run, next.interestId, nowISO()));
    } catch {
      toast.error('Das Überspringen ließ sich nicht speichern.');
    } finally {
      setBusy(false);
    }
  }

  async function reopen(interestId: string) {
    try {
      await saveBroadcastRun(markOpen(run, interestId));
    } catch {
      toast.error('Der Eintrag ließ sich nicht wieder öffnen.');
    }
  }

  async function finish() {
    if (progress.open > 0) {
      const ok = await confirm({
        title: 'Versand beenden?',
        message:
          progress.open === 1
            ? 'Eine Person hat noch keine Nachricht bekommen.'
            : `${progress.open} Personen haben noch keine Nachricht bekommen.`,
        confirmLabel: 'Beenden',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await clearBroadcastRun();
    } catch {
      toast.error('Der Versand ließ sich nicht beenden.');
      return;
    }
    toast.success(`Versand beendet — ${formatBroadcastProgress(run)}.`);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title="Sammelnachricht läuft"
      footer={
        progress.finished ? (
          <Button variant="primary" block icon="check" onClick={finish}>
            Versand abschließen
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              block
              size="lg"
              icon="whatsapp"
              loading={busy}
              disabled={!nextUrl}
              onClick={send}
            >
              {next ? `An ${next.name} senden` : 'Senden'}
            </Button>
            <Button variant="quiet" block onClick={skip} disabled={busy || !next}>
              {next ? `${next.name} überspringen` : 'Überspringen'}
            </Button>
          </div>
        )
      }
    >
      <Stack gap="md">
        {progress.finished ? (
          <Callout tone="ok" icon="check-circle" title="Alle sind dran gewesen">
            {formatBroadcastProgress(run)}. Mit „Versand abschließen" wird der Vorgang beendet.
          </Callout>
        ) : (
          <Callout tone="accent" icon="info" title={formatBroadcastProgress(run)}>
            Nach dem Tippen wechselt das iPhone zu WhatsApp. Komm einfach wieder hierher zurück —
            der Stand bleibt erhalten, auch wenn die App zwischendurch neu startet.
          </Callout>
        )}

        {next && !nextUrl && (
          <Callout tone="warn" icon="alert" title="Keine Telefonnummer">
            Für {next.name} ist keine brauchbare Nummer hinterlegt. Bitte überspringen oder die
            Nummer im Eintrag ergänzen.
          </Callout>
        )}

        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          {run.recipients.map((r) => (
            <RecipientRow
              key={r.interestId}
              recipient={r}
              isNext={r.interestId === next?.interestId}
              onReopen={() => void reopen(r.interestId)}
            />
          ))}
        </div>

        <Card className="bg-surface-2">
          <p className="mb-1.5 text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
            Der Text
          </p>
          <p className="selectable text-[0.9rem] leading-relaxed whitespace-pre-wrap text-text-dim">
            {run.text}
          </p>
        </Card>

        <Button variant="ghost" block onClick={finish}>
          Versand beenden
        </Button>
      </Stack>
    </Sheet>
  );
}

/** Hinweisband auf der Warteliste, solange ein Versand offen ist. */
export function BroadcastBanner({ run, onOpen }: { run: BroadcastRun; onOpen: () => void }) {
  const progress = broadcastProgress(run);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-card)] border border-accent/25 bg-accent-soft px-4 py-3 text-left active:brightness-95"
    >
      <Icon name="whatsapp" size={20} className="shrink-0 text-accent" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[0.92rem] font-semibold text-accent">
          {progress.finished ? 'Sammelnachricht abschließen' : 'Sammelnachricht läuft'}
        </span>
        <span className="truncate text-[0.82rem] text-text-dim">
          {formatBroadcastProgress(run)}
        </span>
      </span>
      <Badge tone="accent">{progress.finished ? 'fertig' : `${progress.open} offen`}</Badge>
      <Icon name="chevron-right" size={18} className="shrink-0 text-accent" />
    </button>
  );
}
