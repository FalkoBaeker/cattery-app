/**
 * Der Fahrplan eines Wurfes, nach Lebenswochen gruppiert und abhakbar.
 *
 * Überfällige Punkte sind rot, bald fällige gelb. Vor Chippen und Kastration
 * erinnert die App an ein aktuelles Gewicht — ab Woche 5 wird ja nicht mehr
 * routinemäßig gewogen, die Dosierung hängt aber daran.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyState, Icon, Section, useToast, type BadgeTone } from '../../ui';
import { kittenLabel } from '../../types';
import type { CareTask, ID, Kitten, Litter, Settings, WeightEntry } from '../../types';
import { dueState, syncLitterSchedule, type DueState } from '../../domain/schedule';
import { formatDate, formatDateTime, formatRelativeDay } from '../../lib/date';
import { toggleTaskDone } from './data';
import { groupTasksByWeek } from './litter';
import { CollarDot } from './parts';

const STATE_TONE: Record<DueState, BadgeTone> = {
  overdue: 'alert',
  today: 'warn',
  soon: 'warn',
  upcoming: 'neutral',
  done: 'ok',
};

const STATE_LABEL: Record<DueState, string> = {
  overdue: 'überfällig',
  today: 'heute',
  soon: 'bald',
  upcoming: '',
  done: 'erledigt',
};

export function ScheduleSection({
  litter,
  tasks,
  kittens,
  weights,
  settings,
  onEditLitter,
}: {
  litter: Litter;
  tasks: CareTask[];
  kittens: Kitten[];
  weights: Pick<WeightEntry, 'kittenId' | 'at'>[];
  settings: Settings;
  onEditLitter: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [building, setBuilding] = useState(false);

  const kittenById = useMemo(() => new Map(kittens.map((k) => [k.id, k])), [kittens]);
  const groups = useMemo(
    () => groupTasksByWeek(tasks, litter.birthDate),
    [tasks, litter.birthDate],
  );

  /** Letzte Wiegung je Kitten und im ganzen Wurf. */
  const lastWeight = useMemo(() => {
    const byKitten = new Map<ID, string>();
    let newest: string | undefined;
    for (const w of weights) {
      const current = byKitten.get(w.kittenId);
      if (!current || w.at > current) byKitten.set(w.kittenId, w.at);
      if (!newest || w.at > newest) newest = w.at;
    }
    return { byKitten, newest };
  }, [weights]);

  async function toggle(task: CareTask) {
    try {
      await toggleTaskDone(task.id, !task.doneAt);
    } catch (e) {
      toast.error('Konnte nicht gespeichert werden.');
      console.error(e);
    }
  }

  /**
   * Nachträglich erzeugen. Nötig für Würfe, die vor dem Fahrplan angelegt
   * wurden oder deren Aufgaben versehentlich alle gelöscht wurden — sonst
   * wäre der Leerzustand eine Sackgasse.
   */
  async function buildSchedule() {
    setBuilding(true);
    try {
      await syncLitterSchedule(litter.id, settings);
      toast.success('Fahrplan erstellt.');
    } catch (e) {
      toast.error('Fahrplan konnte nicht erstellt werden.');
      console.error(e);
    } finally {
      setBuilding(false);
    }
  }

  if (tasks.length === 0) {
    const hasBirthDate = Boolean(litter.birthDate);
    return (
      <Section title="Fahrplan">
        <EmptyState
          icon="calendar"
          title={hasBirthDate ? 'Kein Fahrplan vorhanden' : 'Noch kein Geburtsdatum'}
          description={
            hasBirthDate
              ? 'Aus dem Geburtsdatum entstehen Entwurmungen, Impfungen, Chippen, Kastration, Wurfmeldung und der früheste Abgabetermin.'
              : 'Aus dem Geburtsdatum entstehen Entwurmungen, Impfungen, Chippen, Kastration, Wurfmeldung und der früheste Abgabetermin — von selbst.'
          }
          action={
            hasBirthDate ? (
              <Button
                variant="primary"
                icon="calendar"
                onClick={buildSchedule}
                loading={building}
              >
                Fahrplan erstellen
              </Button>
            ) : (
              <Button icon="edit" onClick={onEditLitter}>
                Geburtsdatum eintragen
              </Button>
            )
          }
        />
      </Section>
    );
  }

  return (
    <Section title="Fahrplan" description="Abhaken, sobald erledigt">
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={String(group.week)} className="flex flex-col gap-1">
            <h3 className="px-1 text-[0.8rem] font-semibold tracking-wide text-text-faint uppercase">
              {group.label}
            </h3>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
              {group.tasks.map((task, i) => {
                const state = dueState(task, settings.schedule);
                const kitten = task.kittenId ? kittenById.get(task.kittenId) : undefined;
                const done = Boolean(task.doneAt);
                const needsWeight =
                  !done && (task.kind === 'chip' || task.kind === 'neuter') && state !== 'upcoming';
                const weightAt = kitten
                  ? lastWeight.byKitten.get(kitten.id)
                  : lastWeight.newest;

                return (
                  <div
                    key={task.id}
                    className={[
                      'flex items-start gap-3 px-3 py-2.5',
                      i > 0 ? 'border-t border-border' : '',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(task)}
                      aria-pressed={done}
                      aria-label={done ? `${task.title} wieder öffnen` : `${task.title} abhaken`}
                      className={[
                        'mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full border',
                        done
                          ? 'border-transparent bg-ok text-white'
                          : 'border-border-strong text-text-faint active:bg-surface-2',
                      ].join(' ')}
                    >
                      <Icon name="check" size={20} strokeWidth={done ? 2.5 : 1.7} />
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={[
                            'text-[0.95rem] font-medium',
                            done ? 'text-text-faint line-through' : 'text-text',
                          ].join(' ')}
                        >
                          {task.title}
                        </span>
                        {kitten && (
                          <span className="inline-flex items-center gap-1 text-[0.85rem] text-text-dim">
                            <CollarDot colorKey={kitten.collarColor} size={10} />
                            {kittenLabel(kitten)}
                          </span>
                        )}
                        {!done && STATE_LABEL[state] && (
                          <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
                        )}
                      </div>

                      <span className="text-[0.83rem] text-text-dim">
                        {done
                          ? `Erledigt am ${formatDate(task.doneAt)}`
                          : `${formatDate(task.dueDate)} · ${formatRelativeDay(task.dueDate)}`}
                      </span>

                      {task.detail && !needsWeight && (
                        <span className="text-[0.83rem] text-text-faint">{task.detail}</span>
                      )}

                      {needsWeight && (
                        <div className="mt-1 flex flex-col gap-1.5 rounded-[var(--radius-field)] bg-surface-2 p-2.5">
                          <span className="text-[0.83rem] leading-relaxed text-text-dim">
                            Vorher ein aktuelles Gewicht erfassen — danach wird dosiert.
                            {weightAt
                              ? ` Letzte Wiegung: ${formatDateTime(weightAt)}.`
                              : ' Bisher keine Wiegung erfasst.'}
                          </span>
                          <Button
                            size="sm"
                            icon="scale"
                            onClick={() => navigate(`/wiegen/${litter.id}`)}
                          >
                            Jetzt wiegen
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
