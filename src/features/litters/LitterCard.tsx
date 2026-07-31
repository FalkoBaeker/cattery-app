/**
 * Die Karten der Wurfübersicht.
 * Laufende Würfe zeigen alles, was tagsüber zählt: Alter, Anzahl, Wiegestand,
 * nächster Fahrplan-Punkt, Warnungen aus der Gewichtsbewertung.
 */

import { Badge, Button, Card, Icon } from '../../ui';
import type { CareTask, Litter, Settings } from '../../types';
import { dueState } from '../../domain/schedule';
import { ageInWeeks, formatAge, formatDate, formatRelativeDay } from '../../lib/date';
import { countdownLabel, pregnancyInfo, summaryLine, weighingLine, type LitterSummary } from './litter';
import { LitterStatusBadge } from './parts';

function parentLine(motherName: string, fatherName?: string): string {
  return fatherName ? `${motherName} × ${fatherName}` : motherName;
}

export function RunningLitterCard({
  litter,
  motherName,
  fatherName,
  summary,
  warnings,
  nextTask,
  settings,
  onOpen,
  onWeigh,
}: {
  litter: Litter;
  motherName: string;
  fatherName?: string;
  summary: LitterSummary;
  warnings: number;
  nextTask?: CareTask;
  settings: Settings;
  onOpen: () => void;
  onWeigh: () => void;
}) {
  const nextState = nextTask ? dueState(nextTask, settings.schedule) : undefined;
  // Ab Woche 5 wird nicht mehr routinemäßig gewogen (F10) — dann ist ein
  // „heute noch nicht gewogen" keine Mahnung mehr, sondern nur Lärm.
  const inWeighingPhase = litter.birthDate ? ageInWeeks(litter.birthDate) < 5 : false;

  return (
    <Card padded={false}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-2 p-4 text-left active:bg-surface-2"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-[1.05rem] font-semibold text-text">
            {parentLine(motherName, fatherName)}
          </span>
          <LitterStatusBadge status={litter.status} />
        </div>

        <span className="text-[0.9rem] text-text-dim">
          {litter.birthDate ? (
            <>
              {formatAge(litter.birthDate)} · geboren am {formatDate(litter.birthDate)}
            </>
          ) : (
            'Geburtsdatum fehlt noch'
          )}
        </span>

        <span className="text-[0.9rem] text-text">{summaryLine(summary)}</span>

        <div className="flex flex-wrap items-center gap-1.5">
          {inWeighingPhase && (
            <Badge
              tone={summary.allWeighedToday ? 'ok' : summary.toWeigh > 0 ? 'warn' : 'neutral'}
              icon="scale"
            >
              {weighingLine(summary)}
            </Badge>
          )}
          {warnings > 0 && (
            <Badge tone="alert" icon="alert">
              {warnings} {warnings === 1 ? 'Kitten auffällig' : 'Kitten auffällig'}
            </Badge>
          )}
        </div>

        {nextTask && (
          <span
            className={[
              'flex items-center gap-1.5 text-[0.88rem]',
              nextState === 'overdue'
                ? 'text-alert'
                : nextState === 'today' || nextState === 'soon'
                  ? 'text-warn'
                  : 'text-text-dim',
            ].join(' ')}
          >
            <Icon name="calendar" size={16} />
            {nextTask.title} · {formatRelativeDay(nextTask.dueDate)}
          </span>
        )}
      </button>

      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <Button icon="scale" onClick={onWeigh}>
          Wiegen
        </Button>
        <Button variant="primary" iconRight="chevron-right" onClick={onOpen}>
          Wurf öffnen
        </Button>
      </div>
    </Card>
  );
}

export function PlannedLitterCard({
  litter,
  motherName,
  fatherName,
  settings,
  onOpen,
}: {
  litter: Litter;
  motherName: string;
  fatherName?: string;
  settings: Settings;
  onOpen: () => void;
}) {
  const info = pregnancyInfo(litter.matingDate, settings.gestationDays);
  const due = litter.dueDate ?? info?.dueDate;

  return (
    <Card padded={false}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-2 p-4 text-left active:bg-surface-2"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-[1.02rem] font-semibold text-text">
            {parentLine(motherName, fatherName)}
          </span>
          <LitterStatusBadge status={litter.status} />
        </div>

        {due ? (
          <span className="text-[0.9rem] text-text">
            Termin {formatDate(due)} · {countdownLabel(due)}
          </span>
        ) : (
          <span className="text-[0.9rem] text-text-dim">
            Noch kein Deckdatum — der Termin ergibt sich daraus von selbst.
          </span>
        )}

        {info && info.elapsedDays >= 0 && (
          <div className="flex flex-col gap-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.round(info.progress * 100)}%` }}
              />
            </div>
            <span className="text-[0.82rem] text-text-dim">{info.label}</span>
          </div>
        )}
      </button>
    </Card>
  );
}
