import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';

import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Icon,
  List,
  ListRow,
  Screen,
  Section,
  Sheet,
  Spinner,
  Stack,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { db, patch } from '../../db/db';
import { dateOf, formatDate, formatDateTime, formatDeadline, nowISO } from '../../lib/date';
import { formatMoney } from '../../lib/format';
import type { BreedingUseStage } from '../../types';
import { BREEDING_USE_STAGE_LABEL, BREEDING_USE_STAGE_ORDER } from '../../types';
import {
  erinnerungsstufe,
  monateBisFrist,
  nachzahlungBis,
  tageBisFrist,
  VORGABE_NACHZAHLUNGSTAGE,
} from './calc';
import {
  deadlineVon,
  fristbeginnSetzen,
  fristVerlaengern,
  istBeendet,
  naechsteStufe,
  stufeSetzen,
  stufenIndex,
  zuchtnutzungErfuellt,
} from './breedingUse';

export function BreedingUseScreen() {
  const { breedingUseId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const vorgang = useLiveQuery(
    async () => (breedingUseId ? ((await db.breedingUses.get(breedingUseId)) ?? null) : null),
    [breedingUseId],
  );
  const vertrag = useLiveQuery(
    async () => (vorgang ? ((await db.contracts.get(vorgang.contractId)) ?? null) : null),
    [vorgang?.contractId],
  );

  const [stufenWahlOffen, setStufenWahlOffen] = useState(false);
  const [notizOffen, setNotizOffen] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [fristOffen, setFristOffen] = useState(false);
  const [neuerBeginn, setNeuerBeginn] = useState('');

  if (vorgang === undefined) {
    return (
      <Screen title="Zuchtnutzung" back>
        <div className="flex justify-center py-16 text-text-faint" aria-label="Wird geladen">
          <Spinner size={26} />
        </div>
      </Screen>
    );
  }

  if (vorgang === null) {
    return (
      <Screen title="Zuchtnutzung" back>
        <EmptyState
          icon="clock"
          title="Dieser Vorgang ist nicht mehr da"
          description="Vielleicht wurde er gelöscht. Alle laufenden Vorgänge stehen bei den Verträgen."
          action={
            <Button variant="primary" onClick={() => navigate('/mehr/vertraege', { replace: true })}>
              Zu den Verträgen
            </Button>
          }
        />
      </Screen>
    );
  }

  const stufe = erinnerungsstufe(vorgang.deadlineDate);
  const erfuellt = zuchtnutzungErfuellt(vorgang.stage);
  const beendet = istBeendet(vorgang.stage);
  const naechste = naechsteStufe(vorgang.stage);
  const nachzahlungstage =
    vorgang.backPaymentDays ?? vertrag?.data.backPaymentDays ?? VORGABE_NACHZAHLUNGSTAGE;
  const nachlass = vorgang.discountCents ?? vertrag?.data.discountCents;

  const ton =
    erfuellt || beendet
      ? 'ok'
      : stufe === 'abgelaufen' || stufe === 'ein_monat'
        ? 'alert'
        : stufe === 'drei_monate'
          ? 'warn'
          : 'accent';

  async function setzeStufe(neu: BreedingUseStage) {
    if (!vorgang) return;
    try {
      await stufeSetzen(vorgang, neu, notiz.trim() || undefined);
      setNotiz('');
      setStufenWahlOffen(false);
      setNotizOffen(false);
      toast.success(`Neuer Stand: ${BREEDING_USE_STAGE_LABEL[neu]}`);
    } catch {
      toast.error('Der neue Stand konnte nicht gespeichert werden.');
    }
  }

  async function verlaengern() {
    if (!vorgang) return;
    const ok = await confirm({
      title: `Frist um ${vorgang.extensionMonths} Monate verlängern?`,
      message:
        'Das geht laut Vertrag nur einmal und nur aus Gründen, die die Verkäuferin nicht zu vertreten hat.',
      confirmLabel: 'Verlängern',
    });
    if (!ok) return;
    try {
      await fristVerlaengern(vorgang);
      toast.success('Frist verlängert');
    } catch {
      toast.error('Die Verlängerung konnte nicht gespeichert werden.');
    }
  }

  async function abbrechen() {
    if (!vorgang) return;
    const ok = await confirm({
      title: 'Vorgang abbrechen?',
      message:
        'Der Vorgang wird als abgebrochen geführt. Der Verlauf bleibt erhalten, der Vertrag ebenfalls.',
      confirmLabel: 'Abbrechen',
      cancelLabel: 'Zurück',
      danger: true,
    });
    if (!ok) return;
    try {
      await stufeSetzen(vorgang, 'cancelled', 'Vorgang abgebrochen');
    } catch {
      toast.error('Der Abbruch konnte nicht gespeichert werden.');
    }
  }

  async function beginnSpeichern() {
    if (!vorgang || !neuerBeginn) return;
    try {
      await fristbeginnSetzen(vorgang, neuerBeginn);
      setFristOffen(false);
      toast.success('Fristbeginn geändert');
    } catch {
      toast.error('Der Fristbeginn konnte nicht gespeichert werden.');
    }
  }

  async function notizSpeichern() {
    if (!vorgang || !notiz.trim()) {
      setNotizOffen(false);
      return;
    }
    try {
      await patch(db.breedingUses, vorgang.id, {
        history: [...vorgang.history, { stage: vorgang.stage, at: nowISO(), note: notiz.trim() }],
      });
      setNotiz('');
      setNotizOffen(false);
      toast.success('Notiz gespeichert');
    } catch {
      toast.error('Die Notiz konnte nicht gespeichert werden.');
    }
  }

  const tage = tageBisFrist(vorgang.deadlineDate);
  const monate = monateBisFrist(vorgang.deadlineDate);

  return (
    <Screen title={vorgang.catName} subtitle="Zuchtnutzung" back>
      <Stack gap="lg">
        {/* --- Restlaufzeit, groß --- */}
        <Card>
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <span className="text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
              {beendet ? 'Vorgang beendet' : erfuellt ? 'Zuchtnutzung erfüllt' : 'Restlaufzeit'}
            </span>
            <span
              className={[
                'text-[2.1rem] leading-none font-semibold tabular',
                ton === 'alert' ? 'text-alert' : ton === 'warn' ? 'text-warn' : ton === 'ok' ? 'text-ok' : 'text-text',
              ].join(' ')}
            >
              {beendet
                ? BREEDING_USE_STAGE_LABEL[vorgang.stage]
                : tage < 0
                  ? 'abgelaufen'
                  : monate >= 1
                    ? `noch ${monate} ${monate === 1 ? 'Monat' : 'Monate'}`
                    : `noch ${tage} ${tage === 1 ? 'Tag' : 'Tage'}`}
            </span>
            <span className="text-[0.88rem] text-text-dim">
              Frist bis {formatDate(vorgang.deadlineDate)}
              {vorgang.extendedAt ? ' (verlängert)' : ''}
            </span>
            <Badge tone={ton === 'accent' ? 'accent' : ton}>
              {BREEDING_USE_STAGE_LABEL[vorgang.stage]}
            </Badge>
          </div>
        </Card>

        {/* --- Was an der Frist hängt --- */}
        {!erfuellt && !beendet && (
          <Callout
            tone={stufe === 'abgelaufen' ? 'alert' : stufe === 'keine' ? 'neutral' : 'warn'}
            icon={stufe === 'keine' ? 'info' : 'alert'}
            title={
              stufe === 'abgelaufen'
                ? 'Die Frist ist abgelaufen'
                : stufe === 'ein_monat'
                  ? 'Weniger als ein Monat'
                  : stufe === 'drei_monate'
                    ? 'Noch etwa drei Monate'
                    : stufe === 'sechs_monate'
                      ? 'Noch etwa ein halbes Jahr'
                      : 'Was an dieser Frist hängt'
            }
          >
            <p>
              Wird die Zuchtnutzung nicht bis zum Fristablauf durchgeführt, entfällt der
              Preisnachlass{nachlass != null ? ` von ${formatMoney(nachlass)}` : ''} und ist binnen{' '}
              {nachzahlungstage} Tagen nachzuzahlen
              {stufe === 'abgelaufen'
                ? ` — also bis ${formatDate(nachzahlungBis(vorgang.deadlineDate, nachzahlungstage))}`
                : ''}
              .
            </p>
            {!vorgang.extendedAt && stufe !== 'keine' && (
              <p className="mt-1">
                Eine einmalige Verlängerung um {vorgang.extensionMonths} Monate ist möglich.
              </p>
            )}
          </Callout>
        )}

        {/* --- Aktionen --- */}
        {!beendet && (
          <Stack gap="sm">
            {naechste && (
              <Button
                block
                size="lg"
                variant="primary"
                icon="arrow-right"
                onClick={() => void setzeStufe(naechste)}
              >
                Weiter zu „{BREEDING_USE_STAGE_LABEL[naechste]}“
              </Button>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" icon="list" onClick={() => setStufenWahlOffen(true)}>
                Anderer Stand
              </Button>
              <Button className="flex-1" icon="edit" onClick={() => setNotizOffen(true)}>
                Notiz
              </Button>
            </div>
            {!vorgang.extendedAt && (
              <Button block icon="clock" onClick={() => void verlaengern()}>
                Frist um {vorgang.extensionMonths} Monate verlängern
              </Button>
            )}
          </Stack>
        )}

        {/* --- Statuskette --- */}
        <Section title="Statuskette">
          <List>
            {BREEDING_USE_STAGE_ORDER.map((s) => {
              const i = stufenIndex(s);
              const jetzt = stufenIndex(vorgang.stage);
              const erledigt = jetzt >= 0 && i < jetzt;
              const aktuell = s === vorgang.stage;
              return (
                <ListRow
                  key={s}
                  leading={
                    <span
                      className={[
                        'flex size-7 items-center justify-center rounded-full',
                        aktuell
                          ? 'bg-accent text-on-accent'
                          : erledigt
                            ? 'bg-ok-soft text-ok'
                            : 'bg-surface-2 text-text-faint',
                      ].join(' ')}
                    >
                      {erledigt ? (
                        <Icon name="check" size={15} strokeWidth={2.4} />
                      ) : (
                        <span className="text-[0.78rem] font-semibold">{i + 1}</span>
                      )}
                    </span>
                  }
                  title={BREEDING_USE_STAGE_LABEL[s]}
                  trailing={aktuell ? <Badge tone="accent">jetzt</Badge> : undefined}
                  chevron={false}
                />
              );
            })}
          </List>
        </Section>

        {/* --- Eckdaten --- */}
        <Section title="Eckdaten">
          <List>
            <ListRow
              title="Erstmalige Überlassung"
              subtitle="Ab hier läuft die Frist"
              trailing={formatDate(vorgang.startDate)}
              onClick={() => {
                setNeuerBeginn(vorgang.startDate);
                setFristOffen(true);
              }}
            />
            <ListRow
              title="Nutzungsfrist"
              trailing={`${vorgang.months} Monate`}
              chevron={false}
            />
            <ListRow
              title="Verlängerung"
              subtitle={vorgang.extendedAt ? `gezogen am ${formatDate(vorgang.extendedAt)}` : 'noch möglich'}
              trailing={`${vorgang.extensionMonths} Monate`}
              chevron={false}
            />
            <ListRow
              title="Frist endet"
              trailing={formatDeadline(vorgang.deadlineDate)}
              chevron={false}
            />
            {vertrag && (
              <ListRow
                leading={<Icon name="contract" size={19} className="text-text-faint" />}
                title="Zum Vertrag"
                subtitle={`Angelegt am ${formatDate(dateOf(vertrag.createdAt))}`}
                onClick={() => navigate(`/mehr/vertraege/${vertrag.id}`)}
              />
            )}
            {vertrag === null && (
              <ListRow
                leading={<Icon name="contract" size={19} className="text-text-faint" />}
                title="Vertrag wurde gelöscht"
                subtitle="Frist, Geldbetrag und Verlauf bleiben hier erhalten"
                chevron={false}
              />
            )}
          </List>
        </Section>

        {/* --- Verlauf --- */}
        <Section title="Verlauf" description="Jeder Schritt mit Zeitstempel.">
          {vorgang.history.length === 0 ? (
            <EmptyState
              icon="clock"
              title="Noch nichts eingetragen"
              description="Sobald sich der Stand ändert, steht er hier."
            />
          ) : (
            <List>
              {vorgang.history
                .slice()
                .reverse()
                .map((h, i) => (
                  <ListRow
                    key={`${h.at}-${i}`}
                    leading={<Icon name="check-circle" size={19} className="text-text-faint" />}
                    title={BREEDING_USE_STAGE_LABEL[h.stage]}
                    subtitle={h.note}
                    trailing={formatDateTime(h.at)}
                    chevron={false}
                  />
                ))}
            </List>
          )}
        </Section>

        {!beendet && (
          <Button block variant="danger" icon="x" onClick={() => void abbrechen()}>
            Vorgang abbrechen
          </Button>
        )}
      </Stack>

      {/* Stand frei wählen */}
      <Sheet
        open={stufenWahlOffen}
        onClose={() => setStufenWahlOffen(false)}
        title="Stand ändern"
        tall
      >
        <Stack gap="sm">
          <p className="px-1 text-[0.88rem] text-text-dim">
            Die Kette darf auch übersprungen oder zurückgesetzt werden — der Verlauf merkt sich
            beides.
          </p>
          <List>
            {BREEDING_USE_STAGE_ORDER.map((s) => (
              <ListRow
                key={s}
                title={BREEDING_USE_STAGE_LABEL[s]}
                trailing={s === vorgang.stage ? <Badge tone="accent">jetzt</Badge> : undefined}
                onClick={() => void setzeStufe(s)}
              />
            ))}
          </List>
        </Stack>
      </Sheet>

      {/* Notiz */}
      <Sheet
        open={notizOffen}
        onClose={() => setNotizOffen(false)}
        title="Notiz zum Verlauf"
        footer={
          <Button block size="lg" variant="primary" onClick={() => void notizSpeichern()}>
            Speichern
          </Button>
        }
      >
        <TextArea
          label="Was ist passiert?"
          rows={4}
          placeholder="Anruf beim Käufer, Termin für die Abholung vereinbart."
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
        />
      </Sheet>

      {/* Fristbeginn ändern */}
      <Sheet
        open={fristOffen}
        onClose={() => setFristOffen(false)}
        title="Erstmalige Überlassung"
        footer={
          <Button block size="lg" variant="primary" onClick={() => void beginnSpeichern()}>
            Übernehmen
          </Button>
        }
      >
        <Stack>
          <TextInput
            type="date"
            label="Datum der Überlassung"
            value={neuerBeginn}
            onChange={(e) => setNeuerBeginn(e.target.value)}
            hint="Die Frist wird daraus neu berechnet."
          />
          {neuerBeginn && (
            <Callout tone="accent" icon="clock">
              Neue Frist bis{' '}
              <strong>{formatDate(deadlineVon({ ...vorgang, startDate: neuerBeginn }))}</strong>
              .
            </Callout>
          )}
        </Stack>
      </Sheet>
    </Screen>
  );
}
