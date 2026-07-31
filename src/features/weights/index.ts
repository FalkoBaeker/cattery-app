/**
 * Öffentliche Bausteine des Wiege-Moduls.
 *
 * Andere Module (Würfe, Kitten-Akte, Dokumente/Kundenbild) benutzen
 * ausschließlich diese Ausfuhren — der Rest des Ordners ist Innenleben.
 */

export { WeighScreen } from './WeighScreen';
export { WeightChart, type WeightChartProps } from './WeightChart';
export { WeightHistory, EditWeightSheet, type WeightHistoryProps } from './WeightHistory';
export { WeightBadge, type WeightBadgeProps } from './WeightBadge';

/* Fachlogik — rein, ohne React, überall verwendbar. */
export {
  analyzeKitten,
  dayOfLife,
  dayOfLifeLabel,
  dayProgress,
  deltaToPrevious,
  latestDelta,
  measurementsOn,
  nextFocusId,
  parseGrams,
  previousSample,
  MAX_GRAMS,
  MIN_GRAMS,
  type KittenAnalysis,
  type KittenAnalysisInput,
  type WeightDelta,
  type DayProgress,
} from './weighing';

export {
  ageDaysAt,
  buildChartModel,
  dailyNodes,
  sortSamples,
  type ChartModel,
  type ChartSeriesInput,
  type WeightSample,
} from './chart';

export { addWeight, deleteWeight, updateWeight } from './store';
