/**
 * Gewichtskurve als selbst gezeichnetes SVG — keine Bibliothek, damit die
 * App offline und leichtgewichtig bleibt.
 *
 *  - x = Alter in Tagen, y = Gramm
 *  - echte Messungen als Linie und Punkte, Tagesmittel als größere Knoten
 *  - das betrachtete Kitten kräftig, die Geschwister blass dahinter
 *  - Achsen über semantische Farben, damit hell und dunkel beide stimmen
 *  - eine einzige Messung ergibt einen Punkt, keine Linie
 */

import { useMemo } from 'react';
import type { ID, ISODate } from '../../types';
import { ColorDot, EmptyState } from '../../ui';
import { formatGrams } from '../../lib/format';
import { buildChartModel, type ChartSeriesInput } from './chart';

export interface WeightChartProps {
  series: ChartSeriesInput[];
  /** Dieses Kitten wird hervorgehoben; ohne Angabe sind alle gleich kräftig. */
  focusKittenId?: ID;
  /** Geburtsdatum des Wurfes. Fehlt es, zählt die Achse ab der ersten Wiegung. */
  birthDate?: ISODate;
  height?: number;
  /** Legende unter der Kurve zeigen. */
  legend?: boolean;
  /** Text für den Leerzustand, falls noch nichts gewogen wurde. */
  emptyHint?: string;
  className?: string;
}

const VIEW_WIDTH = 340;

export function WeightChart({
  series,
  focusKittenId,
  birthDate,
  height = 200,
  legend = true,
  emptyHint = 'Sobald das erste Gewicht eingetragen ist, entsteht hier die Kurve.',
  className = '',
}: WeightChartProps) {
  const model = useMemo(
    () => buildChartModel({ series, focusKittenId, birthDate, width: VIEW_WIDTH, height }),
    [series, focusKittenId, birthDate, height],
  );

  if (model.totalMeasurements === 0) {
    return <EmptyState icon="chart" title="Noch keine Wiegung" description={emptyHint} />;
  }

  const { plot } = model;
  const axisY = plot.y + plot.h;
  // Bei vielen Kitten würden die Einzelmessungen die Kurve zukleistern.
  const dense = model.series.length > 4;

  const summary = model.series
    .map((s) => `${s.label}: ${s.latestGrams ? formatGrams(s.latestGrams) : 'ohne Wiegung'}`)
    .join(', ');

  return (
    <div className={['flex flex-col gap-2', className].join(' ')}>
      <svg
        viewBox={`0 0 ${model.width} ${model.height}`}
        className="w-full"
        style={{ height: 'auto' }}
        role="img"
        aria-label={`Gewichtskurve. ${summary}`}
      >
        {/* Waagerechte Hilfslinien */}
        <g className="text-border" stroke="currentColor" strokeWidth={0.6}>
          {model.yTicks.map((t) => (
            <line key={`grid-${t.value}`} x1={plot.x} x2={plot.x + plot.w} y1={t.pos} y2={t.pos} />
          ))}
        </g>

        {/* Achsenlinie unten */}
        <line
          x1={plot.x}
          x2={plot.x + plot.w}
          y1={axisY}
          y2={axisY}
          className="text-border-strong"
          stroke="currentColor"
          strokeWidth={1}
        />

        {/* Beschriftung */}
        <g className="text-text-faint" fill="currentColor" fontSize={10}>
          {model.yTicks.map((t) => (
            <text
              key={`yl-${t.value}`}
              x={plot.x - 5}
              y={t.pos}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {t.label}
            </text>
          ))}
          {model.xTicks.map((t) => (
            <text key={`xl-${t.value}`} x={t.pos} y={axisY + 13} textAnchor="middle">
              {t.label}
            </text>
          ))}
        </g>

        {/* Reihen: blasse Geschwister zuerst, betrachtetes Kitten zuletzt */}
        {model.series.map((s) => {
          const showDots = !dense || (focusKittenId ? s.focus : false);
          return (
            <g key={s.kittenId} opacity={s.focus ? 1 : 0.32}>
              {/* Heller Saum unter jeder Kurve: Halsbandfarben wie Schwarz
                  oder Weiß gehen sonst im dunklen bzw. hellen Hintergrund
                  unter — auch auf der Wurfkurve ohne betrachtetes Kitten. */}
              {s.path && (
                <path
                  d={s.path}
                  fill="none"
                  className="text-surface"
                  stroke="currentColor"
                  strokeWidth={s.focus ? 4 : 2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {s.path && (
                <path
                  d={s.path}
                  fill="none"
                  stroke={s.hex}
                  strokeWidth={s.focus ? 2.2 : 1.3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {s.nodes.map((n) => (
                <circle
                  key={`n-${s.kittenId}-${n.date}`}
                  cx={n.px}
                  cy={n.py}
                  r={s.focus ? 2.6 : 1.6}
                  fill={s.hex}
                  className="text-surface"
                  stroke="currentColor"
                  strokeWidth={s.focus ? 1 : 0.7}
                />
              ))}
              {showDots &&
                s.dots.map((d) => (
                  <circle
                    key={`d-${s.kittenId}-${d.at}`}
                    cx={d.px}
                    cy={d.py}
                    r={1.5}
                    fill={s.hex}
                    opacity={0.55}
                  />
                ))}
            </g>
          );
        })}
      </svg>

      <div className="flex items-baseline justify-between px-1 text-[0.75rem] text-text-faint">
        <span>Gramm</span>
        <span>{model.xAxisLabel}</span>
      </div>

      {legend && model.series.length > 1 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
          {[...model.series]
            .sort((a, b) => Number(b.focus) - Number(a.focus))
            .map((s) => (
              <li
                key={s.kittenId}
                className={[
                  'flex items-center gap-1.5 text-[0.78rem]',
                  s.focus ? 'text-text' : 'text-text-dim',
                ].join(' ')}
              >
                <ColorDot hex={s.hex} size={9} />
                <span className="max-w-[9rem] truncate">{s.label}</span>
                {s.latestGrams != null && (
                  <span className="tabular text-text-faint">{formatGrams(s.latestGrams)}</span>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
