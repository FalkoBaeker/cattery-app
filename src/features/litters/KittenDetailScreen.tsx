/**
 * Ein einzelnes Kitten: Kopf, Stammdaten, Gewicht, Zeitstrahl.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Badge,
  Button,
  Callout,
  Card,
  ChoiceGrid,
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  Screen,
  Section,
  Sheet,
  Stack,
  TextArea,
  useConfirm,
  useToast,
  type IconName,
} from '../../ui';
import {
  APPOINTMENT_KIND_LABEL,
  KITTEN_SALE_STATUS_LABEL,
  SEX_LABEL,
  collarColor,
  kittenLabel,
} from '../../types';
import type { ID, ISODate, KittenSaleStatus } from '../../types';
import { db } from '../../db/db';
import { WEIGHT_LEVEL_LABEL, WEIGHT_LEVEL_TONE, analyzeWeights, litterAverageWeight } from '../../domain/weight';
import {
  WeightChart,
  WeightHistory,
  dailyNodes,
  type ChartSeriesInput,
  type WeightSample,
} from '../weights';
import { ShareImageButton } from '../documents';
import {
  ageInDays,
  dateOf,
  formatAge,
  formatDate,
  formatDateTime,
  formatTime,
  todayISO,
} from '../../lib/date';
import { formatGainPerDay, formatGrams, formatMoney, formatPercent } from '../../lib/format';
import { markKittenDeceased, noonOf, revokeKittenDeath, updateSaleStatus } from './data';
import { isLivingKitten } from './litter';
import { useSettings } from './hooks';
import { CollarDot, DataRow, DateInput, Loading, SaleStatusBadge } from './parts';
import { KittenEditorSheet } from './KittenEditorSheet';

const SALE_HINT: Record<KittenSaleStatus, string> = {
  available: 'Noch niemandem versprochen.',
  reserved: 'Vorgemerkt, aber noch nicht verkauft.',
  sold: 'Standardvertrag — die Kastration bleibt im Fahrplan.',
  sold_breeding_reserved: 'Vertrag B — die Kastration entfällt.',
  kept: 'Bleibt in der Zucht bei uns.',
  deceased: 'Verstorben.',
};

export function KittenDetailScreen() {
  const { kittenId } = useParams<{ kittenId: string }>();
  const navigate = useNavigate();
  const settings = useSettings();
  const toast = useToast();
  const confirm = useConfirm();

  const [editSheet, setEditSheet] = useState(false);
  const [saleSheet, setSaleSheet] = useState(false);
  const [deathSheet, setDeathSheet] = useState(false);
  const [allWeights, setAllWeights] = useState(false);

  const data = useLiveQuery(async () => {
    if (!kittenId) return { missing: true } as const;
    const kitten = await db.kittens.get(kittenId);
    if (!kitten) return { missing: true } as const;

    const [litter, siblings, weights, ownTasks, events, interests, appointments] =
      await Promise.all([
        db.litters.get(kitten.litterId),
        db.kittens.where('litterId').equals(kitten.litterId).toArray(),
        db.weights.where('kittenId').equals(kitten.id).sortBy('at'),
        db.careTasks.where('litterId').equals(kitten.litterId).toArray(),
        db.birthEvents.where('litterId').equals(kitten.litterId).toArray(),
        db.interests.toArray(),
        db.appointments.toArray(),
      ]);

    const siblingWeights = await db.weights
      .where('kittenId')
      .anyOf(siblings.map((k) => k.id))
      .toArray();

    return {
      missing: false as const,
      kitten,
      litter,
      siblings,
      weights,
      siblingWeights,
      tasks: ownTasks.filter((t) => !t.kittenId || t.kittenId === kitten.id),
      events: events.filter((e) => e.kittenId === kitten.id),
      interests,
      appointments: appointments.filter((a) => a.kittenIds?.includes(kitten.id)),
    };
  }, [kittenId]);

  /* --- Gewichtsauswertung ------------------------------------------ */

  const analysis = useMemo(() => {
    if (!data || data.missing || !settings) return undefined;
    const byKitten = new Map<ID, { at: string; grams: number }[]>();
    for (const k of data.siblings) {
      if (!isLivingKitten(k)) continue;
      byKitten.set(k.id, []);
    }
    for (const w of data.siblingWeights) {
      byKitten.get(w.kittenId)?.push({ at: w.at, grams: w.grams });
    }
    const birth = data.litter?.birthDate;
    return analyzeWeights(data.weights, settings.weight, {
      birthWeightG: data.kitten.birthWeightG,
      litterAverageG: litterAverageWeight(byKitten, data.kitten.id),
      ageDays: birth ? Math.max(0, ageInDays(birth)) : undefined,
    });
  }, [data, settings]);

  /* --- Wiegungen für Kurve und Zeitstrahl --------------------------- */

  /** Ein Tag = ein Eintrag im Zeitstrahl, mehrfaches Wiegen zusammengefasst. */
  const weightDays = useMemo(() => {
    if (!data || data.missing) return [];
    return dailyNodes(data.weights);
  }, [data]);

  /**
   * Reihen für die Kurve: dieses Kitten kräftig, die Geschwister blass
   * dahinter. Geschwister ohne Wiegung würden die Legende nur zumüllen.
   */
  const chartSeries = useMemo<ChartSeriesInput[]>(() => {
    if (!data || data.missing) return [];
    const byKitten = new Map<ID, WeightSample[]>();
    for (const w of data.siblingWeights) {
      const list = byKitten.get(w.kittenId);
      if (list) list.push({ at: w.at, grams: w.grams });
      else byKitten.set(w.kittenId, [{ at: w.at, grams: w.grams }]);
    }
    return data.siblings
      .filter(
        (k) =>
          k.id === data.kitten.id ||
          (isLivingKitten(k) && (byKitten.get(k.id)?.length ?? 0) > 0),
      )
      .map((k) => ({
        kittenId: k.id,
        label: kittenLabel(k),
        hex: collarColor(k.collarColor).hex,
        entries: byKitten.get(k.id) ?? [],
      }));
  }, [data]);

  if (!data || !settings) {
    return (
      <Screen title="Kitten" back>
        <Loading />
      </Screen>
    );
  }

  if (data.missing) {
    return (
      <Screen title="Kitten" back>
        <EmptyState
          icon="paw"
          title="Dieses Kitten existiert nicht mehr"
          description="Vielleicht wurde es gelöscht. Über den Wurf findest du alle vorhandenen Kitten."
          action={<Button onClick={() => navigate('/zucht')}>Zur Übersicht</Button>}
        />
      </Screen>
    );
  }

  const { kitten, litter, siblings, weights, tasks, events, interests, appointments } = data;
  const showWeights = settings.modules.weights;
  const collar = collarColor(kitten.collarColor);
  const interest = interests.find((i) => i.id === kitten.interestId);
  const level = analysis?.level ?? 'unknown';
  const latest = analysis?.latest;
  const bornAt = kitten.bornAt ?? (litter?.birthDate ? noonOf(litter.birthDate) : undefined);

  /* --- Zeitstrahl --------------------------------------------------- */

  interface TimelineItem {
    key: string;
    date: string;
    icon: IconName;
    title: string;
    detail?: string;
    dim?: boolean;
  }

  const timeline: TimelineItem[] = [];

  if (litter?.birthDate || kitten.bornAt) {
    timeline.push({
      key: 'birth',
      date: kitten.bornAt ? dateOf(kitten.bornAt) : (litter?.birthDate as string),
      icon: 'paw',
      title: kitten.stillborn ? 'Totgeboren' : 'Geboren',
      detail: [
        kitten.bornAt ? `${formatTime(kitten.bornAt)} Uhr` : undefined,
        kitten.birthWeightG ? formatGrams(kitten.birthWeightG) : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  if (showWeights) {
    for (const d of weightDays) {
      timeline.push({
        key: `w-${d.date}`,
        date: d.date,
        icon: 'scale',
        title: formatGrams(d.grams),
        detail: d.count > 1 ? `${d.count} Wiegungen an diesem Tag` : undefined,
      });
    }
  }

  for (const t of tasks) {
    timeline.push({
      key: `t-${t.id}`,
      date: t.doneAt ?? t.dueDate,
      icon: t.kind === 'vaccination' ? 'syringe' : t.kind === 'chip' ? 'chip' : t.kind === 'neuter' ? 'scissors' : 'pill',
      title: t.title,
      detail: t.doneAt ? 'erledigt' : `fällig ${formatDate(t.dueDate)}`,
      dim: !t.doneAt,
    });
  }

  if (settings.modules.appointments) {
    for (const a of appointments) {
      timeline.push({
        key: `a-${a.id}`,
        date: dateOf(a.startAt),
        icon: 'calendar',
        title: a.title || APPOINTMENT_KIND_LABEL[a.kind],
        detail: formatDateTime(a.startAt),
      });
    }
  }

  for (const e of events) {
    if (e.kind === 'kitten_born') continue;
    timeline.push({
      key: `e-${e.id}`,
      date: dateOf(e.at),
      icon: 'edit',
      title: e.note || 'Notiz aus dem Geburtsprotokoll',
      detail: formatTime(e.at),
    });
  }

  if (kitten.diedAt) {
    timeline.push({
      key: 'died',
      date: kitten.diedAt,
      icon: 'info',
      title: 'Verstorben',
      detail: kitten.deathNote,
    });
  }

  timeline.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));

  /* --- Vorgänge ----------------------------------------------------- */

  async function changeSaleStatus(next: KittenSaleStatus) {
    if (!settings || !isLivingKitten(kitten)) return;
    const before = kitten.saleStatus;
    try {
      await updateSaleStatus(kitten, next, settings);
      setSaleSheet(false);
      if (next === 'sold_breeding_reserved') {
        toast.show('Zuchtvorbehalt vermerkt — die Kastration wurde aus dem Fahrplan entfernt.', {
          tone: 'warn',
          durationMs: 6000,
        });
      } else if (before === 'sold_breeding_reserved') {
        toast.show('Zuchtvorbehalt aufgehoben — die Kastration steht wieder im Fahrplan.', {
          durationMs: 6000,
        });
      } else {
        toast.success('Status geändert');
      }
    } catch (e) {
      toast.error('Änderung fehlgeschlagen.');
      console.error(e);
    }
  }

  async function revive() {
    if (!settings) return;
    const ok = await confirm({
      title: 'Vermerk aufheben?',
      message: 'Das Kitten wird wieder als lebend geführt und bekommt seine Fahrplan-Punkte zurück.',
      confirmLabel: 'Aufheben',
    });
    if (!ok) return;
    try {
      await revokeKittenDeath(kitten, settings);
      toast.show('Vermerk aufgehoben');
    } catch (e) {
      toast.error('Der Vermerk konnte nicht aufgehoben werden.');
      console.error(e);
    }
  }

  const name = kittenLabel(kitten);
  const living = isLivingKitten(kitten);

  return (
    <Screen
      title={name}
      subtitle={litter?.birthDate ? formatAge(litter.birthDate) : 'ohne Geburtsdatum'}
      back
      actions={
        <IconButton icon="edit" label="Kitten bearbeiten" onClick={() => setEditSheet(true)} />
      }
    >
      <Stack gap="lg">
        {/* --- Kopf -------------------------------------------------- */}
        <Card>
          <div className="flex items-center gap-3">
            <CollarDot colorKey={kitten.collarColor} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[1.1rem] font-semibold text-text">{name}</p>
              <p className="text-[0.88rem] text-text-dim">
                Halsband {collar.label} · {SEX_LABEL[kitten.sex]}
              </p>
            </div>
            <SaleStatusBadge status={kitten.saleStatus} />
          </div>

          <div className="mt-3 border-t border-border pt-2">
            <DataRow
              label="Alter"
              value={litter?.birthDate ? formatAge(litter.birthDate) : '—'}
            />
            <DataRow label="Geburtsgewicht" value={formatGrams(kitten.birthWeightG)} />
            {showWeights && (
              <>
                <DataRow
                  label="Aktuelles Gewicht"
                  value={
                    latest ? (
                      <span className="flex items-center justify-end gap-2">
                        {formatGrams(latest.grams)}
                        {level !== 'unknown' && (
                          <Badge tone={WEIGHT_LEVEL_TONE[level]}>
                            {WEIGHT_LEVEL_LABEL[level]}
                          </Badge>
                        )}
                      </span>
                    ) : (
                      'noch nicht gewogen'
                    )
                  }
                />
                {analysis?.gainPerDay != null && (
                  <DataRow label="Zunahme" value={formatGainPerDay(analysis.gainPerDay)} />
                )}
                {analysis?.gainSinceBirthRatio != null && (
                  <DataRow
                    label="Seit Geburt"
                    value={formatPercent(analysis.gainSinceBirthRatio, true)}
                  />
                )}
              </>
            )}
          </div>
        </Card>

        {kitten.stillborn && (
          <Callout tone="neutral" icon="info" title="Totgeboren">
            <p>Dieses Kitten ist im Wurf dokumentiert, erscheint aber in keiner Wiegeliste.</p>
          </Callout>
        )}

        {showWeights &&
          analysis &&
          analysis.reasons.length > 0 &&
          level !== 'ok' &&
          level !== 'unknown' && (
          <Callout tone={WEIGHT_LEVEL_TONE[level]} icon="alert" title={WEIGHT_LEVEL_LABEL[level]}>
            <ul className="list-disc pl-4">
              {analysis.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Callout>
        )}

        {/* --- Stammdaten -------------------------------------------- */}
        <Section title="Stammdaten">
          <List>
            <ListRow
              leading={<Icon name="chip" size={20} className="text-text-dim" />}
              title="Chipnummer"
              subtitle={kitten.chipNo || 'noch nicht vergeben'}
              onClick={() => setEditSheet(true)}
            />
            <ListRow
              leading={<Icon name="euro" size={20} className="text-text-dim" />}
              title="Preis"
              subtitle={kitten.priceCents != null ? formatMoney(kitten.priceCents) : 'offen'}
              onClick={() => setEditSheet(true)}
            />
            <ListRow
              leading={<Icon name="star" size={20} className="text-text-dim" />}
              title="Verkaufsstatus"
              subtitle={`${KITTEN_SALE_STATUS_LABEL[kitten.saleStatus]} — ${SALE_HINT[kitten.saleStatus]}`}
              onClick={living ? () => setSaleSheet(true) : undefined}
            />
            <ListRow
              leading={<Icon name="user" size={20} className="text-text-dim" />}
              title="Interessent"
              subtitle={interest ? interest.name : 'noch keiner verknüpft'}
              onClick={() =>
                interest && settings.modules.waitlist
                  ? navigate(`/warteliste/${interest.id}`)
                  : setEditSheet(true)
              }
            />
          </List>
        </Section>

        {/* --- Persönliches Kunden-Update --------------------------- */}
        {living && (
          <Section
            title="Kunden-Update"
            description={
              interest
                ? `Fertiges Bild für ${interest.name} — Foto, Gewicht und Kurve werden automatisch eingesetzt.`
                : 'Fertiges Bild für WhatsApp — die persönliche Anrede lässt sich vor dem Teilen ergänzen.'
            }
          >
            <ShareImageButton kittenId={kitten.id} block />
          </Section>
        )}

        {/* --- Gewicht ------------------------------------------------ */}
        {showWeights && <Section
          title="Gewicht"
          action={
            litter && (
              <div className="flex gap-1">
                <Button size="sm" icon="scale" onClick={() => navigate(`/wiegen/${litter.id}`)}>
                  Wiegen
                </Button>
                <Button
                  size="sm"
                  icon="calendar"
                  onClick={() => navigate(`/zucht/kitten/${kitten.id}/gewicht-nachtragen`)}
                >
                  Nachtragen
                </Button>
              </div>
            )
          }
        >
          {weights.length === 0 ? (
            <EmptyState
              icon="scale"
              title="Noch nicht gewogen"
              description="In den ersten beiden Wochen zweimal täglich, danach alle zwei Tage — die Kurve entsteht von selbst."
              action={
                litter && (
                  <Button variant="primary" icon="scale" onClick={() => navigate(`/wiegen/${litter.id}`)}>
                    Jetzt wiegen
                  </Button>
                )
              }
            />
          ) : (
            <Card>
              {/* Kurve und Liste kommen aus dem Wiege-Modul — dort werden sie
                  gepflegt, hier nur eingebunden. Die Liste erlaubt außerdem
                  Korrigieren und Löschen einzelner Messungen. */}
              <WeightChart
                series={chartSeries}
                focusKittenId={kitten.id}
                birthDate={litter?.birthDate}
              />
              <div className="mt-3 border-t border-border pt-1">
                <WeightHistory
                  kittenId={kitten.id}
                  birthDate={litter?.birthDate}
                  limit={allWeights ? undefined : 8}
                />
              </div>
              {weights.length > 8 && (
                <Button
                  className="mt-2"
                  block
                  size="sm"
                  onClick={() => setAllWeights((v) => !v)}
                  iconRight={allWeights ? 'chevron-up' : 'chevron-down'}
                >
                  {allWeights ? 'Weniger' : `Alle ${weights.length} Wiegungen`}
                </Button>
              )}
            </Card>
          )}
        </Section>}

        {/* --- Zeitstrahl --------------------------------------------- */}
        <Section title="Zeitstrahl" description="Alles zu diesem Kitten, neueste Einträge zuerst">
          {timeline.length === 0 ? (
            <EmptyState
              icon="clock"
              title="Noch nichts passiert"
              description="Wiegungen, Fahrplan-Punkte, Termine und Notizen sammeln sich hier von selbst."
            />
          ) : (
            <Card>
              <ul className="flex flex-col">
                {timeline.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0"
                  >
                    <span className="w-16 shrink-0 pt-0.5 text-[0.8rem] tabular text-text-dim">
                      {formatDate(item.date)}
                    </span>
                    <Icon
                      name={item.icon}
                      size={18}
                      className="mt-0.5 shrink-0 text-text-faint"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={[
                          'text-[0.93rem]',
                          item.dim ? 'text-text-dim' : 'text-text',
                        ].join(' ')}
                      >
                        {item.title}
                      </span>
                      {item.detail && (
                        <span className="text-[0.82rem] text-text-faint">{item.detail}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>

        {/* --- Notizen ------------------------------------------------ */}
        {kitten.notes && (
          <Section title="Notizen">
            <Card>
              <p className="text-[0.92rem] leading-relaxed whitespace-pre-line text-text-dim">
                {kitten.notes}
              </p>
            </Card>
          </Section>
        )}

        {/* --- Verstorben --------------------------------------------- */}
        {!living ? (
          <Button block icon="refresh" onClick={revive}>
            Vermerk „verstorben" aufheben
          </Button>
        ) : (
          <Button block variant="quiet" onClick={() => setDeathSheet(true)}>
            Als verstorben vermerken
          </Button>
        )}

        {bornAt && (
          <p className="px-1 text-[0.78rem] text-text-faint">
            Geboren am {formatDate(dateOf(bornAt))}
            {kitten.bornAt ? ` um ${formatTime(kitten.bornAt)} Uhr` : ''} ·{' '}
            {siblings.length === 1 ? 'Einzelkitten' : `${siblings.length} Kitten im Wurf`}
          </p>
        )}
      </Stack>

      {/* --- Blätter -------------------------------------------------- */}
      {/* Auch ohne Wurf (etwa nach dessen Löschung) bleibt das Kitten
          bearbeitbar — der Stift darf nie ins Leere zeigen. */}
      <KittenEditorSheet
        open={editSheet}
        onClose={() => setEditSheet(false)}
        litter={litter}
        kitten={kitten}
        siblings={siblings}
        interests={interests}
        settings={settings}
      />

      <Sheet open={saleSheet && living} onClose={() => setSaleSheet(false)} title="Verkaufsstatus">
        <div className="flex flex-col gap-4">
          <ChoiceGrid<KittenSaleStatus>
            columns={1}
            value={kitten.saleStatus}
            onChange={changeSaleStatus}
            options={(
              ['available', 'reserved', 'sold', 'sold_breeding_reserved', 'kept'] as KittenSaleStatus[]
            ).map((s) => ({
              value: s,
              label: KITTEN_SALE_STATUS_LABEL[s],
              description: SALE_HINT[s],
            }))}
          />
          <Callout tone="neutral" icon="info" title="Warum das den Fahrplan ändert">
            <p>
              Bei Abgabe mit Zuchtnutzungsvorbehalt untersagt der Vertrag die Kastration. Die App
              nimmt den Punkt deshalb sofort aus dem Fahrplan — und stellt ihn wieder ein, wenn du
              den Status zurücknimmst.
            </p>
          </Callout>
        </div>
      </Sheet>

      <DeathSheet
        open={deathSheet}
        onClose={() => setDeathSheet(false)}
        name={name}
        onSave={async (date, note) => {
          if (!settings) return;
          const ok = await confirm({
            title: `${name} als verstorben vermerken?`,
            message:
              'Das Kitten bleibt mit allen Daten im Wurf dokumentiert. Offene Fahrplan-Punkte entfallen. Du kannst den Vermerk jederzeit wieder aufheben.',
            confirmLabel: 'Vermerken',
            danger: true,
          });
          if (!ok) return;
          try {
            await markKittenDeceased(kitten, date, note, settings);
            setDeathSheet(false);
            toast.show('Vermerkt.');
          } catch (e) {
            toast.error('Der Vermerk konnte nicht gespeichert werden.');
            console.error(e);
          }
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function DeathSheet({
  open,
  onClose,
  name,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  onSave: (date: ISODate, note?: string) => Promise<void>;
}) {
  const [date, setDate] = useState<ISODate | undefined>(todayISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(todayISO());
    setNote('');
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Verstorben"
      action={
        <Button
          variant="ghost"
          size="sm"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(date ?? todayISO(), note);
            } finally {
              setSaving(false);
            }
          }}
        >
          Sichern
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="px-1 text-[0.9rem] leading-relaxed text-text-dim">
          {name} bleibt vollständig dokumentiert. Datum und Notiz helfen später beim Nachlesen.
        </p>
        <DateInput label="Datum" value={date} onChange={setDate} max={todayISO()} />
        <TextArea
          label="Notiz"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="darf leer bleiben"
        />
      </div>
    </Sheet>
  );
}
