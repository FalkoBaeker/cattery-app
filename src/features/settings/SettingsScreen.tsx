/**
 * Einstellungen.
 *
 * Alles, was hier steht, bleibt auf diesem iPhone. Das Repository der App ist
 * öffentlich — Name, Anschrift und IBAN dürfen deshalb nirgends im Quelltext
 * stehen, sondern werden hier einmalig erfasst.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Icon,
  List,
  ListRow,
  MoneyInput,
  NumberInput,
  Screen,
  Section,
  Segmented,
  Sheet,
  Spinner,
  Stack,
  Switch,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { storageEstimate, updateSettings, wipeDatabase } from '../../db/db';
import {
  DEFAULT_SETTINGS,
  MODULE_LABEL,
  type ModuleKey,
  type SchedulePlan,
  type SellerSettings,
  type Settings,
  type WeightThresholds,
} from '../../types';
import { formatBytes, formatMoney } from '../../lib/format';
import { formatDate, formatRelativeDay, nowISO } from '../../lib/date';
import { applyTheme, useSettings } from './useSettings';
import { InstallGuide, isStandalone, resetInstallHint } from './install';
import {
  BACKUP_VERSION,
  backupFileName,
  createBackup,
  deliverBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  type BackupParseResult,
  type BackupProgress,
} from './backup';
import { clampNumber, clampWeek, describeWeekList, formatWeekList, parseWeekList } from './weekList';
import { saveScheduleSettings } from './scheduleSettings';

type SheetKey =
  | 'seller'
  | 'breeding'
  | 'weight'
  | 'schedule'
  | 'whatsapp'
  | 'modules'
  | 'backup'
  | 'install'
  | null;

export function SettingsScreen() {
  const settings = useSettings();
  const toast = useToast();
  const confirm = useConfirm();

  const [sheet, setSheet] = useState<SheetKey>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    storageEstimate()
      .then((e) => {
        if (!cancelled) setStorage(e);
      })
      .catch(() => {
        if (!cancelled) setStorage(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function apply(changes: Partial<Settings>, message = 'Gespeichert.') {
    try {
      await updateSettings(changes);
      toast.success(message);
      return true;
    } catch {
      toast.error('Das konnte nicht gespeichert werden.');
      return false;
    }
  }

  async function applySchedule(schedule: SchedulePlan) {
    if (!settings) return false;
    try {
      await saveScheduleSettings(settings, schedule);
      toast.success('Fahrplan gespeichert und vorhandene Würfe aktualisiert.');
      return true;
    } catch {
      toast.error('Der Fahrplan konnte nicht gespeichert werden.');
      return false;
    }
  }

  async function resetEverything() {
    const first = await confirm({
      title: 'Alle Daten löschen?',
      message:
        'Zuchttiere, Würfe, Kitten, Gewichte, Termine, Dokumente, Verträge und Kosten werden entfernt. Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Weiter',
      danger: true,
    });
    if (!first) return;

    const second = await confirm({
      title: 'Wirklich alles löschen?',
      message:
        'Letzte Rückfrage. Ohne eine Sicherungsdatei sind die Daten danach endgültig weg.',
      confirmLabel: 'Endgültig löschen',
      danger: true,
    });
    if (!second) return;

    try {
      await wipeDatabase();
      resetInstallHint();
      applyTheme(DEFAULT_SETTINGS.theme);
      toast.success('Alles zurückgesetzt.');
    } catch {
      toast.error('Das Zurücksetzen ist fehlgeschlagen.');
    }
  }

  if (!settings) {
    return (
      <Screen title="Einstellungen" back>
        <div className="flex flex-col items-center gap-3 py-16 text-text-faint">
          <Spinner size={26} />
          <p className="text-sm">Einen Moment …</p>
        </div>
      </Screen>
    );
  }

  const sellerFilled = Boolean(settings.seller.name.trim() && settings.seller.address.trim());
  const activeModules = (Object.keys(settings.modules) as ModuleKey[]).filter(
    (k) => settings.modules[k],
  ).length;
  const totalModules = (Object.keys(settings.modules) as ModuleKey[]).length;

  return (
    <Screen title="Einstellungen" back>
      <Stack gap="lg">
        {/* --- Stammdaten ------------------------------------------- */}
        <Section title="Stammdaten">
          <List>
            <ListRow
              leading={<RowIcon name="user" />}
              title="Verkäuferdaten"
              subtitle={
                sellerFilled
                  ? settings.seller.name
                  : 'Noch nicht ausgefüllt — für die Verträge nötig'
              }
              trailing={sellerFilled ? undefined : <Badge tone="warn">offen</Badge>}
              onClick={() => setSheet('seller')}
            />
            <ListRow
              leading={<RowIcon name="cat" />}
              title="Zucht"
              subtitle={[
                settings.breed,
                `${settings.gestationDays} Tage Trächtigkeit`,
                settings.defaultKittenPriceCents != null
                  ? formatMoney(settings.defaultKittenPriceCents)
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              onClick={() => setSheet('breeding')}
            />
          </List>
        </Section>

        {/* --- Bewertung und Fahrplan -------------------------------- */}
        <Section title="Bewertung und Fahrplan">
          <List>
            <ListRow
              leading={<RowIcon name="scale" />}
              title="Gewichtsschwellen"
              subtitle={`Gut ab ${settings.weight.goodGainG} g/Tag · Sorgenkind unter ${settings.weight.concernBirthWeightG} g`}
              onClick={() => setSheet('weight')}
            />
            <ListRow
              leading={<RowIcon name="calendar" />}
              title="Fahrplan"
              subtitle={`Entwurmung ${describeWeekList(settings.schedule.dewormingWeeks)} · Abgabe ab Woche ${settings.schedule.handoverWeek}`}
              onClick={() => setSheet('schedule')}
            />
            <ListRow
              leading={<RowIcon name="whatsapp" />}
              title="WhatsApp-Vorlage"
              subtitle="Text für die Sammelnachricht an Interessenten"
              onClick={() => setSheet('whatsapp')}
            />
          </List>
        </Section>

        {/* --- Darstellung ------------------------------------------- */}
        <Section title="Erscheinungsbild">
          <Card>
            <Segmented
              value={settings.theme}
              onChange={(theme) => {
                applyTheme(theme);
                void apply({ theme }, 'Erscheinungsbild geändert.');
              }}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Hell' },
                { value: 'dark', label: 'Dunkel' },
              ]}
            />
            <p className="mt-2.5 px-1 text-[0.8rem] leading-relaxed text-text-faint">
              „System" folgt der Einstellung des iPhones und wechselt abends von selbst
              auf Dunkel.
            </p>
          </Card>
        </Section>

        {/* --- Bereiche ---------------------------------------------- */}
        <Section title="Bereiche">
          <List>
            <ListRow
              leading={<RowIcon name="list" />}
              title="Module ein- und ausschalten"
              subtitle={`${activeModules} von ${totalModules} eingeschaltet`}
              onClick={() => setSheet('modules')}
            />
          </List>
        </Section>

        {/* --- Sicherung --------------------------------------------- */}
        <Section title="Sicherung">
          <List>
            <ListRow
              leading={<RowIcon name="download" />}
              title="Sichern und wiederherstellen"
              subtitle={
                settings.lastBackupAt
                  ? `Zuletzt ${formatDate(settings.lastBackupAt.slice(0, 10))} (${formatRelativeDay(settings.lastBackupAt.slice(0, 10))})`
                  : 'Noch nie gesichert'
              }
              trailing={settings.lastBackupAt ? undefined : <Badge tone="warn">offen</Badge>}
              onClick={() => setSheet('backup')}
            />
            <ListRow
              leading={<RowIcon name="home" />}
              title="App zum Home-Bildschirm"
              subtitle={
                isStandalone() ? 'Bereits eingerichtet' : 'Anleitung in drei Schritten'
              }
              onClick={() => setSheet('install')}
            />
          </List>
        </Section>

        {/* --- Speicher ----------------------------------------------- */}
        <Section title="Speicher">
          <Card>
            {storage === undefined ? (
              <div className="flex items-center gap-2 text-text-faint">
                <Spinner size={16} />
                <span className="text-sm">Wird ermittelt …</span>
              </div>
            ) : storage === null ? (
              <p className="text-[0.88rem] text-text-dim">
                Dieses Gerät gibt den Speicherverbrauch nicht preis.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.9rem] text-text-dim">Belegt</span>
                  <span className="font-semibold text-text tabular">
                    {formatBytes(storage.usage)}
                  </span>
                </div>
                {storage.quota > 0 && (
                  <>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: `${Math.min(100, Math.max(1, Math.round((storage.usage / storage.quota) * 100)))}%`,
                        }}
                      />
                    </div>
                    <p className="text-[0.8rem] text-text-faint">
                      von etwa {formatBytes(storage.quota)}, die Safari dieser App zugesteht
                    </p>
                  </>
                )}
              </div>
            )}
          </Card>
        </Section>

        {/* --- Zurücksetzen -------------------------------------------- */}
        <Section title="Zurücksetzen">
          <List>
            <ListRow
              leading={
                <span className="flex size-9 items-center justify-center rounded-[var(--radius-field)] bg-alert-soft text-alert">
                  <Icon name="trash" size={20} />
                </span>
              }
              title="Alle Daten löschen"
              subtitle="Setzt die App in den Auslieferungszustand zurück"
              danger
              onClick={() => void resetEverything()}
            />
          </List>
        </Section>

        <p className="px-2 pb-2 text-center text-[0.78rem] leading-relaxed text-text-faint">
          Sicherungsformat Version {BACKUP_VERSION} · alle Daten ausschließlich auf diesem Gerät
        </p>
      </Stack>

      {/* --- Blätter ------------------------------------------------- */}
      <SellerSheet
        open={sheet === 'seller'}
        onClose={() => setSheet(null)}
        value={settings.seller}
        onSave={async (seller) => {
          if (await apply({ seller })) setSheet(null);
        }}
      />
      <BreedingSheet
        open={sheet === 'breeding'}
        onClose={() => setSheet(null)}
        settings={settings}
        onSave={async (changes) => {
          if (await apply(changes)) setSheet(null);
        }}
      />
      <WeightSheet
        open={sheet === 'weight'}
        onClose={() => setSheet(null)}
        value={settings.weight}
        onSave={async (weight) => {
          if (await apply({ weight })) setSheet(null);
        }}
      />
      <ScheduleSheet
        open={sheet === 'schedule'}
        onClose={() => setSheet(null)}
        value={settings.schedule}
        onSave={async (schedule) => {
          if (await applySchedule(schedule)) setSheet(null);
        }}
      />
      <WhatsAppSheet
        open={sheet === 'whatsapp'}
        onClose={() => setSheet(null)}
        value={settings.whatsappTemplate ?? ''}
        onSave={async (whatsappTemplate) => {
          if (await apply({ whatsappTemplate })) setSheet(null);
        }}
      />
      <ModulesSheet
        open={sheet === 'modules'}
        onClose={() => setSheet(null)}
        value={settings.modules}
        onChange={(modules) => void apply({ modules }, 'Bereiche angepasst.')}
      />
      <BackupSheet
        open={sheet === 'backup'}
        onClose={() => setSheet(null)}
        settings={settings}
      />
      <Sheet
        open={sheet === 'install'}
        onClose={() => setSheet(null)}
        title="App zum Home-Bildschirm"
        footer={
          <Button block variant="primary" size="lg" onClick={() => setSheet(null)}>
            Schließen
          </Button>
        }
      >
        <InstallGuide standalone={isStandalone()} />
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/*  Kleine Bausteine                                                   */
/* ------------------------------------------------------------------ */

function RowIcon({ name }: { name: Parameters<typeof Icon>[0]['name'] }) {
  return (
    <span className="flex size-9 items-center justify-center rounded-[var(--radius-field)] bg-surface-2 text-accent">
      <Icon name={name} size={20} />
    </span>
  );
}

function SaveFooter({ onSave, label = 'Speichern' }: { onSave: () => void; label?: string }) {
  return (
    <Button block variant="primary" size="lg" onClick={onSave}>
      {label}
    </Button>
  );
}

/** Erklärzeile unter einem Feld — was bewirkt der Wert wirklich? */
function Explain({ children }: { children: ReactNode }) {
  return (
    <p className="-mt-1 px-1 text-[0.8rem] leading-relaxed text-text-faint">{children}</p>
  );
}

/* ------------------------------------------------------------------ */
/*  Verkäuferdaten                                                     */
/* ------------------------------------------------------------------ */

function SellerSheet({
  open,
  onClose,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: SellerSettings;
  onSave: (v: SellerSettings) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Verkäuferdaten"
      tall
      footer={<SaveFooter onSave={() => onSave(draft)} />}
    >
      <Stack gap="md">
        <Callout tone="accent" icon="lock" title="Bleibt auf diesem iPhone">
          Diese Angaben werden ausschließlich hier gespeichert und niemals hochgeladen.
          Sie erscheinen nur in den Verträgen, die auf diesem Gerät entstehen.
        </Callout>

        <TextInput
          label="Name"
          value={draft.name}
          autoComplete="off"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Vor- und Nachname"
        />
        <TextArea
          label="Anschrift"
          rows={3}
          value={draft.address}
          onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          placeholder={'Straße und Hausnummer\nPLZ Ort'}
        />
        <TextInput
          label="Geburtsdatum"
          type="date"
          value={draft.birthDate ?? ''}
          onChange={(e) => setDraft({ ...draft, birthDate: e.target.value || undefined })}
        />
        <TextInput
          label="IBAN"
          value={draft.iban ?? ''}
          autoComplete="off"
          autoCapitalize="characters"
          onChange={(e) => setDraft({ ...draft, iban: e.target.value || undefined })}
          placeholder="DE00 0000 0000 0000 0000 00"
          hint="Steht im Kaufvertrag als Zahlungsziel."
        />
        <TextInput
          label="Übergabeort"
          value={draft.place ?? ''}
          onChange={(e) => setDraft({ ...draft, place: e.target.value || undefined })}
          placeholder="Ort der Übergabe"
        />
        <TextInput
          label="Zwingername"
          value={draft.catteryName ?? ''}
          onChange={(e) => setDraft({ ...draft, catteryName: e.target.value || undefined })}
        />
        <TextInput
          label="Verein"
          value={draft.clubName}
          onChange={(e) => setDraft({ ...draft, clubName: e.target.value })}
          hint="Für Wurfmeldung und Stammbäume."
        />
      </Stack>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Zucht                                                              */
/* ------------------------------------------------------------------ */

function BreedingSheet({
  open,
  onClose,
  settings,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (changes: Partial<Settings>) => void;
}) {
  const [breed, setBreed] = useState(settings.breed);
  const [gestationDays, setGestationDays] = useState<number | null>(settings.gestationDays);
  const [price, setPrice] = useState<number | null>(settings.defaultKittenPriceCents ?? null);
  const [maxLitters, setMaxLitters] = useState<number | null>(settings.maxLittersPerQueen);
  const [withinMonths, setWithinMonths] = useState<number | null>(settings.maxLittersWithinMonths);

  useEffect(() => {
    if (!open) return;
    setBreed(settings.breed);
    setGestationDays(settings.gestationDays);
    setPrice(settings.defaultKittenPriceCents ?? null);
    setMaxLitters(settings.maxLittersPerQueen);
    setWithinMonths(settings.maxLittersWithinMonths);
  }, [open, settings]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Zucht"
      tall
      footer={
        <SaveFooter
          onSave={() =>
            onSave({
              breed: breed.trim() || DEFAULT_SETTINGS.breed,
              gestationDays: clampNumber(gestationDays, DEFAULT_SETTINGS.gestationDays, 50, 80),
              defaultKittenPriceCents: price ?? undefined,
              maxLittersPerQueen: clampNumber(maxLitters, DEFAULT_SETTINGS.maxLittersPerQueen, 1, 10),
              maxLittersWithinMonths: clampNumber(
                withinMonths,
                DEFAULT_SETTINGS.maxLittersWithinMonths,
                1,
                120,
              ),
            })
          }
        />
      }
    >
      <Stack gap="md">
        <TextInput label="Rasse" value={breed} onChange={(e) => setBreed(e.target.value)} />

        <NumberInput
          label="Trächtigkeitsdauer"
          suffix="Tage"
          value={gestationDays}
          onValueChange={setGestationDays}
        />
        <Explain>
          Der errechnete Geburtstermin ist Deckdatum plus diese Zahl. Vorgabe: 65 Tage.
        </Explain>

        <MoneyInput
          label="Standardpreis je Kitten"
          valueCents={price}
          onValueChange={setPrice}
          hint="Nur ein Vorschlag beim Anlegen — änderbar bleibt er immer."
        />

        <div className="flex gap-3">
          <NumberInput
            label="Würfe je Königin"
            value={maxLitters}
            onValueChange={setMaxLitters}
            containerClassName="flex-1"
          />
          <NumberInput
            label="innerhalb von"
            suffix="Mon."
            value={withinMonths}
            onValueChange={setWithinMonths}
            containerClassName="flex-1"
          />
        </div>
        <Explain>
          Verbandsregel: höchstens {maxLitters ?? DEFAULT_SETTINGS.maxLittersPerQueen} Würfe je
          Königin in {withinMonths ?? DEFAULT_SETTINGS.maxLittersWithinMonths} Monaten. Beim
          Planen einer Verpaarung warnt die App, wenn diese Grenze gerissen würde.
        </Explain>
      </Stack>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Gewichtsschwellen                                                  */
/* ------------------------------------------------------------------ */

function WeightSheet({
  open,
  onClose,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: WeightThresholds;
  onSave: (v: WeightThresholds) => void;
}) {
  const [draft, setDraft] = useState<Record<keyof WeightThresholds, number | null>>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const d = DEFAULT_SETTINGS.weight;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Gewichtsschwellen"
      tall
      footer={
        <SaveFooter
          onSave={() =>
            onSave({
              goodGainG: clampNumber(draft.goodGainG, d.goodGainG, 1, 100),
              watchGainG: clampNumber(draft.watchGainG, d.watchGainG, 1, 100),
              concernBirthWeightG: clampNumber(draft.concernBirthWeightG, d.concernBirthWeightG, 10, 500),
              belowLitterAvgPercent: clampNumber(
                draft.belowLitterAvgPercent,
                d.belowLitterAvgPercent,
                1,
                90,
              ),
              typicalBirthWeightG: clampNumber(draft.typicalBirthWeightG, d.typicalBirthWeightG, 10, 500),
            })
          }
        />
      }
    >
      <Stack gap="md">
        <Callout tone="neutral" icon="info">
          Diese Werte steuern nur die Farben und Hinweise in der App. Sie sind kein
          tierärztlicher Rat und drängen zu nichts.
        </Callout>

        <NumberInput
          label="Zunahme in Ordnung ab"
          suffix="g/Tag"
          value={draft.goodGainG}
          onValueChange={(v) => setDraft({ ...draft, goodGainG: v })}
        />
        <Explain>Ab diesem Wert wird die Zunahme grün als „in Ordnung" gezeigt.</Explain>

        <NumberInput
          label="Beobachten ab"
          suffix="g/Tag"
          value={draft.watchGainG}
          onValueChange={(v) => setDraft({ ...draft, watchGainG: v })}
        />
        <Explain>
          Zwischen diesem Wert und der oberen Schwelle steht „beobachten". Darunter wird
          das Kitten als auffällig geführt.
        </Explain>

        <NumberInput
          label="Sorgenkind unter"
          suffix="g"
          value={draft.concernBirthWeightG}
          onValueChange={(v) => setDraft({ ...draft, concernBirthWeightG: v })}
        />
        <Explain>
          Absolutes Geburtsgewicht, keine Prozentangabe. Wer darunter zur Welt kommt,
          erscheint dauerhaft in den Warnungen auf „Heute".
        </Explain>

        <NumberInput
          label="Abweichung vom Wurfdurchschnitt"
          suffix="%"
          value={draft.belowLitterAvgPercent}
          onValueChange={(v) => setDraft({ ...draft, belowLitterAvgPercent: v })}
        />
        <Explain>
          Liegt ein Kitten um mehr als diesen Anteil unter dem Schnitt seiner Geschwister,
          wird gewarnt.
        </Explain>

        <NumberInput
          label="Typisches Geburtsgewicht"
          suffix="g"
          value={draft.typicalBirthWeightG}
          onValueChange={(v) => setDraft({ ...draft, typicalBirthWeightG: v })}
        />
        <Explain>
          Nur als Vergleichswert in der Anzeige. Bei Russisch Blau etwa 90 g.
        </Explain>

        <Button
          block
          icon="refresh"
          onClick={() => setDraft(DEFAULT_SETTINGS.weight)}
        >
          Auf Vorgabe zurücksetzen
        </Button>
      </Stack>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Fahrplan                                                           */
/* ------------------------------------------------------------------ */

function ScheduleSheet({
  open,
  onClose,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: SchedulePlan;
  onSave: (v: SchedulePlan) => void;
}) {
  const [deworming, setDeworming] = useState(formatWeekList(value.dewormingWeeks));
  const [vaccination, setVaccination] = useState(formatWeekList(value.vaccinationWeeks));
  const [chipWeek, setChipWeek] = useState<number | null>(value.chipWeek);
  const [neuterWeek, setNeuterWeek] = useState<number | null>(value.neuterWeek);
  const [registrationWeek, setRegistrationWeek] = useState<number | null>(
    value.litterRegistrationWeek,
  );
  const [handoverWeek, setHandoverWeek] = useState<number | null>(value.handoverWeek);
  const [leadDays, setLeadDays] = useState<number | null>(value.reminderLeadDays);
  const [drug, setDrug] = useState(value.dewormingDrug ?? '');

  useEffect(() => {
    if (!open) return;
    setDeworming(formatWeekList(value.dewormingWeeks));
    setVaccination(formatWeekList(value.vaccinationWeeks));
    setChipWeek(value.chipWeek);
    setNeuterWeek(value.neuterWeek);
    setRegistrationWeek(value.litterRegistrationWeek);
    setHandoverWeek(value.handoverWeek);
    setLeadDays(value.reminderLeadDays);
    setDrug(value.dewormingDrug ?? '');
  }, [open, value]);

  const d = DEFAULT_SETTINGS.schedule;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Fahrplan"
      tall
      footer={
        <SaveFooter
          onSave={() =>
            onSave({
              dewormingWeeks: parseWeekList(deworming),
              vaccinationWeeks: parseWeekList(vaccination),
              chipWeek: clampWeek(chipWeek, d.chipWeek),
              neuterWeek: clampWeek(neuterWeek, d.neuterWeek),
              litterRegistrationWeek: clampWeek(registrationWeek, d.litterRegistrationWeek),
              handoverWeek: clampWeek(handoverWeek, d.handoverWeek),
              reminderLeadDays: clampNumber(leadDays, d.reminderLeadDays, 0, 60),
              dewormingDrug: drug.trim() || undefined,
            })
          }
        />
      }
    >
      <Stack gap="md">
        <Callout tone="neutral" icon="info">
          Aus dem Geburtsdatum eines Wurfes entstehen daraus automatisch alle Termine.
          Bereits erledigte Punkte bleiben unangetastet, wenn hier etwas geändert wird.
        </Callout>

        <TextInput
          label="Entwurmung in Woche"
          value={deworming}
          inputMode="numeric"
          onChange={(e) => setDeworming(e.target.value)}
          placeholder="4, 6, 8"
        />
        <Explain>{describeWeekList(parseWeekList(deworming))} nach der Geburt.</Explain>

        <TextInput
          label="Entwurmungsmittel"
          value={drug}
          onChange={(e) => setDrug(e.target.value)}
          placeholder="Fenbendazol"
        />

        <TextInput
          label="Impfung in Woche"
          value={vaccination}
          inputMode="numeric"
          onChange={(e) => setVaccination(e.target.value)}
          placeholder="8, 12"
        />
        <Explain>{describeWeekList(parseWeekList(vaccination))} — eine dritte Impfung ist nicht vorgesehen.</Explain>

        <div className="flex gap-3">
          <NumberInput
            label="Chippen"
            suffix="Wo."
            value={chipWeek}
            onValueChange={setChipWeek}
            containerClassName="flex-1"
          />
          <NumberInput
            label="Kastration"
            suffix="Wo."
            value={neuterWeek}
            onValueChange={setNeuterWeek}
            containerClassName="flex-1"
          />
        </div>
        <Explain>
          Die Kastration entfällt bei Kitten, die mit Zuchtnutzungsvorbehalt abgegeben
          werden — dort untersagt der Vertrag sie ausdrücklich.
        </Explain>

        <div className="flex gap-3">
          <NumberInput
            label="Wurfmeldung"
            suffix="Wo."
            value={registrationWeek}
            onValueChange={setRegistrationWeek}
            containerClassName="flex-1"
          />
          <NumberInput
            label="Abgabe ab"
            suffix="Wo."
            value={handoverWeek}
            onValueChange={setHandoverWeek}
            containerClassName="flex-1"
          />
        </div>

        <NumberInput
          label="Erinnerung vorher"
          suffix="Tage"
          value={leadDays}
          onValueChange={setLeadDays}
        />
        <Explain>
          So viele Tage vor der Fälligkeit taucht ein Punkt auf „Heute" auf. Vorgabe: 4 Tage.
        </Explain>

        <Button
          block
          icon="refresh"
          onClick={() => {
            setDeworming(formatWeekList(d.dewormingWeeks));
            setVaccination(formatWeekList(d.vaccinationWeeks));
            setChipWeek(d.chipWeek);
            setNeuterWeek(d.neuterWeek);
            setRegistrationWeek(d.litterRegistrationWeek);
            setHandoverWeek(d.handoverWeek);
            setLeadDays(d.reminderLeadDays);
            setDrug(d.dewormingDrug ?? '');
          }}
        >
          Auf Vorgabe zurücksetzen
        </Button>
      </Stack>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  WhatsApp-Vorlage                                                   */
/* ------------------------------------------------------------------ */

function WhatsAppSheet({
  open,
  onClose,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="WhatsApp-Vorlage"
      tall
      footer={<SaveFooter onSave={() => onSave(draft)} />}
    >
      <Stack gap="md">
        <Callout tone="neutral" icon="info">
          Diese Vorlage wird für die Sammelnachricht benutzt. Sie geht als
          Einzelnachricht an jede Person, nie als Gruppenchat. Der Platzhalter{' '}
          <code className="selectable">{'{name}'}</code> wird durch den Namen ersetzt.
        </Callout>

        <TextArea
          label="Text"
          rows={9}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />

        <Button
          block
          icon="refresh"
          onClick={() => setDraft(DEFAULT_SETTINGS.whatsappTemplate ?? '')}
        >
          Auf Vorgabe zurücksetzen
        </Button>
      </Stack>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Module                                                             */
/* ------------------------------------------------------------------ */

const MODULE_HINT: Record<ModuleKey, string> = {
  cats: 'Königinnen, Kater, Rolligkeit, Gesundheitstests',
  litters: 'Würfe, Kitten, Geburtsprotokoll, Fahrplan',
  weights: 'Wiegen und Gewichtsbewertung',
  waitlist: 'Interessenten und Fragebogen',
  appointments: 'Besuche und Tierarzttermine',
  documents: 'Abfotografierte Unterlagen',
  contracts: 'Kaufverträge und Zuchtnutzung',
  costs: 'Ausgaben und Erlöse',
};

function ModulesSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: Record<ModuleKey, boolean>;
  onChange: (v: Record<ModuleKey, boolean>) => void;
}) {
  const keys = Object.keys(MODULE_LABEL) as ModuleKey[];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Bereiche"
      tall
      footer={
        <Button block variant="primary" size="lg" onClick={onClose}>
          Fertig
        </Button>
      }
    >
      <Stack gap="md">
        <Callout tone="neutral" icon="info">
          Ausgeschaltete Bereiche verschwinden aus der Oberfläche. Die dazugehörigen
          Daten bleiben erhalten und sind sofort wieder da, sobald der Bereich wieder
          eingeschaltet wird.
        </Callout>

        <List>
          {keys.map((key) => (
            <Switch
              key={key}
              label={MODULE_LABEL[key]}
              description={MODULE_HINT[key]}
              checked={value[key]}
              onChange={(checked) => onChange({ ...value, [key]: checked })}
            />
          ))}
        </List>
      </Stack>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Sicherung                                                          */
/* ------------------------------------------------------------------ */

function BackupSheet({
  open,
  onClose,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [interval, setIntervalDays] = useState<number | null>(settings.backupIntervalDays);

  useEffect(() => {
    if (open) setIntervalDays(settings.backupIntervalDays);
  }, [open, settings.backupIntervalDays]);

  const busy = progress !== null;

  async function makeBackup() {
    setProgress({ phase: 'tables', done: 0, total: 1, label: 'Wird vorbereitet' });
    try {
      const file = await createBackup(setProgress);
      setProgress({ phase: 'writing', done: 1, total: 1, label: 'Datei wird erzeugt' });
      const text = serializeBackup(file);
      const how = await deliverBackup(text, backupFileName());
      await updateSettings({ lastBackupAt: nowISO() });
      toast.success(
        how === 'geteilt'
          ? 'Sicherung geteilt — am besten in „Dateien" unter iCloud Drive ablegen.'
          : 'Sicherungsdatei heruntergeladen.',
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.show('Teilen abgebrochen. Es wurde nichts gespeichert.');
      } else {
        toast.error('Die Sicherung konnte nicht erstellt werden.');
      }
    } finally {
      setProgress(null);
    }
  }

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
    event.target.value = '';
    if (!file) return;

    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error('Die Datei konnte nicht gelesen werden.');
      return;
    }

    const parsed: BackupParseResult = parseBackup(text);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }

    const created = parsed.file.createdAt.slice(0, 10);
    const contents = parsed.summary.map((r) => `${r.count} ${r.label}`).join(', ');

    const first = await confirm({
      title: 'Sicherung einspielen?',
      message:
        parsed.itemCount === 0
          ? `Die Sicherung vom ${formatDate(created)} enthält keine Datensätze. Alles Vorhandene würde trotzdem ersetzt.`
          : `Sicherung vom ${formatDate(created)} mit ${contents}. Alles, was jetzt auf diesem iPhone steht, wird dabei ersetzt.`,
      confirmLabel: 'Weiter',
      danger: true,
    });
    if (!first) return;

    const second = await confirm({
      title: 'Wirklich ersetzen?',
      message:
        'Die aktuellen Daten werden gelöscht und durch die Sicherung ersetzt. Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Ersetzen',
      danger: true,
    });
    if (!second) return;

    setProgress({ phase: 'restoring', done: 0, total: 1, label: 'Wird eingespielt' });
    try {
      await restoreBackup(parsed.file, setProgress);
      applyTheme(
        (parsed.file.tables.settings?.[0] as Settings | undefined)?.theme ??
          DEFAULT_SETTINGS.theme,
      );
      toast.success('Sicherung eingespielt.');
      onClose();
    } catch {
      // Die Wiederherstellung läuft als Alles-oder-nichts-Transaktion —
      // schlägt sie fehl, bleiben die bisherigen Daten unangetastet.
      toast.error('Das Einspielen ist fehlgeschlagen. Die bisherigen Daten sind unverändert.');
    } finally {
      setProgress(null);
    }
  }

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  /** Das Intervall wird beim Schließen übernommen — kein extra Speichern-Knopf. */
  function closeAndKeepInterval() {
    const next = clampNumber(interval, DEFAULT_SETTINGS.backupIntervalDays, 1, 365);
    if (next !== settings.backupIntervalDays) {
      void updateSettings({ backupIntervalDays: next });
    }
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : closeAndKeepInterval}
      title="Sicherung"
      tall
      footer={
        <Button
          block
          variant="primary"
          size="lg"
          icon="download"
          loading={busy}
          onClick={() => void makeBackup()}
        >
          Sicherung erstellen
        </Button>
      }
    >
      <Stack gap="md">
        <Callout tone="warn" icon="alert" title="Ohne Sicherung sind die Daten weg">
          Alles liegt ausschließlich auf diesem iPhone. Geht es verloren, wird es
          zurückgesetzt oder räumt Safari auf, sind Würfe, Gewichte und Verträge nicht
          wiederherstellbar. Eine Sicherungsdatei in iCloud Drive ist der einzige Schutz.
        </Callout>

        {progress && (
          <Card>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Spinner size={16} />
                <span className="min-w-0 flex-1 truncate text-[0.9rem] text-text">
                  {progress.label}
                </span>
                <span className="text-[0.85rem] text-text-dim tabular">{percent} %</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-150"
                  style={{ width: `${Math.max(3, percent)}%` }}
                />
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[0.9rem] text-text-dim">Letzte Sicherung</span>
            <span className="font-medium text-text">
              {settings.lastBackupAt ? formatDate(settings.lastBackupAt.slice(0, 10)) : 'nie'}
            </span>
          </div>
          <p className="mt-2 text-[0.82rem] leading-relaxed text-text-faint">
            „Sicherung erstellen" öffnet das Teilen-Blatt. Dort „In Dateien sichern"
            wählen und den Ordner iCloud Drive nehmen — dann liegt die Datei auch außerhalb
            dieses iPhones.
          </p>
        </Card>

        <NumberInput
          label="Erinnerung alle"
          suffix="Tage"
          value={interval}
          onValueChange={setIntervalDays}
        />
        <Explain>
          Nach so vielen Tagen ohne Sicherung erscheint auf „Heute" ein Hinweis.
          Vorgabe: 14 Tage.
        </Explain>

        <Section title="Wiederherstellen">
          <Callout tone="alert" icon="upload" title="Ersetzt alles Vorhandene">
            Beim Einspielen einer Sicherung werden sämtliche Daten auf diesem iPhone
            gelöscht und durch den Inhalt der Datei ersetzt. Es wird zweimal
            nachgefragt, bevor etwas passiert.
          </Callout>
          <div className="mt-2">
            <Button
              block
              icon="upload"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              Sicherungsdatei auswählen
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onFileChosen(e)}
          />
        </Section>
      </Stack>
    </Sheet>
  );
}
