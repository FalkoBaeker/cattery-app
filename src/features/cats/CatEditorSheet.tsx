import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Callout,
  NumberInput,
  Section,
  Segmented,
  Select,
  Sheet,
  Spinner,
  Switch,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { db, insert, patch, putAttachment, remove } from '../../db/db';
import { CAT_STATUS_LABEL, type Cat, type CatStatus, type ID, type Sex } from '../../types';
import { todayISO } from '../../lib/date';
import { useSettings, useSettingsLoaded } from './hooks';
import { CatAvatar } from './CatAvatar';
import { downscaleImage } from './image';
import { inbreedingError } from './format';
import { CatHasLittersError, deleteCatWithReferences } from './store';

/* ------------------------------------------------------------------ */
/*  Formularzustand                                                    */
/* ------------------------------------------------------------------ */

interface CatForm {
  callName: string;
  catteryName: string;
  sex: Sex;
  birthDate: string;
  breed: string;
  emsCode: string;
  registrationNo: string;
  chipNo: string;
  bloodGroup: string;
  breederName: string;
  status: CatStatus;
  isOwn: boolean;
  inbreedingPercent: number | null;
  notes: string;
  photoAttachmentId?: ID;
}

/** Vorgaben für ein neues Tier: Rasse aus den Einstellungen, EMS "RUS a". */
function emptyForm(breed: string, sex: Sex): CatForm {
  return {
    callName: '',
    catteryName: '',
    sex,
    birthDate: '',
    breed,
    emsCode: 'RUS a',
    registrationNo: '',
    chipNo: '',
    bloodGroup: '',
    breederName: '',
    status: 'active',
    isOwn: true,
    inbreedingPercent: null,
    notes: '',
  };
}

function fromCat(cat: Cat): CatForm {
  return {
    callName: cat.callName,
    catteryName: cat.catteryName ?? '',
    sex: cat.sex,
    birthDate: cat.birthDate ?? '',
    breed: cat.breed ?? '',
    emsCode: cat.emsCode ?? '',
    registrationNo: cat.registrationNo ?? '',
    chipNo: cat.chipNo ?? '',
    bloodGroup: cat.bloodGroup ?? '',
    breederName: cat.breederName ?? '',
    status: cat.status,
    isOwn: cat.isOwn,
    inbreedingPercent: cat.inbreedingPercent ?? null,
    notes: cat.notes ?? '',
    photoAttachmentId: cat.photoAttachmentId,
  };
}

/** Leere Felder werden nicht gespeichert — alles außer dem Rufnamen darf fehlen. */
function clean(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

const STATUS_OPTIONS = (Object.keys(CAT_STATUS_LABEL) as CatStatus[]).map((value) => ({
  value,
  label: CAT_STATUS_LABEL[value],
}));

const BLOOD_GROUP_OPTIONS = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'AB', label: 'AB' },
];

/* ------------------------------------------------------------------ */
/*  Blatt                                                              */
/* ------------------------------------------------------------------ */

export interface CatEditorSheetProps {
  open: boolean;
  onClose: () => void;
  /** Gesetzt = bearbeiten, leer = neues Tier anlegen. */
  catId?: ID;
  /** Vorbelegung des Geschlechts beim Anlegen. */
  defaultSex?: Sex;
  onSaved?: (id: ID) => void;
  onDeleted?: (id: ID) => void;
}

/**
 * Stammdaten einer Katze anlegen oder ändern.
 * Einziges Pflichtfeld ist der Rufname — alles andere darf für immer leer
 * bleiben (CLAUDE.md).
 */
export function CatEditorSheet({
  open,
  onClose,
  catId,
  defaultSex = 'female',
  onSaved,
  onDeleted,
}: CatEditorSheetProps) {
  const settings = useSettings();
  const settingsLoaded = useSettingsLoaded();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const cat = useLiveQuery(
    async () => (catId ? ((await db.cats.get(catId)) ?? null) : null),
    [catId],
  );
  const litterCount = useLiveQuery(
    async () => {
      if (!catId) return 0;
      const [asMother, asFather] = await Promise.all([
        db.litters.where('motherId').equals(catId).count(),
        db.litters.where('fatherId').equals(catId).count(),
      ]);
      return asMother + asFather;
    },
    [catId],
    0,
  );

  const [form, setForm] = useState<CatForm>(() => emptyForm(settings.breed, defaultSex));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [percentError, setPercentError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  /**
   * Fotos, die in dieser Sitzung angelegt wurden. Wer zweimal ein Bild wählt
   * oder das Blatt ohne Speichern schließt, hinterlässt sonst Blobs in
   * `attachments`, auf die nichts mehr zeigt.
   */
  const createdAttachments = useRef<ID[]>([]);

  const sessionKey = open ? (catId ?? 'neu') : null;

  useEffect(() => {
    if (!open) {
      setLoadedFor(null);
      return;
    }
    if (loadedFor === sessionKey) return;
    if (catId) {
      if (cat) {
        setForm(fromCat(cat));
        setNameError(undefined);
        setPercentError(undefined);
        createdAttachments.current = [];
        setLoadedFor(sessionKey);
      } else if (cat === null) {
        // Auch der „nicht gefunden"-Zustand ist vollständig geladen.
        setLoadedFor(sessionKey);
      }
      return;
    }
    // Die Rasse wird aus den Einstellungen *übernommen* — also erst vorbelegen,
    // wenn sie wirklich geladen sind. Sonst steht hier der Vorgabewert
    // „Russisch Blau", obwohl etwas anderes eingestellt ist.
    if (!settingsLoaded) return;
    setForm(emptyForm(settings.breed, defaultSex));
    setNameError(undefined);
    setPercentError(undefined);
    createdAttachments.current = [];
    setLoadedFor(sessionKey);
  }, [open, sessionKey, loadedFor, catId, cat, settingsLoaded, settings.breed, defaultSex]);

  const set = <K extends keyof CatForm>(key: K, value: CatForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Beim Anlegen zusätzlich auf die Einstellungen warten (Rassen-Vorbelegung).
  // Erst zeichnen, nachdem der Effekt den Formularzustand für genau diese
  // Öffnung übernommen hat. Sonst kann eine sehr schnelle Eingabe noch vom
  // nachlaufenden Initialisierungseffekt überschrieben werden.
  const loading =
    (catId ? cat === undefined : !settingsLoaded) || loadedFor !== sessionKey;
  const missing = Boolean(catId) && cat === null;

  /* --- Foto -------------------------------------------------------- */

  /**
   * Räumt die in dieser Sitzung angelegten Fotos auf. `keep` überlebt — das
   * ist das Bild, das gerade gespeichert wurde. Das Foto einer bereits
   * gespeicherten Katze steht nie in der Liste und bleibt deshalb unangetastet,
   * solange nicht gespeichert wurde.
   */
  async function dropSessionAttachments(keep?: ID) {
    const ids = createdAttachments.current.filter((id) => id !== keep);
    createdAttachments.current = [];
    for (const id of ids) {
      try {
        await remove(db.attachments, id);
      } catch {
        /* Ein übrig gebliebener Blob ist ärgerlich, aber kein Grund zu stören. */
      }
    }
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const scaled = await downscaleImage(file);
      const attachment = await putAttachment(scaled.blob, {
        width: scaled.width,
        height: scaled.height,
      });
      const previous = form.photoAttachmentId;
      createdAttachments.current = [...createdAttachments.current, attachment.id];
      set('photoAttachmentId', attachment.id);
      // Ein eben erst gewähltes und gleich wieder getauschtes Bild kann weg.
      if (previous && createdAttachments.current.includes(previous)) {
        createdAttachments.current = createdAttachments.current.filter((id) => id !== previous);
        try {
          await remove(db.attachments, previous);
        } catch {
          /* siehe oben */
        }
      }
    } catch {
      toast.error('Das Foto konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /** Foto abwählen. Ein in dieser Sitzung gewähltes Bild wird gleich gelöscht. */
  async function onRemovePhoto() {
    const current = form.photoAttachmentId;
    set('photoAttachmentId', undefined);
    if (current && createdAttachments.current.includes(current)) {
      createdAttachments.current = createdAttachments.current.filter((id) => id !== current);
      try {
        await remove(db.attachments, current);
      } catch {
        /* siehe oben */
      }
    }
  }

  /** Schließen ohne Speichern — die Fotos dieser Sitzung braucht niemand mehr. */
  function closeAndDiscard() {
    void dropSessionAttachments();
    onClose();
  }

  /* --- Speichern --------------------------------------------------- */

  async function save() {
    const callName = form.callName.trim();
    if (!callName) {
      setNameError('Bitte einen Rufnamen eingeben.');
      return;
    }
    // Ein Vertipper darf den alten Wert nicht stillschweigend löschen.
    const percentProblem = inbreedingError(form.inbreedingPercent);
    if (percentProblem) {
      setPercentError(percentProblem);
      return;
    }
    const inbreedingPercent = form.inbreedingPercent ?? undefined;

    const data = {
      callName,
      catteryName: clean(form.catteryName),
      sex: form.sex,
      birthDate: clean(form.birthDate),
      breed: form.breed.trim() || settings.breed,
      emsCode: clean(form.emsCode),
      registrationNo: clean(form.registrationNo),
      chipNo: clean(form.chipNo),
      bloodGroup: clean(form.bloodGroup),
      breederName: clean(form.breederName),
      status: form.status,
      isOwn: form.isOwn,
      inbreedingPercent,
      photoAttachmentId: form.photoAttachmentId,
      notes: clean(form.notes),
    };

    setBusy(true);
    try {
      if (catId) {
        await patch(db.cats, catId, data);
        toast.success(`${callName} gespeichert.`);
        onSaved?.(catId);
      } else {
        const created = await insert(db.cats, data);
        toast.success(`${callName} angelegt.`);
        onSaved?.(created.id);
      }
      await dropSessionAttachments(form.photoAttachmentId);
      onClose();
    } catch {
      toast.error('Speichern fehlgeschlagen. Bitte noch einmal versuchen.');
    } finally {
      setBusy(false);
    }
  }

  /* --- Löschen ----------------------------------------------------- */

  async function onDelete() {
    if (!catId || !cat) return;
    if (litterCount > 0) {
      toast.error(
        `${cat.callName} hängt an ${litterCount} ${litterCount === 1 ? 'Wurf' : 'Würfen'} und kann nicht gelöscht werden.`,
      );
      return;
    }
    const ok = await confirm({
      title: `${cat.callName} löschen?`,
      message:
        'Rolligkeiten, Gesundheitstests, Gewichte und offene Aufgaben werden mitgelöscht. Historische Einträge bleiben erhalten, ihre Verknüpfung zur Katze wird gelöst. Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await deleteCatWithReferences(cat);
      toast.success(`${cat.callName} gelöscht.`);
      onDeleted?.(catId);
      await dropSessionAttachments();
      onClose();
    } catch (error) {
      if (error instanceof CatHasLittersError) {
        toast.error(
          `${cat.callName} hängt an ${error.litterCount} ${
            error.litterCount === 1 ? 'Wurf' : 'Würfen'
          } und kann nicht gelöscht werden.`,
        );
      } else {
        toast.error('Löschen fehlgeschlagen.');
      }
    } finally {
      setBusy(false);
    }
  }

  const birthInFuture = Boolean(form.birthDate) && form.birthDate > todayISO();

  return (
    <Sheet
      open={open}
      onClose={closeAndDiscard}
      tall
      title={catId ? 'Stammdaten bearbeiten' : 'Neues Zuchttier'}
      footer={
        <Button
          block
          size="lg"
          variant="primary"
          onClick={save}
          loading={busy}
          /* `missing`: die Katze gibt es nicht mehr — ein aktiver Knopf, der
             nichts Sichtbares tut, wäre nur verwirrend. */
          disabled={loading || missing}
        >
          Speichern
        </Button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10 text-text-dim">
          <Spinner size={24} />
        </div>
      ) : missing ? (
        <Callout tone="alert" icon="alert" title="Diese Katze gibt es nicht mehr">
          Sie wurde vermutlich auf diesem Gerät gelöscht.
        </Callout>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Foto */}
          <div className="flex items-center gap-4">
            <CatAvatar
              name={form.callName || '?'}
              photoAttachmentId={form.photoAttachmentId}
              size={72}
            />
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <Button icon="camera" onClick={() => fileRef.current?.click()} disabled={busy}>
                {form.photoAttachmentId ? 'Foto tauschen' : 'Foto wählen'}
              </Button>
              {form.photoAttachmentId && (
                <Button variant="ghost" onClick={() => void onRemovePhoto()} disabled={busy}>
                  Entfernen
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onPickPhoto(e.target.files?.[0])}
              />
            </div>
          </div>

          <TextInput
            label="Rufname"
            required
            value={form.callName}
            error={nameError}
            autoCapitalize="words"
            placeholder="z. B. Mascha"
            onChange={(e) => {
              set('callName', e.target.value);
              if (nameError) setNameError(undefined);
            }}
          />

          <TextInput
            label="Zuchtname"
            value={form.catteryName}
            autoCapitalize="words"
            placeholder="vollständiger Name mit Zwinger"
            onChange={(e) => set('catteryName', e.target.value)}
          />

          <Segmented
            label="Geschlecht"
            value={form.sex}
            onChange={(v) => set('sex', v)}
            options={[
              { value: 'female', label: 'Katze' },
              { value: 'male', label: 'Kater' },
            ]}
          />

          <TextInput
            label="Wurfdatum"
            type="date"
            value={form.birthDate}
            hint={birthInFuture ? 'Das Datum liegt in der Zukunft.' : undefined}
            onChange={(e) => set('birthDate', e.target.value)}
          />

          <Section title="Zuchtbuch">
            <div className="flex flex-col gap-4">
              <TextInput
                label="Rasse"
                value={form.breed}
                placeholder={settings.breed}
                onChange={(e) => set('breed', e.target.value)}
              />
              <TextInput
                label="EMS-Code"
                value={form.emsCode}
                placeholder="RUS a"
                autoCapitalize="characters"
                onChange={(e) => set('emsCode', e.target.value)}
              />
              <TextInput
                label="Zuchtbuchnummer"
                value={form.registrationNo}
                onChange={(e) => set('registrationNo', e.target.value)}
              />
              <TextInput
                label="Chipnummer"
                value={form.chipNo}
                inputMode="numeric"
                placeholder="15 Ziffern"
                onChange={(e) => set('chipNo', e.target.value)}
              />
              <Select
                label="Blutgruppe"
                value={form.bloodGroup}
                placeholder="unbekannt"
                options={BLOOD_GROUP_OPTIONS}
                onChange={(e) => set('bloodGroup', e.target.value)}
              />
              <TextInput
                label="Züchter"
                value={form.breederName}
                autoCapitalize="words"
                placeholder="von wem stammt das Tier"
                onChange={(e) => set('breederName', e.target.value)}
              />
              <NumberInput
                label="Ahnenverlust"
                suffix="%"
                decimal
                value={form.inbreedingPercent}
                error={percentError}
                hint="Wird extern über PawPeds gerechnet und hier nur festgehalten."
                onValueChange={(v) => {
                  set('inbreedingPercent', v);
                  if (percentError) setPercentError(undefined);
                }}
              />
            </div>
          </Section>

          <Section title="Zucht">
            <div className="flex flex-col gap-4">
              <Select
                label="Status"
                value={form.status}
                options={STATUS_OPTIONS}
                onChange={(e) => set('status', e.target.value as CatStatus)}
              />
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
                <Switch
                  label="Eigenes Tier"
                  description="Aus = fremder Deckkater, nur als Referenz angelegt."
                  checked={form.isOwn}
                  onChange={(v) => set('isOwn', v)}
                />
              </div>
            </div>
          </Section>

          <TextArea
            label="Notizen"
            value={form.notes}
            rows={4}
            placeholder="Alles, was sonst nirgends hinpasst."
            onChange={(e) => set('notes', e.target.value)}
          />

          {catId && (
            <div className="pt-2">
              <Button
                block
                variant="ghost"
                icon="trash"
                className="text-alert"
                onClick={() => void onDelete()}
                disabled={busy}
              >
                Katze löschen
              </Button>
              {litterCount > 0 && (
                <p className="mt-2 px-1 text-center text-[0.8rem] text-text-faint">
                  Nicht möglich, solange {litterCount} {litterCount === 1 ? 'Wurf' : 'Würfe'} an
                  ihr {litterCount === 1 ? 'hängt' : 'hängen'}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
