/**
 * Blatt zum Anlegen und Bearbeiten der Stammdaten eines Interessenten.
 *
 * Pflichtfeld ist ausschließlich der Name. Alles andere darf für immer
 * leer bleiben — auch die Telefonnummer.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  MoneyInput,
  Segmented,
  Sheet,
  Stack,
  TextInput,
  useToast,
} from '../../ui';
import type { Interest, WishSex } from '../../types';
import { createInterest, updateInterest } from './store';

interface FormState {
  name: string;
  phone: string;
  email: string;
  city: string;
  source: string;
  wishSex: WishSex;
  wishTimeframe: string;
  offeredPriceCents: number | null;
}

function toForm(interest?: Interest): FormState {
  return {
    name: interest?.name ?? '',
    phone: interest?.phone ?? '',
    email: interest?.email ?? '',
    city: interest?.city ?? '',
    source: interest?.source ?? 'Homepage',
    wishSex: interest?.wishSex ?? 'any',
    wishTimeframe: interest?.wishTimeframe ?? '',
    offeredPriceCents: interest?.offeredPriceCents ?? null,
  };
}

export function InterestSheet({
  open,
  onClose,
  interest,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Ohne Angabe wird ein neuer Interessent angelegt. */
  interest?: Interest;
  onCreated?: (created: Interest) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => toForm(interest));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Beim Öffnen die Werte des Datensatzes übernehmen — bewusst nur dann.
  // `interest` kommt aus einer laufenden Abfrage und wird bei jeder Änderung
  // neu erzeugt; hinge der Effekt daran, würde er die Eingabe überschreiben,
  // während getippt wird.
  const latest = useRef(interest);
  latest.current = interest;
  const interestId = interest?.id;

  useEffect(() => {
    if (!open) return;
    setForm(toForm(latest.current));
    setTouched(false);
  }, [open, interestId]);

  const nameError = touched && form.name.trim() === '' ? 'Bitte einen Namen eintragen.' : undefined;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setTouched(true);
    if (form.name.trim() === '') return;
    setSaving(true);
    try {
      if (interest) {
        await updateInterest(interest.id, {
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          city: form.city.trim() || undefined,
          source: form.source.trim() || undefined,
          wishSex: form.wishSex,
          wishTimeframe: form.wishTimeframe.trim() || undefined,
          offeredPriceCents: form.offeredPriceCents ?? undefined,
        });
        toast.success('Gespeichert');
      } else {
        const created = await createInterest({
          name: form.name,
          phone: form.phone,
          email: form.email,
          city: form.city,
          source: form.source,
          wishSex: form.wishSex,
          wishTimeframe: form.wishTimeframe,
        });
        if (form.offeredPriceCents != null) {
          await updateInterest(created.id, { offeredPriceCents: form.offeredPriceCents });
        }
        toast.success(`${created.name} steht auf der Warteliste`);
        onCreated?.(created);
      }
      onClose();
    } catch {
      toast.error('Speichern hat nicht geklappt. Bitte noch einmal versuchen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={interest ? 'Interessent bearbeiten' : 'Neuer Interessent'}
      action={
        <Button variant="ghost" size="sm" onClick={save} loading={saving}>
          Sichern
        </Button>
      }
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          required
          error={nameError}
          value={form.name}
          autoCapitalize="words"
          placeholder="Vor- und Nachname"
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => setTouched(true)}
        />
        <TextInput
          label="Telefon"
          type="tel"
          inputMode="tel"
          value={form.phone}
          placeholder="0170 1234567"
          hint="Wird für Anruf und WhatsApp gebraucht."
          onChange={(e) => set('phone', e.target.value)}
        />
        <TextInput
          label="E-Mail"
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          value={form.email}
          placeholder="name@beispiel.de"
          onChange={(e) => set('email', e.target.value)}
        />
        <TextInput
          label="Ort"
          value={form.city}
          autoCapitalize="words"
          onChange={(e) => set('city', e.target.value)}
        />
        <TextInput
          label="Quelle"
          value={form.source}
          placeholder="Homepage"
          hint="Woher kam die Anfrage?"
          onChange={(e) => set('source', e.target.value)}
        />
        <Segmented<WishSex>
          label="Wunschgeschlecht"
          value={form.wishSex}
          onChange={(v) => set('wishSex', v)}
          options={[
            { value: 'any', label: 'egal' },
            { value: 'male', label: 'Kater' },
            { value: 'female', label: 'Katze' },
          ]}
        />
        <TextInput
          label="Wunschzeitraum"
          value={form.wishTimeframe}
          placeholder="z. B. Frühjahr 2027"
          onChange={(e) => set('wishTimeframe', e.target.value)}
        />
        <MoneyInput
          label="Angebotener Preis"
          valueCents={form.offeredPriceCents}
          onValueChange={(cents) => set('offeredPriceCents', cents)}
          hint="Der Preis ist nicht fix — hier steht, was besprochen wurde."
        />
      </Stack>
    </Sheet>
  );
}
