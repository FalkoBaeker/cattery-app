/**
 * Der Zucht-Tab: Einstieg in Würfe, Kitten und Zuchttiere.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Callout,
  EmptyState,
  Fab,
  List,
  ListRow,
  Screen,
  Section,
  Segmented,
  Sheet,
  Stack,
} from '../../ui';
import { kittenLabel, type Cat, type ID, type Litter } from '../../types';
import { db } from '../../db/db';
import { todayISO } from '../../lib/date';
import { formatGainPerDay, formatGrams } from '../../lib/format';
import { CatEditorSheet, CatRow } from '../cats';
import {
  analyzeLitterWeights,
  countWeightWarnings,
  effectiveDueDate,
  nextOpenTask,
  summarizeLitter,
} from './litter';
import { useSettings } from './hooks';
import { CollarDot, Loading, WeightLevelBadge } from './parts';
import { PlannedLitterCard, RunningLitterCard } from './LitterCard';
import { LitterEditorSheet } from './LitterEditorSheet';
import { LitterArchive } from './LitterArchive';

const RUNNING: Litter['status'][] = ['born'];
const EXPECTED: Litter['status'][] = ['planned', 'mated', 'pregnant'];

export function ZuchtScreen() {
  const navigate = useNavigate();
  const settings = useSettings();

  const [createSheet, setCreateSheet] = useState(false);
  const [litterSheet, setLitterSheet] = useState(false);
  const [catSheet, setCatSheet] = useState(false);
  const [view, setView] = useState<'current' | 'archive'>('current');
  const [warningLitterId, setWarningLitterId] = useState<ID | null>(null);

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
        const warningKittens = kittens
          .flatMap((kitten) => {
            const analysis = analyses.get(kitten.id);
            return analysis?.level === 'concern' || analysis?.level === 'critical'
              ? [{ kitten, analysis }]
              : [];
          })
          .sort(
            (a, b) =>
              Number(b.analysis.level === 'critical') -
                Number(a.analysis.level === 'critical') ||
              kittenLabel(a.kitten).localeCompare(kittenLabel(b.kitten), 'de'),
          );
        return {
          litter,
          summary: summarizeLitter(kittens, weights, todayISO(), litter.birthDate),
          warnings: countWeightWarnings(analyses),
          warningKittens,
          nextTask: nextOpenTask(data.tasks.filter((t) => t.litterId === litter.id)),
        };
      });
  }, [data, settings]);

  // Zum Sortieren zählt auch der aus dem Deckdatum errechnete Termin —
  // sonst rutscht ein Wurf mit Deckdatum, aber ohne gespeicherten Termin
  // ans Ende, obwohl sein Termin längst feststeht.
  const expected = useMemo(() => {
    const gestationDays = settings?.gestationDays;
    const key = (l: Litter) => effectiveDueDate(l, gestationDays) ?? '9999';
    return (data?.litters ?? [])
      .filter((l) => EXPECTED.includes(l.status))
      .sort((a, b) => key(a).localeCompare(key(b)));
  }, [data?.litters, settings?.gestationDays]);

  const warningSelection = running.find(({ litter }) => litter.id === warningLitterId);

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
    () =>
      (data?.cats ?? [])
        .filter((c) => c.sex === 'male' && !c.isOwn)
        .sort((a, b) => a.callName.localeCompare(b.callName)),
    [data?.cats],
  );
  /** Fremde weibliche Tiere — selten, aber möglich; gehören nicht zu den Deckkatern. */
  const externalQueens = useMemo(
    () =>
      (data?.cats ?? [])
        .filter((c) => c.sex === 'female' && !c.isOwn)
        .sort((a, b) => a.callName.localeCompare(b.callName)),
    [data?.cats],
  );

  if (!data || !settings) {
    return (
      <Screen title="Zucht">
        <Loading />
      </Screen>
    );
  }

  const showCats = settings.modules.cats;
  const showLitters = settings.modules.litters;
  const showWeights = settings.modules.weights && showLitters;
  const nothingAtAll =
    (!showLitters || data.litters.length === 0) && (!showCats || data.cats.length === 0);

  function nameOf(id?: ID): string | undefined {
    if (!id) return undefined;
    return catName.get(id)?.callName;
  }

  function fatherOf(litter: Litter): string | undefined {
    return nameOf(litter.fatherId) ?? litter.fatherExternalName;
  }

  return (
    <Screen title="Zucht">
      {showLitters && (
        <Segmented
          className="mb-5"
          label="Zuchtansicht"
          value={view}
          onChange={setView}
          options={[
            { value: 'current', label: 'Aktuell' },
            { value: 'archive', label: 'Archiv' },
          ]}
        />
      )}
      {showLitters && view === 'archive' ? (
        <LitterArchive
          litters={data.litters}
          cats={data.cats}
          kittens={data.kittens}
          onOpen={(id) => navigate(`/zucht/wurf/${id}`)}
        />
      ) : nothingAtAll ? (
        <EmptyState
          icon="cat"
          title="Hier beginnt alles"
          description={
            showCats && showLitters
              ? 'Lege zuerst deine Zuchttiere an. Danach entsteht mit dem ersten Wurf der komplette Fahrplan von selbst.'
              : showCats
                ? 'Lege dein erstes Zuchttier an. Ein Rufname genügt zum Anfangen.'
                : 'Lege deinen ersten Wurf an. Daraus entsteht der komplette Fahrplan von selbst.'
          }
          action={
            <div className="flex flex-col gap-2">
              {showCats && (
                <Button variant="primary" icon="plus" onClick={() => setCatSheet(true)}>
                  Katze anlegen
                </Button>
              )}
              {showLitters && (
                <Button
                  variant={showCats ? 'secondary' : 'primary'}
                  icon="paw"
                  onClick={() => setLitterSheet(true)}
                >
                  Wurf anlegen
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <Stack gap="lg">
          {/* --- Laufende Würfe ------------------------------------- */}
          {showLitters && running.length > 0 && (
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
                    showWeights={showWeights}
                    onOpen={() => navigate(`/zucht/wurf/${litter.id}`)}
                    onOpenWarnings={
                      showWeights && warnings > 0
                        ? () => setWarningLitterId(litter.id)
                        : undefined
                    }
                    onWeigh={
                      showWeights ? () => navigate(`/wiegen/${litter.id}`) : undefined
                    }
                  />
                ))}
              </div>
            </Section>
          )}

          {/* --- Erwartete Würfe ------------------------------------ */}
          {showLitters && expected.length > 0 && (
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

          {showLitters && running.length === 0 && expected.length === 0 && (
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
          {showCats && <Section title="Zuchttiere">
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
                {queens.length > 0 && <CatGroup title="Königinnen" cats={queens} />}
                {studs.length > 0 && <CatGroup title="Kater" cats={studs} />}
                {externalStuds.length > 0 && (
                  <CatGroup title="Fremde Deckkater" cats={externalStuds} />
                )}
                {externalQueens.length > 0 && (
                  <CatGroup title="Fremde Katzen" cats={externalQueens} />
                )}
              </div>
            )}
          </Section>}

        </Stack>
      )}

      <Fab label="Anlegen" onClick={() => setCreateSheet(true)} />

      {/* Eine einzige kompakte Ebene: Warnung antippen, betroffene Kitten sehen,
          bei Bedarf direkt ins Detail wechseln. */}
      <Sheet
        open={Boolean(warningSelection)}
        onClose={() => setWarningLitterId(null)}
        title="Gewichtsauffälligkeiten"
        footer={
          warningSelection ? (
            <Button
              block
              icon="paw"
              onClick={() => {
                const litterId = warningSelection.litter.id;
                setWarningLitterId(null);
                navigate(`/zucht/wurf/${litterId}`);
              }}
            >
              Alle Kitten im Wurf
            </Button>
          ) : undefined
        }
      >
        {warningSelection && (
          <Stack gap="md">
            <Callout tone="warn" icon="alert">
              Hier stehen nur die Kitten, deren aktueller Gewichtsverlauf auffällig oder
              kritisch ist. Ein Eintrag verschwindet automatisch, sobald die Entwicklung
              wieder stabil ist.
            </Callout>
            <List>
              {warningSelection.warningKittens.map(({ kitten, analysis }) => {
                const weight = analysis.latest ? formatGrams(analysis.latest.grams) : 'Noch kein Gewicht';
                const gain = analysis.gainPerDay == null
                  ? undefined
                  : formatGainPerDay(analysis.gainPerDay);
                const reason = analysis.reasons[0];
                return (
                  <ListRow
                    key={kitten.id}
                    leading={<CollarDot colorKey={kitten.collarColor} size={18} />}
                    title={kittenLabel(kitten)}
                    subtitle={[weight, gain, reason].filter(Boolean).join(' · ')}
                    trailing={<WeightLevelBadge level={analysis.level} />}
                    onClick={() => {
                      setWarningLitterId(null);
                      navigate(`/zucht/kitten/${kitten.id}`);
                    }}
                  />
                );
              })}
            </List>
          </Stack>
        )}
      </Sheet>

      {/* --- Auswahl beim Anlegen --------------------------------- */}
      <Sheet open={createSheet} onClose={() => setCreateSheet(false)} title="Was möchtest du anlegen?">
        <div className="flex flex-col gap-2">
          {showLitters && <Button
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
          </Button>}
          {showCats && <Button
            size="lg"
            block
            icon="cat"
            onClick={() => {
              setCreateSheet(false);
              setCatSheet(true);
            }}
          >
            Neue Katze
          </Button>}
        </div>
      </Sheet>

      {showLitters && <LitterEditorSheet
        open={litterSheet}
        onClose={() => setLitterSheet(false)}
        cats={data.cats}
        litters={data.litters}
        settings={settings}
        onSaved={(id) => navigate(`/zucht/wurf/${id}`)}
        onNeedCat={showCats ? () => setCatSheet(true) : undefined}
      />}

      {/* Das vollwertige Editor-Blatt aus dem Katzen-Modul: dort gibt es auch
          den Schalter „Eigenes Tier", über den fremde Deckkater entstehen. */}
      {showCats && <CatEditorSheet open={catSheet} onClose={() => setCatSheet(false)} />}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

/** Eine Gruppe Zuchttiere — die Zeilen kommen aus dem Katzen-Modul und
 *  bringen die Gesundheitstest-Warnung gleich mit. */
function CatGroup({ title, cats }: { title: string; cats: Cat[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="px-1 text-[0.8rem] font-semibold tracking-wide text-text-faint uppercase">
        {title}
      </h3>
      <List>
        {cats.map((cat) => (
          <CatRow key={cat.id} cat={cat} />
        ))}
      </List>
    </div>
  );
}
