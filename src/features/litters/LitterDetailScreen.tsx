/**
 * Ein einzelner Wurf: Kopfdaten, Kitten, Fahrplan, Geburtsprotokoll.
 */

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  Screen,
  Section,
  Stack,
} from '../../ui';
import { LITTER_STATUS_LABEL, SEX_LABEL, kittenLabel } from '../../types';
import type { ID, ISODate, Kitten } from '../../types';
import { db } from '../../db/db';
import { checkLitterPause } from '../../domain/schedule';
import { WEIGHT_LEVEL_TONE, type WeightAnalysis } from '../../domain/weight';
import { dateOf, formatAge, formatDate, todayISO } from '../../lib/date';
import { formatGainPerDay, formatGrams } from '../../lib/format';
import {
  analyzeLitterWeights,
  countdownLabel,
  isWeighingPhase,
  isLivingKitten,
  pregnancyInfo,
  summarizeLitter,
  summaryLine,
  weighingLine,
} from './litter';
import { useSettings } from './hooks';
import { CollarDot, DataRow, Loading, LitterStatusBadge, SaleStatusBadge } from './parts';
import { ScheduleSection } from './ScheduleSection';
import { LitterEditorSheet } from './LitterEditorSheet';
import { KittenEditorSheet } from './KittenEditorSheet';
import { BirthLogSheet } from './BirthLogSheet';

export function LitterDetailScreen() {
  const { litterId } = useParams<{ litterId: string }>();
  const navigate = useNavigate();
  const settings = useSettings();

  const [editSheet, setEditSheet] = useState(false);
  const [kittenSheet, setKittenSheet] = useState(false);
  const [birthSheet, setBirthSheet] = useState(false);

  const data = useLiveQuery(async () => {
    if (!litterId) return { missing: true } as const;
    const litter = await db.litters.get(litterId);
    if (!litter) return { missing: true } as const;

    const [kittens, tasks, events, cats, litters, interests] = await Promise.all([
      db.kittens.where('litterId').equals(litterId).toArray(),
      db.careTasks.where('litterId').equals(litterId).toArray(),
      db.birthEvents.where('litterId').equals(litterId).toArray(),
      db.cats.toArray(),
      db.litters.toArray(),
      db.interests.toArray(),
    ]);
    const weights = await db.weights
      .where('kittenId')
      .anyOf(kittens.map((k) => k.id))
      .toArray();

    return { missing: false as const, litter, kittens, tasks, events, cats, litters, weights, interests };
  }, [litterId]);

  const analyses = useMemo<Map<ID, WeightAnalysis>>(() => {
    if (!data || data.missing || !settings) return new Map();
    return analyzeLitterWeights(data.kittens, data.weights, settings.weight, data.litter.birthDate);
  }, [data, settings]);

  const latestByKitten = useMemo(() => {
    const map = new Map<ID, { at: string; grams: number }>();
    if (!data || data.missing) return map;
    for (const w of data.weights) {
      const current = map.get(w.kittenId);
      if (!current || w.at > current.at) map.set(w.kittenId, { at: w.at, grams: w.grams });
    }
    return map;
  }, [data]);

  const pause = useMemo(() => {
    if (!data || data.missing || !settings) return undefined;
    const litter = data.litter;
    const reference = litter.birthDate ?? litter.dueDate ?? litter.matingDate;
    if (!reference) return undefined;
    const previous = data.litters
      .filter(
        (l) =>
          l.motherId === litter.motherId &&
          l.id !== litter.id &&
          l.status !== 'cancelled' &&
          Boolean(l.birthDate),
      )
      .map((l) => l.birthDate as ISODate);
    const check = checkLitterPause(
      previous,
      reference,
      settings.maxLittersPerQueen,
      settings.maxLittersWithinMonths,
    );
    return check.allowed ? undefined : check;
  }, [data, settings]);

  if (!data || !settings) {
    return (
      <Screen title="Wurf" back>
        <Loading />
      </Screen>
    );
  }

  if (data.missing) {
    return (
      <Screen title="Wurf" back>
        <EmptyState
          icon="paw"
          title="Dieser Wurf existiert nicht mehr"
          description="Vielleicht wurde er gelöscht. Über die Übersicht findest du alle vorhandenen Würfe."
          action={<Button onClick={() => navigate('/zucht')}>Zur Übersicht</Button>}
        />
      </Screen>
    );
  }

  const { litter, kittens, tasks, events, cats, weights, interests, litters } = data;
  const showWeights = settings.modules.weights;
  const motherName = cats.find((c) => c.id === litter.motherId)?.callName ?? 'Unbekannte Mutter';
  const fatherName =
    cats.find((c) => c.id === litter.fatherId)?.callName ?? litter.fatherExternalName;

  const refDate = todayISO();
  const summary = summarizeLitter(kittens, weights, refDate, litter.birthDate);
  const info = pregnancyInfo(litter.matingDate, settings.gestationDays);
  const due = litter.dueDate ?? info?.dueDate;
  // Ab Woche 5 wird nicht mehr routinemäßig gewogen (F10).
  const inWeighingPhase = isWeighingPhase(litter.birthDate, refDate);

  const living = kittens
    .filter(isLivingKitten)
    .sort((a, b) => (a.bornAt ?? '').localeCompare(b.bornAt ?? ''));
  const gone = kittens.filter((k) => !isLivingKitten(k));

  function kittenSubtitle(k: Kitten): string {
    const parts: string[] = [SEX_LABEL[k.sex]];
    if (showWeights) {
      const latest = latestByKitten.get(k.id);
      if (latest) parts.push(formatGrams(latest.grams));
      else if (k.birthWeightG) parts.push(`Geburt ${formatGrams(k.birthWeightG)}`);
      const gain = analyses.get(k.id)?.gainPerDay;
      if (gain != null) parts.push(formatGainPerDay(gain));
    }
    return parts.join(' · ');
  }

  return (
    <Screen
      title={motherName}
      subtitle={fatherName ? `× ${fatherName}` : 'Vater offen'}
      back
      actions={
        <IconButton icon="edit" label="Wurf bearbeiten" onClick={() => setEditSheet(true)} />
      }
    >
      <Stack gap="lg">
        {/* --- Kopfdaten -------------------------------------------- */}
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[0.85rem] text-text-dim">Status</span>
            <LitterStatusBadge status={litter.status} />
          </div>
          <DataRow label="Deckdatum" value={formatDate(litter.matingDate)} />
          <DataRow
            label="Geburtstermin"
            value={
              due ? (
                <span>
                  {formatDate(due)}
                  {!litter.birthDate && (
                    <span className="ml-1 text-text-dim">· {countdownLabel(due)}</span>
                  )}
                </span>
              ) : (
                '—'
              )
            }
          />
          <DataRow label="Geburtsdatum" value={formatDate(litter.birthDate)} />
          {litter.birthDate && (
            <DataRow label="Alter" value={formatAge(litter.birthDate)} />
          )}
          {!litter.birthDate && info && info.elapsedDays >= 0 && (
            <div className="mt-2 flex flex-col gap-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(info.progress * 100)}%` }}
                />
              </div>
              <span className="text-[0.82rem] text-text-dim">
                {info.label} · {info.countdown}
              </span>
            </div>
          )}
          {litter.notes && (
            <p className="mt-3 border-t border-border pt-3 text-[0.9rem] leading-relaxed text-text-dim">
              {litter.notes}
            </p>
          )}
        </Card>

        {pause && (
          <Callout tone="alert" icon="alert" title="Wurfpause beachten">
            <p>
              Das sind {pause.countInWindow} Würfe dieser Königin in {pause.windowMonths} Monaten
              — der Verein erlaubt {pause.limit}.
              {pause.freeFrom ? ` Wieder möglich ab ${formatDate(pause.freeFrom)}.` : ''}
            </p>
          </Callout>
        )}

        {/* --- Schnellzugriffe -------------------------------------- */}
        <div className="grid grid-cols-1 gap-2">
          <Button
            size="lg"
            block
            variant={litter.status === 'born' ? 'secondary' : 'primary'}
            icon="clock"
            onClick={() => setBirthSheet(true)}
          >
            Geburtsprotokoll
          </Button>
          {showWeights && litter.status === 'born' && (
            <Button
              size="lg"
              block
              variant="primary"
              icon="scale"
              onClick={() => navigate(`/wiegen/${litter.id}`)}
            >
              Wiegen
            </Button>
          )}
        </div>

        {/* --- Kitten ----------------------------------------------- */}
        <Section
          title="Kitten"
          description={
            summary.isEmpty
              ? undefined
              : showWeights && inWeighingPhase
                ? `${summaryLine(summary)} · ${weighingLine(summary)}`
                : summaryLine(summary)
          }
          action={
            <Button size="sm" icon="plus" onClick={() => setKittenSheet(true)}>
              Hinzufügen
            </Button>
          }
        >
          {summary.isEmpty ? (
            <EmptyState
              icon="paw"
              title="Noch keine Kitten"
              description="Während der Geburt legst du sie am schnellsten über das Geburtsprotokoll an — dort genügen Halsbandfarbe und Gewicht."
              action={
                <Button variant="primary" icon="clock" onClick={() => setBirthSheet(true)}>
                  Geburtsprotokoll öffnen
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              <List>
                {living.map((k) => {
                  const level = analyses.get(k.id)?.level ?? 'unknown';
                  return (
                    <ListRow
                      key={k.id}
                      leading={<CollarDot colorKey={k.collarColor} size={18} />}
                      title={kittenLabel(k)}
                      subtitle={kittenSubtitle(k)}
                      trailing={
                        <span className="flex flex-col items-end gap-1">
                          <SaleStatusBadge status={k.saleStatus} />
                          {showWeights && level !== 'unknown' && level !== 'ok' && (
                            <Badge tone={WEIGHT_LEVEL_TONE[level]} icon="alert">
                              Gewicht
                            </Badge>
                          )}
                        </span>
                      }
                      onClick={() => navigate(`/zucht/kitten/${k.id}`)}
                    />
                  );
                })}
              </List>

              {gone.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <h3 className="px-1 text-[0.8rem] font-semibold tracking-wide text-text-faint uppercase">
                    Nicht mehr bei uns
                  </h3>
                  <List>
                    {gone.map((k) => (
                      <ListRow
                        key={k.id}
                        leading={<CollarDot colorKey={k.collarColor} size={18} />}
                        title={kittenLabel(k)}
                        subtitle={k.stillborn ? 'Totgeboren' : `Verstorben ${formatDate(k.diedAt)}`}
                        onClick={() => navigate(`/zucht/kitten/${k.id}`)}
                      />
                    ))}
                  </List>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* --- Fahrplan --------------------------------------------- */}
        <ScheduleSection
          litter={litter}
          tasks={tasks}
          kittens={kittens}
          weights={weights}
          settings={settings}
          onEditLitter={() => setEditSheet(true)}
        />

        {/* --- Kosten ------------------------------------------------ */}
        {settings.modules.costs && <Section title="Wirtschaftliches">
          <List>
            <ListRow
              leading={<Icon name="euro" size={20} className="text-text-dim" />}
              title="Kosten und Erlöse"
              subtitle="Tierarzt, Impfungen, Verkäufe — in der Kostenübersicht"
              onClick={() => navigate('/mehr/kosten')}
            />
          </List>
        </Section>}

        <p className="px-1 text-[0.78rem] text-text-faint">
          Angelegt am {formatDate(dateOf(litter.createdAt))} · {LITTER_STATUS_LABEL[litter.status]}
        </p>
      </Stack>

      {/* --- Blätter ------------------------------------------------ */}
      <LitterEditorSheet
        open={editSheet}
        onClose={() => setEditSheet(false)}
        litter={litter}
        cats={cats}
        litters={litters}
        settings={settings}
      />

      <KittenEditorSheet
        open={kittenSheet}
        onClose={() => setKittenSheet(false)}
        litter={litter}
        siblings={kittens}
        interests={interests}
        settings={settings}
      />

      <BirthLogSheet
        open={birthSheet}
        onClose={() => setBirthSheet(false)}
        litter={litter}
        kittens={kittens}
        events={events}
        settings={settings}
      />
    </Screen>
  );
}
