/**
 * Der Zucht-Tab: Einstieg in Würfe, Kitten und Zuchttiere.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Badge,
  Button,
  EmptyState,
  Fab,
  Icon,
  List,
  ListRow,
  Screen,
  Section,
  Sheet,
  Stack,
} from '../../ui';
import { CAT_STATUS_LABEL } from '../../types';
import type { Cat, ID, Litter } from '../../types';
import { db } from '../../db/db';
import { formatDate } from '../../lib/date';
import {
  analyzeLitterWeights,
  countWeightWarnings,
  nextOpenTask,
  summarizeLitter,
} from './litter';
import { useSettings } from './hooks';
import { Loading } from './parts';
import { PlannedLitterCard, RunningLitterCard } from './LitterCard';
import { LitterEditorSheet } from './LitterEditorSheet';
import { CatQuickSheet } from './CatQuickSheet';

const RUNNING: Litter['status'][] = ['born'];
const EXPECTED: Litter['status'][] = ['planned', 'mated', 'pregnant'];
const CLOSED: Litter['status'][] = ['completed', 'cancelled'];

export function ZuchtScreen() {
  const navigate = useNavigate();
  const settings = useSettings();

  const [createSheet, setCreateSheet] = useState(false);
  const [litterSheet, setLitterSheet] = useState(false);
  const [catSheet, setCatSheet] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const data = useLiveQuery(async () => {
    const [litters, cats, kittens, tasks] = await Promise.all([
      db.litters.toArray(),
      db.cats.toArray(),
      db.kittens.toArray(),
      db.careTasks.toArray(),
    ]);
    const runningIds = new Set(
      litters.filter((l) => RUNNING.includes(l.status)).map((l) => l.id),
    );
    const runningKittenIds = kittens.filter((k) => runningIds.has(k.litterId)).map((k) => k.id);
    const weights =
      runningKittenIds.length > 0
        ? await db.weights.where('kittenId').anyOf(runningKittenIds).toArray()
        : [];
    return { litters, cats, kittens, tasks, weights };
  }, []);

  const catName = useMemo(() => {
    const map = new Map<ID, Cat>();
    for (const c of data?.cats ?? []) map.set(c.id, c);
    return map;
  }, [data?.cats]);

  const running = useMemo(() => {
    if (!data || !settings) return [];
    return data.litters
      .filter((l) => RUNNING.includes(l.status))
      .sort((a, b) => (b.birthDate ?? '').localeCompare(a.birthDate ?? ''))
      .map((litter) => {
        const kittens = data.kittens.filter((k) => k.litterId === litter.id);
        const ids = new Set(kittens.map((k) => k.id));
        const weights = data.weights.filter((w) => ids.has(w.kittenId));
        const analyses = analyzeLitterWeights(
          kittens,
          weights,
          settings.weight,
          litter.birthDate,
        );
        return {
          litter,
          summary: summarizeLitter(kittens, weights),
          warnings: countWeightWarnings(analyses),
          nextTask: nextOpenTask(data.tasks.filter((t) => t.litterId === litter.id)),
        };
      });
  }, [data, settings]);

  const expected = useMemo(
    () =>
      (data?.litters ?? [])
        .filter((l) => EXPECTED.includes(l.status))
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [data?.litters],
  );

  const closed = useMemo(
    () =>
      (data?.litters ?? [])
        .filter((l) => CLOSED.includes(l.status))
        .sort((a, b) => (b.birthDate ?? '').localeCompare(a.birthDate ?? '')),
    [data?.litters],
  );

  const queens = useMemo(
    () =>
      (data?.cats ?? [])
        .filter((c) => c.sex === 'female' && c.isOwn)
        .sort((a, b) => a.callName.localeCompare(b.callName)),
    [data?.cats],
  );
  const studs = useMemo(
    () =>
      (data?.cats ?? [])
        .filter((c) => c.sex === 'male' && c.isOwn)
        .sort((a, b) => a.callName.localeCompare(b.callName)),
    [data?.cats],
  );
  const externalStuds = useMemo(
    () => (data?.cats ?? []).filter((c) => !c.isOwn),
    [data?.cats],
  );

  if (!data || !settings) {
    return (
      <Screen title="Zucht">
        <Loading />
      </Screen>
    );
  }

  const nothingAtAll = data.litters.length === 0 && data.cats.length === 0;

  function nameOf(id?: ID): string | undefined {
    if (!id) return undefined;
    return catName.get(id)?.callName;
  }

  function fatherOf(litter: Litter): string | undefined {
    return nameOf(litter.fatherId) ?? litter.fatherExternalName;
  }

  return (
    <Screen title="Zucht">
      {nothingAtAll ? (
        <EmptyState
          icon="cat"
          title="Hier beginnt alles"
          description="Lege zuerst deine Zuchttiere an. Danach entsteht mit dem ersten Wurf der komplette Fahrplan von selbst."
          action={
            <div className="flex flex-col gap-2">
              <Button variant="primary" icon="plus" onClick={() => setCatSheet(true)}>
                Katze anlegen
              </Button>
              <Button icon="paw" onClick={() => setLitterSheet(true)}>
                Wurf anlegen
              </Button>
            </div>
          }
        />
      ) : (
        <Stack gap="lg">
          {/* --- Laufende Würfe ------------------------------------- */}
          {running.length > 0 && (
            <Section title="Laufende Würfe">
              <div className="flex flex-col gap-3">
                {running.map(({ litter, summary, warnings, nextTask }) => (
                  <RunningLitterCard
                    key={litter.id}
                    litter={litter}
                    motherName={nameOf(litter.motherId) ?? 'Unbekannte Mutter'}
                    fatherName={fatherOf(litter)}
                    summary={summary}
                    warnings={warnings}
                    nextTask={nextTask}
                    settings={settings}
                    onOpen={() => navigate(`/zucht/wurf/${litter.id}`)}
                    onWeigh={() => navigate(`/wiegen/${litter.id}`)}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* --- Erwartete Würfe ------------------------------------ */}
          {expected.length > 0 && (
            <Section title="Erwartet">
              <div className="flex flex-col gap-3">
                {expected.map((litter) => (
                  <PlannedLitterCard
                    key={litter.id}
                    litter={litter}
                    motherName={nameOf(litter.motherId) ?? 'Unbekannte Mutter'}
                    fatherName={fatherOf(litter)}
                    settings={settings}
                    onOpen={() => navigate(`/zucht/wurf/${litter.id}`)}
                  />
                ))}
              </div>
            </Section>
          )}

          {running.length === 0 && expected.length === 0 && (
            <Section title="Würfe">
              <EmptyState
                icon="paw"
                title="Kein laufender Wurf"
                description="Sobald eine Verpaarung geplant ist, trägst du sie hier ein — mit Deckdatum errechnet die App den Geburtstermin."
                action={
                  <Button variant="primary" icon="plus" onClick={() => setLitterSheet(true)}>
                    Wurf anlegen
                  </Button>
                }
              />
            </Section>
          )}

          {/* --- Zuchttiere ----------------------------------------- */}
          <Section title="Zuchttiere">
            {data.cats.length === 0 ? (
              <EmptyState
                icon="cat"
                title="Noch keine Zuchttiere"
                description="Königinnen und Kater gehören hierher. Ein Rufname genügt zum Anfangen."
                action={
                  <Button variant="primary" icon="plus" onClick={() => setCatSheet(true)}>
                    Katze anlegen
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {queens.length > 0 && (
                  <CatGroup title="Königinnen" cats={queens} onOpen={(id) => navigate(`/zucht/katze/${id}`)} />
                )}
                {studs.length > 0 && (
                  <CatGroup title="Kater" cats={studs} onOpen={(id) => navigate(`/zucht/katze/${id}`)} />
                )}
                {externalStuds.length > 0 && (
                  <CatGroup
                    title="Fremde Deckkater"
                    cats={externalStuds}
                    onOpen={(id) => navigate(`/zucht/katze/${id}`)}
                  />
                )}
              </div>
            )}
          </Section>

          {/* --- Abgeschlossene Würfe ------------------------------- */}
          {closed.length > 0 && (
            <Section title="Abgeschlossen">
              <div className="flex flex-col gap-2">
                <Button
                  block
                  iconRight={showClosed ? 'chevron-up' : 'chevron-down'}
                  onClick={() => setShowClosed((v) => !v)}
                >
                  {showClosed
                    ? 'Ausblenden'
                    : `${closed.length} ${closed.length === 1 ? 'Wurf' : 'Würfe'} anzeigen`}
                </Button>
                {showClosed && (
                  <List>
                    {closed.map((litter) => (
                      <ListRow
                        key={litter.id}
                        leading={<Icon name="paw" size={20} className="text-text-faint" />}
                        title={
                          fatherOf(litter)
                            ? `${nameOf(litter.motherId) ?? 'Unbekannt'} × ${fatherOf(litter)}`
                            : (nameOf(litter.motherId) ?? 'Unbekannt')
                        }
                        subtitle={
                          litter.birthDate
                            ? `geboren am ${formatDate(litter.birthDate)}`
                            : 'ohne Geburtsdatum'
                        }
                        trailing={
                          <Badge tone="neutral">
                            {litter.status === 'cancelled' ? 'Abgebrochen' : 'Abgeschlossen'}
                          </Badge>
                        }
                        onClick={() => navigate(`/zucht/wurf/${litter.id}`)}
                      />
                    ))}
                  </List>
                )}
              </div>
            </Section>
          )}
        </Stack>
      )}

      <Fab label="Anlegen" onClick={() => setCreateSheet(true)} />

      {/* --- Auswahl beim Anlegen --------------------------------- */}
      <Sheet open={createSheet} onClose={() => setCreateSheet(false)} title="Was möchtest du anlegen?">
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            block
            icon="paw"
            variant="primary"
            onClick={() => {
              setCreateSheet(false);
              setLitterSheet(true);
            }}
          >
            Neuer Wurf
          </Button>
          <Button
            size="lg"
            block
            icon="cat"
            onClick={() => {
              setCreateSheet(false);
              setCatSheet(true);
            }}
          >
            Neue Katze
          </Button>
        </div>
      </Sheet>

      <LitterEditorSheet
        open={litterSheet}
        onClose={() => setLitterSheet(false)}
        cats={data.cats}
        litters={data.litters}
        settings={settings}
        onSaved={(id) => navigate(`/zucht/wurf/${id}`)}
        onNeedCat={() => setCatSheet(true)}
      />

      <CatQuickSheet open={catSheet} onClose={() => setCatSheet(false)} settings={settings} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function CatGroup({
  title,
  cats,
  onOpen,
}: {
  title: string;
  cats: Cat[];
  onOpen: (id: ID) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="px-1 text-[0.8rem] font-semibold tracking-wide text-text-faint uppercase">
        {title}
      </h3>
      <List>
        {cats.map((cat) => (
          <ListRow
            key={cat.id}
            leading={<Icon name="cat" size={22} className="text-text-dim" />}
            title={cat.callName}
            subtitle={cat.catteryName}
            trailing={
              <Badge tone={cat.status === 'active' ? 'ok' : 'neutral'}>
                {CAT_STATUS_LABEL[cat.status]}
              </Badge>
            }
            onClick={() => onOpen(cat.id)}
          />
        ))}
      </List>
    </div>
  );
}
