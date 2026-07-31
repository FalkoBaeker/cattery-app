/**
 * Das Geburtsprotokoll.
 *
 * Wird nachts, einhändig und unter Anspannung bedient. Deshalb:
 * große Flächen, wenige Fragen, und **alles landet sofort in der Datenbank**.
 * Bildschirmsperre, Neuladen oder ein leerer Akku ändern nichts am Verlauf.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Callout,
  Card,
  EmptyState,
  Icon,
  IconButton,
  NumberInput,
  Section,
  Sheet,
  Switch,
  TextArea,
  useConfirm,
  useToast,
  type IconName,
} from '../../ui';
import { BIRTH_EVENT_LABEL, collarColor } from '../../types';
import type { BirthEvent, BirthEventKind, CollarColorKey, Kitten, Litter, Settings } from '../../types';
import { db } from '../../db/db';
import { formatGrams } from '../../lib/format';
import { formatTime, nowISO } from '../../lib/date';
import {
  addBirthEvent,
  addKitten,
  deleteKitten,
  ensureLitterBorn,
} from './data';
import {
  CONTRACTION_TREND_LABEL,
  contractionStats,
  formatDuration,
  suggestCollarColor,
} from './litter';
import { useTicker } from './hooks';
import { CollarDot, CollarPicker } from './parts';

const EVENT_ICON: Record<BirthEventKind, IconName> = {
  contraction: 'clock',
  kitten_born: 'paw',
  placenta: 'check-circle',
  note: 'edit',
};

export function BirthLogSheet({
  open,
  onClose,
  litter,
  kittens,
  events,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  litter: Litter;
  kittens: Kitten[];
  events: BirthEvent[];
  settings: Settings;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const tick = useTicker(open);

  const [kittenSheet, setKittenSheet] = useState(false);
  const [noteSheet, setNoteSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  /* --- Wehen -------------------------------------------------------- */

  const stats = useMemo(() => contractionStats(events), [events]);
  const secondsSinceLast = stats.lastAt
    ? Math.max(0, (tick - new Date(stats.lastAt).getTime()) / 1000)
    : undefined;

  /* --- Verlauf ------------------------------------------------------ */

  const ordered = useMemo(
    () => [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [events],
  );

  /** Abstand zur vorherigen Wehe, je Eintrag. */
  const intervalByEvent = useMemo(() => {
    const map = new Map<string, number>();
    const contractions = events
      .filter((e) => e.kind === 'contraction')
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    for (let i = 1; i < contractions.length; i++) {
      const delta =
        (new Date(contractions[i].at).getTime() - new Date(contractions[i - 1].at).getTime()) / 1000;
      map.set(contractions[i].id, Math.max(0, Math.round(delta)));
    }
    return map;
  }, [events]);

  const kittenById = useMemo(() => new Map(kittens.map((k) => [k.id, k])), [kittens]);
  const bornCount = kittens.filter((k) => !k.stillborn).length;

  async function record(kind: BirthEventKind, note?: string) {
    setBusy(true);
    try {
      await addBirthEvent(litter.id, kind, { note });
    } catch (e) {
      toast.error('Eintrag konnte nicht gespeichert werden.');
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(event: BirthEvent) {
    const kitten = event.kittenId ? kittenById.get(event.kittenId) : undefined;
    const ok = await confirm({
      title: 'Eintrag löschen?',
      message: kitten
        ? `Der Eintrag und das dazugehörige Kitten (${collarColor(kitten.collarColor).label}) werden gelöscht.`
        : 'Der Eintrag wird aus dem Protokoll entfernt.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    try {
      if (kitten) await deleteKitten(kitten, settings);
      await db.birthEvents.delete(event.id);
    } catch (e) {
      toast.error('Löschen fehlgeschlagen.');
      console.error(e);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        tall
        title="Geburtsprotokoll"
        action={
          <span className="px-1 text-[0.8rem] text-text-dim">
            {bornCount} Kitten
          </span>
        }
      >
        <div className="flex flex-col gap-4">
          {/* --- Wehen-Timer ------------------------------------------ */}
          <Card>
            {stats.lastAt ? (
              <div className="flex flex-col gap-2">
                <span className="text-[0.85rem] text-text-dim">Seit der letzten Wehe</span>
                <span className="text-4xl font-semibold tabular text-text">
                  {formatDuration(secondsSinceLast)}
                </span>
                <span className="text-[0.85rem] text-text-dim">
                  {stats.count} {stats.count === 1 ? 'Wehe' : 'Wehen'} erfasst
                  {stats.averageSeconds != null && (
                    <> · Ø Abstand {formatDuration(stats.averageSeconds)}</>
                  )}
                </span>
                {stats.trend !== 'unknown' && (
                  <span className="text-[0.85rem] text-text-dim">
                    {CONTRACTION_TREND_LABEL[stats.trend]}
                  </span>
                )}
                {stats.recentSeconds.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {stats.recentSeconds.map((s, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.78rem] tabular text-text-dim"
                      >
                        {formatDuration(s)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="font-medium text-text">Noch keine Wehe erfasst</span>
                <span className="text-[0.88rem] leading-relaxed text-text-dim">
                  Tippe bei jeder Wehe auf den großen Knopf. Die App merkt sich die Uhrzeit und
                  zeigt dir die Abstände.
                </span>
              </div>
            )}
          </Card>

          {/* --- Große Knöpfe ----------------------------------------- */}
          <button
            type="button"
            disabled={busy}
            onClick={() => record('contraction')}
            className="flex min-h-24 w-full items-center justify-center gap-3 rounded-[var(--radius-card)] bg-accent text-on-accent shadow-raised active:brightness-95 disabled:opacity-60"
          >
            <Icon name="clock" size={28} />
            <span className="text-xl font-semibold">Wehe</span>
          </button>

          <div className="grid grid-cols-1 gap-2">
            <Button
              size="lg"
              variant="secondary"
              icon="paw"
              block
              disabled={busy}
              onClick={() => setKittenSheet(true)}
            >
              Kitten geboren
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="lg"
                icon="check-circle"
                disabled={busy}
                onClick={() => record('placenta')}
              >
                Nachgeburt
              </Button>
              <Button size="lg" icon="edit" disabled={busy} onClick={() => setNoteSheet(true)}>
                Notiz
              </Button>
            </div>
          </div>

          {/* --- Verlauf ---------------------------------------------- */}
          <Section title="Verlauf" description="Neueste Einträge zuerst">
            {ordered.length === 0 ? (
              <EmptyState
                icon="clock"
                title="Noch nichts eingetragen"
                description="Wehen, Geburten, Nachgeburten und Notizen erscheinen hier mit Uhrzeit."
              />
            ) : (
              <ul className="flex flex-col">
                {ordered.map((e) => {
                  const kitten = e.kittenId ? kittenById.get(e.kittenId) : undefined;
                  const interval = intervalByEvent.get(e.id);
                  return (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0"
                    >
                      <span className="w-12 shrink-0 pt-0.5 text-[0.85rem] tabular text-text-dim">
                        {formatTime(e.at)}
                      </span>
                      <Icon
                        name={EVENT_ICON[e.kind]}
                        size={18}
                        className="mt-0.5 shrink-0 text-text-faint"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5 text-[0.95rem] text-text">
                          {kitten ? (
                            <>
                              <CollarDot colorKey={kitten.collarColor} />
                              <span>
                                {kitten.stillborn
                                  ? 'Totgeboren'
                                  : `Kitten geboren · ${collarColor(kitten.collarColor).label}`}
                              </span>
                              {kitten.birthWeightG ? (
                                <span className="text-text-dim">
                                  {formatGrams(kitten.birthWeightG)}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            BIRTH_EVENT_LABEL[e.kind]
                          )}
                        </span>
                        {interval != null && (
                          <span className="text-[0.82rem] text-text-dim">
                            {formatDuration(interval)} nach der vorherigen Wehe
                          </span>
                        )}
                        {e.note && (
                          <span className="text-[0.85rem] leading-relaxed text-text-dim">
                            {e.note}
                          </span>
                        )}
                      </span>
                      {/* 44 px — ein löschender Knopf, oft nachts mit einer Hand bedient. */}
                      <IconButton
                        icon="trash"
                        label="Eintrag löschen"
                        size="md"
                        variant="quiet"
                        onClick={() => removeEvent(e)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </Sheet>

      <BornKittenSheet
        open={kittenSheet}
        onClose={() => setKittenSheet(false)}
        litter={litter}
        kittens={kittens}
        settings={settings}
      />

      <NoteSheet
        open={noteSheet}
        onClose={() => setNoteSheet(false)}
        onSave={async (text) => {
          await record('note', text);
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  „Kitten geboren"                                                   */
/* ------------------------------------------------------------------ */

function BornKittenSheet({
  open,
  onClose,
  litter,
  kittens,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  litter: Litter;
  kittens: Kitten[];
  settings: Settings;
}) {
  const toast = useToast();
  const used = useMemo(() => kittens.map((k) => k.collarColor), [kittens]);
  const [collar, setCollar] = useState<CollarColorKey>('red');
  const [grams, setGrams] = useState<number | null>(null);
  const [stillborn, setStillborn] = useState(false);
  const [saving, setSaving] = useState(false);

  // Nur beim Öffnen vorbelegen: Während der Geburt schreibt die App
  // dauernd, und jede Änderung würde sonst die Auswahl zurücksetzen.
  const filled = useRef(false);
  useEffect(() => {
    if (!open) {
      filled.current = false;
      return;
    }
    if (filled.current) return;
    filled.current = true;
    setCollar(suggestCollarColor(used));
    setGrams(null);
    setStillborn(false);
  }, [open, used]);

  async function save() {
    setSaving(true);
    const at = nowISO();
    try {
      await ensureLitterBorn(litter.id, at, settings);
      const kitten = await addKitten(
        {
          litterId: litter.id,
          collarColor: collar,
          birthWeightG: grams ?? undefined,
          bornAt: at,
          stillborn,
        },
        settings,
      );
      await addBirthEvent(litter.id, 'kitten_born', {
        kittenId: kitten.id,
        at,
        note: stillborn ? 'Totgeboren' : undefined,
      });
      onClose();
    } catch (e) {
      toast.error('Das Kitten konnte nicht gespeichert werden.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Kitten geboren"
      action={
        <Button variant="ghost" size="sm" onClick={save} loading={saving}>
          Eintragen
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="px-1 text-[0.88rem] leading-relaxed text-text-dim">
          Jetzt zählen nur Halsband und Gewicht. Geschlecht, Rufname und alles Weitere trägst du
          später in Ruhe nach.
        </p>

        <CollarPicker value={collar} onChange={setCollar} used={used} />

        <NumberInput
          label="Geburtsgewicht"
          suffix="g"
          value={grams}
          onValueChange={setGrams}
          placeholder="z. B. 95"
          hint="Darf auch leer bleiben."
        />

        <div className="rounded-[var(--radius-card)] border border-border bg-surface">
          <Switch
            checked={stillborn}
            onChange={setStillborn}
            label="Totgeboren"
            description="Wird im Protokoll vermerkt."
          />
        </div>

        {stillborn && (
          <Callout tone="neutral" icon="info">
            <p>
              Das Kitten bleibt mit Halsbandfarbe und Uhrzeit im Wurf dokumentiert. Es erscheint
              nicht in den Wiegelisten und bekommt keine Fahrplan-Punkte.
            </p>
          </Callout>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Notiz                                                              */
/* ------------------------------------------------------------------ */

function NoteSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setText('');
  }, [open]);

  async function save() {
    if (!text.trim()) {
      onClose();
      return;
    }
    setSaving(true);
    await onSave(text);
    setSaving(false);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Notiz"
      action={
        <Button variant="ghost" size="sm" onClick={save} loading={saving}>
          Eintragen
        </Button>
      }
    >
      <TextArea
        label="Was ist passiert?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="z. B. Fruchtblase geplatzt, unruhig, trinkt gut"
      />
    </Sheet>
  );
}
