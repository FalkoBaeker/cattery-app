/**
 * Minimales Blatt zum Anlegen eines Zuchttieres.
 *
 * Notlösung: Das Katzen-Modul exportiert (noch) kein eigenes Editor-Blatt.
 * Sobald es eines gibt, kann dieses hier ersatzlos entfallen.
 */

import { useEffect, useState } from 'react';
import { Button, Segmented, Sheet, TextArea, TextInput, useToast } from '../../ui';
import { SEX_LABEL } from '../../types';
import type { Cat, ID, ISODate, Sex, Settings } from '../../types';
import { db, insert } from '../../db/db';
import { DateInput } from './parts';

export function CatQuickSheet({
  open,
  onClose,
  settings,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSaved?: (catId: ID) => void;
}) {
  const toast = useToast();
  const [callName, setCallName] = useState('');
  const [catteryName, setCatteryName] = useState('');
  const [sex, setSex] = useState<Sex>('female');
  const [birthDate, setBirthDate] = useState<ISODate | undefined>();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCallName('');
    setCatteryName('');
    setSex('female');
    setBirthDate(undefined);
    setNotes('');
    setError(undefined);
  }, [open]);

  async function save() {
    const name = callName.trim();
    if (!name) {
      setError('Ohne Rufnamen geht es nicht — alles andere kannst du später nachtragen.');
      return;
    }
    setSaving(true);
    try {
      const created = await insert<Cat>(db.cats, {
        callName: name,
        catteryName: catteryName.trim() || undefined,
        sex,
        birthDate,
        breed: settings.breed,
        status: 'active',
        isOwn: true,
        notes: notes.trim() || undefined,
      });
      toast.success('Katze angelegt');
      onSaved?.(created.id);
      onClose();
    } catch (e) {
      toast.error('Speichern fehlgeschlagen. Bitte noch einmal versuchen.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Neue Katze"
      action={
        <Button variant="ghost" size="sm" onClick={save} loading={saving}>
          Sichern
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInput
          label="Rufname"
          required
          error={error}
          value={callName}
          onChange={(e) => {
            setCallName(e.target.value);
            setError(undefined);
          }}
          placeholder="z. B. Mascha"
        />
        <Segmented<Sex>
          label="Geschlecht"
          value={sex}
          onChange={setSex}
          options={[
            { value: 'female', label: SEX_LABEL.female },
            { value: 'male', label: SEX_LABEL.male },
          ]}
        />
        <TextInput
          label="Zuchtname"
          value={catteryName}
          onChange={(e) => setCatteryName(e.target.value)}
          placeholder="vollständiger Name mit Zwinger"
        />
        <DateInput label="Wurfdatum" value={birthDate} onChange={setBirthDate} />
        <TextArea label="Notizen" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <p className="px-1 text-[0.82rem] text-text-faint">
          Zuchtbuchnummer, Chip, EMS-Code und Gesundheitstests trägst du später im Profil der
          Katze nach.
        </p>
      </div>
    </Sheet>
  );
}
