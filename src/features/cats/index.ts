/**
 * Modul Zuchttiere.
 *
 * Alles, was andere Bildschirme (vor allem die Zuchtübersicht) brauchen
 * könnten, wird hier veröffentlicht:
 *
 *   import { CatRow, CatEditorSheet } from '../cats';
 *
 * Der Bildschirm selbst hängt in src/app/routes.tsx unter /zucht/katze/:catId.
 */

/* Bildschirm und Blätter */
export { CatDetailScreen } from './CatDetailScreen';
export { CatEditorSheet, type CatEditorSheetProps } from './CatEditorSheet';
export { HeatSheet, type HeatSheetProps } from './HeatSheet';
export { HealthTestSheet, type HealthTestSheetProps } from './HealthTestSheet';
export { CatWeightSheet, type CatWeightSheetProps } from './CatWeightSheet';

/* Bausteine */
export { CatRow, type CatRowProps } from './CatRow';
export { CatAvatar } from './CatAvatar';
export { WeightTrend, type TrendPoint } from './WeightTrend';

/* Reine Fachlogik */
export {
  MIN_CYCLES_FOR_PREDICTION,
  SAME_HEAT_GAP_DAYS,
  ONGOING_MAX_DAYS,
  analyzeHeatCycles,
  normalizeHeatCycles,
  isValidISODate,
  type HeatAnalysis,
  type HeatCycleSpan,
  type HeatInput,
  type HeatPrediction,
} from './heat';

export {
  DUE_SOON_DAYS,
  HEALTH_TEST_ICON,
  HEALTH_TEST_STATE_LABEL,
  HEALTH_TEST_STATE_TONE,
  computeNextDueDate,
  healthTestGroupKey,
  healthTestStatus,
  healthTestTitle,
  summarizeHealthTests,
  type HealthTestGroup,
  type HealthTestState,
  type HealthTestStatus,
  type HealthTestSummary,
} from './tests';

export { catAgeLabel, fullMonthsBetween } from './age';
export {
  buildCatTimeline,
  type CatEventKind,
  type CatTimelineEvent,
  type CatTimelineInput,
  type EventTone,
} from './timeline';

/* Helfer */
export { useAttachmentUrl, useSettings } from './hooks';
export { downscaleImage, type ScaledImage } from './image';
