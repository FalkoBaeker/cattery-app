/**
 * Die Karten der Wurfübersicht.
 * Laufende Würfe zeigen alles, was tagsüber zählt: Alter, Anzahl, Wiegestand,
 * nächster Fahrplan-Punkt, Warnungen aus der Gewichtsbewertung.
 */

import { Badge, Button, Card, Icon } from '../../ui';
import type { CareTask, Litter, Settings } from '../../types';
import { dueState } from '../../domain/schedule';
import { formatAge, formatDate, formatRelativeDay } from '../../lib/date';
import { countdownLabel, pregnancyInfo, summaryLine, weighingStatus, type LitterSummary } from './litter';
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
  showWeights = true,
  onOpen,
  onWeigh,
  onOpenWarnings,
}: {
  litter: Litter;
  motherName: string;
  fatherName?: string;
  summary: LitterSummary;
  warnings: number;
  nextTask?: CareTask;
  settings: Settings;
  showWeights?: boolean;
  onOpen: () => void;
  onWeigh?: () => void;
  onOpenWarnings?: () => void;
}) {
  const nextState = nextTask ? dueState(nextTask, settings.schedule) : undefined;
  // Ab Woche 5 wird nicht mehr routinemäßig gewogen (F10) — dann steht hier
  // ein neutraler Hinweis statt einer Mahnung. Wortloses Verschwinden liest
  // sich sonst wie ein Fehler.
  const weighing = weighingStatus(summary, litter.birthDate);

  return (
    <Card padded={false}>
      <div className="flex flex-col gap-2 p-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full flex-col gap-2 text-left"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0 text-[1.05rem] font-semibold text-text">
              {parentLine(motherName, fatherName)}
            </span>
            <LitterStatusBadge status={litter.status} />
          </span>

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
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {showWeights && weighing && (
            <Badge tone={weighing.tone} icon="scale">
              {weighing.text}
            </Badge>
          )}
          {showWeights && warnings > 0 && onOpenWarnings && (
            <button
              type="button"
              onClick={onOpenWarnings}
              aria-label={`${warnings} auffällige Kitten anzeigen`}
              className="flex min-h-11 items-center gap-1 rounded-full px-1 active:bg-alert-soft"
            >
              <Badge tone="alert" icon="alert" className="text-[0.8rem]">
                {/* „Kitten" hat keine eigene Mehrzahlform. */}
                {warnings} Kitten auffällig
              </Badge>
              <Icon name="chevron-right" size={15} className="text-alert" />
            </button>
          )}
        </div>

        {nextTask && (
          <button
            type="button"
            onClick={onOpen}
            className={[
              'flex min-h-11 items-center gap-1.5 text-left text-[0.88rem]',
              nextState === 'overdue'
                ? 'text-alert'
                : nextState === 'today' || nextState === 'soon'
                  ? 'text-warn'
                  : 'text-text-dim',
            ].join(' ')}
          >
            <Icon name="calendar" size={16} />
            {nextTask.title} · {formatRelativeDay(nextTask.dueDate)}
          </button>
        )}
      </div>

      <div
        className={[
          'grid gap-2 border-t border-border p-3',
          showWeights && onWeigh ? 'grid-cols-2' : 'grid-cols-1',
        ].join(' ')}
      >
        {showWeights && onWeigh && (
          <Button icon="scale" onClick={onWeigh}>
            Wiegen
          </Button>
        )}
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
