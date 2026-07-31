/**
 * Blatt zum Anlegen und Ändern eines Wurfes.
 * Enthält die Wurfpausen-Prüfung (Warnung, keine Sperre).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Callout,
  Select,
  Sheet,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { LITTER_STATUS_LABEL } from '../../types';
import type { Cat, ID, ISODate, Litter, LitterStatus, Settings } from '../../types';
import { db, insert, patch } from '../../db/db';
import { syncLitterSchedule, checkLitterPause } from '../../domain/schedule';
import { formatDate, todayISO } from '../../lib/date';
import { dueDateFromMating } from './litter';
import { DateInput } from './parts';
import { deleteLitterCascade } from './data';

const STATUS_OPTIONS = (Object.keys(LITTER_STATUS_LABEL) as LitterStatus[]).map((s) => ({
  value: s,
  label: LITTER_STATUS_LABEL[s],
}));

const EXTERN = '__extern__';

export interface LitterEditorSheetProps {
  open: boolean;
  onClose: () => void;
  /** Vorhandener Wurf = Bearbeiten, sonst Anlegen. */
  litter?: Litter;
  cats: Cat[];
  /** Alle Würfe — für die Wurfpausen-Prüfung der Königin. */
  litters: Litter[];
  settings: Settings;
  onSaved?: (litterId: ID) => void;
  /** Wird gerufen, wenn noch keine Königin angelegt ist. */
  onNeedCat?: () => void;
}

export function LitterEditorSheet({
  open,
  onClose,
  litter,
  cats,
  litters,
  settings,
  onSaved,
  onNeedCat,
}: LitterEditorSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const queens = useMemo(
    () => cats.filter((c) => c.sex === 'female' && c.isOwn).sort((a, b) => a.callName.localeCompare(b.callName)),
    [cats],
  );
  const studs = useMemo(
    () => cats.filter((c) => c.sex === 'male').sort((a, b) => a.callName.localeCompare(b.callName)),
    [cats],
  );

  const [motherId, setMotherId] = useState('');
  const [fatherChoice, setFatherChoice] = useState('');
  const [fatherExternalName, setFatherExternalName] = useState('');
  const [matingDate, setMatingDate] = useState<ISODate | undefined>();
  const [dueDate, setDueDate] = useState<ISODate | undefined>();
  const [dueTouched, setDueTouched] = useState(false);
  const [birthDate, setBirthDate] = useState<ISODate | undefined>();
  const [status, setStatus] = useState<LitterStatus>('planned');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Beim Öffnen aus dem Datensatz füllen — und nur dann. Sonst würde jede
  // Änderung im Hintergrund (useLiveQuery liefert neue Felder) das Formular
  // mitten im Tippen zurücksetzen.
  const filled = useRef(false);
  useEffect(() => {
    if (!open) {
      filled.current = false;
      return;
    }
    if (filled.current) return;
    filled.current = true;
    setMotherId(litter?.motherId ?? (queens.length === 1 ? queens[0].id : ''));
    setFatherChoice(litter?.fatherId ?? (litter?.fatherExternalName ? EXTERN : ''));
    setFatherExternalName(litter?.fatherExternalName ?? '');
    setMatingDate(litter?.matingDate);
    setDueDate(litter?.dueDate);
    // Ein gespeicherter Termin, der genau dem errechneten entspricht, gilt
    // nicht als „von Hand gesetzt": Er folgt weiter dem Deckdatum und der
    // Trächtigkeitsdauer aus den Einstellungen und wird beim Sichern frisch
    // gerechnet. Nur ein abweichender Termin bleibt unangetastet — der kann
    // von Hand stammen. (Andere Module lesen litter.dueDate direkt, deshalb
    // wird der errechnete Termin weiterhin gespeichert.)
    setDueTouched(
      Boolean(litter?.dueDate) &&
        litter?.dueDate !== dueDateFromMating(litter?.matingDate, settings.gestationDays),
    );
    setBirthDate(litter?.birthDate);
    setStatus(litter?.status ?? 'planned');
    setNotes(litter?.notes ?? '');
    setError(undefined);
  }, [open, litter, queens, settings.gestationDays]);

  // Geburtstermin folgt dem Deckdatum, solange er nicht von Hand gesetzt wurde.
  useEffect(() => {
    if (dueTouched) return;
    setDueDate(dueDateFromMating(matingDate, settings.gestationDays));
  }, [matingDate, dueTouched, settings.gestationDays]);

  /* --- Wurfpausen-Prüfung ------------------------------------------ */

  const pause = useMemo(() => {
    if (!motherId) return undefined;
    const reference = birthDate ?? dueDate ?? matingDate ?? todayISO();
    const previous = litters
      .filter(
        (l) =>
          l.motherId === motherId &&
          l.id !== litter?.id &&
          l.status !== 'cancelled' &&
          Boolean(l.birthDate),
      )
      .map((l) => l.birthDate as ISODate);
    return checkLitterPause(
      previous,
      reference,
      settings.maxLittersPerQueen,
      settings.maxLittersWithinMonths,
    );
  }, [motherId, birthDate, dueDate, matingDate, litters, litter?.id, settings]);

  const pauseText = useMemo(() => {
    if (!pause) return undefined;
    const { countInWindow, limit, windowMonths, freeFrom, allowed } = pause;
    if (!allowed) {
      const base = `Das wären ${countInWindow} Würfe dieser Königin in ${windowMonths} Monaten — der Verein erlaubt ${limit}.`;
      return freeFrom ? `${base} Wieder möglich ab ${formatDate(freeFrom)}.` : base;
    }
    if (countInWindow === limit) {
      return `Das wäre der ${countInWindow}. Wurf in ${windowMonths} Monaten. Damit ist das Limit von ${limit} erreicht.`;
    }
    return undefined;
  }, [pause]);

  /* --- Speichern ---------------------------------------------------- */

  async function save() {
    if (!motherId) {
      setError('Bitte die Mutter auswählen.');
      return;
    }
    setSaving(true);
    try {
      const fields = {
        motherId,
        fatherId: fatherChoice && fatherChoice !== EXTERN ? fatherChoice : undefined,
        fatherExternalName:
          fatherChoice === EXTERN ? fatherExternalName.trim() || undefined : undefined,
        matingDate,
        dueDate,
        birthDate,
        status,
        notes: notes.trim() || undefined,
      };

      let id: ID;
      if (litter) {
        await patch(db.litters, litter.id, fields);
        id = litter.id;
      } else {
        const created = await insert(db.litters, fields);
        id = created.id;
      }

      // Der Fahrplan hängt am Geburtsdatum.
      await syncLitterSchedule(id, settings);

      toast.success(litter ? 'Wurf gespeichert' : 'Wurf angelegt');
      onSaved?.(id);
      onClose();
    } catch (e) {
      toast.error('Speichern fehlgeschlagen. Bitte noch einmal versuchen.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function deleteLitter() {
    if (!litter) return;
    const kittenCount = await db.kittens.where('litterId').equals(litter.id).count();
    const ok = await confirm({
      title: 'Wurf löschen?',
      message:
        kittenCount > 0
          ? `Der Wurf, ${kittenCount} Kitten samt Wiegungen, das Geburtsprotokoll und der Fahrplan werden gelöscht. Das lässt sich nicht rückgängig machen.`
          : 'Der Wurf, das Geburtsprotokoll und der Fahrplan werden gelöscht. Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteLitterCascade(litter.id);
      toast.show('Wurf gelöscht');
      onClose();
    } catch (e) {
      toast.error('Löschen fehlgeschlagen.');
      console.error(e);
    }
  }

  const computedDue = dueDateFromMating(matingDate, settings.gestationDays);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={litter ? 'Wurf bearbeiten' : 'Neuer Wurf'}
      action={
        <Button variant="ghost" size="sm" onClick={save} loading={saving}>
          Sichern
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {queens.length === 0 ? (
          <Callout tone="accent" icon="info" title="Noch keine Königin angelegt">
            <p>
              {onNeedCat
                ? 'Ein Wurf braucht eine Mutter. Lege zuerst deine Zuchtkatze an.'
                : 'Ein Wurf braucht eine Mutter. Schalte unter Mehr → Einstellungen den Bereich „Zuchttiere“ ein und lege dort zuerst eine Katze an.'}
            </p>
            {onNeedCat && (
              <Button
                className="mt-2"
                size="sm"
                icon="plus"
                onClick={() => {
                  onClose();
                  onNeedCat();
                }}
              >
                Katze anlegen
              </Button>
            )}
          </Callout>
        ) : (
          <Select
            label="Mutter"
            required
            error={error}
            placeholder="Bitte wählen"
            value={motherId}
            onChange={(e) => {
              setMotherId(e.target.value);
              setError(undefined);
            }}
            options={queens.map((c) => ({ value: c.id, label: c.callName }))}
          />
        )}

        <Select
          label="Vater"
          placeholder="Offen"
          value={fatherChoice}
          onChange={(e) => setFatherChoice(e.target.value)}
          options={[
            ...studs.map((c) => ({ value: c.id, label: c.callName })),
            { value: EXTERN, label: 'Fremder Deckkater …' },
          ]}
        />

        {fatherChoice === EXTERN && (
          <TextInput
            label="Name des Deckkaters"
            value={fatherExternalName}
            onChange={(e) => setFatherExternalName(e.target.value)}
            placeholder="z. B. Boris vom Silberbach"
          />
        )}

        <DateInput label="Deckdatum" value={matingDate} onChange={setMatingDate} />

        <DateInput
          label="Geburtstermin"
          value={dueDate}
          onChange={(v) => {
            setDueTouched(true);
            setDueDate(v);
          }}
          hint={
            computedDue
              ? `Errechnet: ${formatDate(computedDue)} (Deckdatum + ${settings.gestationDays} Tage)`
              : 'Ohne Deckdatum kannst du den Termin von Hand eintragen.'
          }
        />

        <DateInput
          label="Geburtsdatum"
          value={birthDate}
          onChange={(v) => {
            setBirthDate(v);
            if (v && (status === 'planned' || status === 'mated' || status === 'pregnant')) {
              setStatus('born');
            }
          }}
          hint="Sobald es steht, entsteht daraus der komplette Fahrplan."
        />

        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as LitterStatus)}
          options={STATUS_OPTIONS}
        />

        {pauseText && (
          <Callout
            tone={pause?.allowed ? 'warn' : 'alert'}
            icon="alert"
            title={pause?.allowed ? 'Letzter Wurf im Zeitraum' : 'Wurfpause beachten'}
          >
            <p>{pauseText}</p>
            <p className="mt-1 text-text-faint">
              Die App hält dich nicht auf — sie sagt dir nur Bescheid.
            </p>
          </Callout>
        )}

        <TextArea
          label="Notizen"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Alles, was zu diesem Wurf gehört."
        />

        {litter && (
          <Button variant="danger" icon="trash" block onClick={deleteLitter}>
            Wurf löschen
          </Button>
        )}
      </div>
    </Sheet>
  );
}
