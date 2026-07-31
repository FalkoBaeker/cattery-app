/**
 * Öffentliche Schnittstelle des Wurf-Moduls.
 * Andere Module importieren ausschließlich von hier.
 */

export { ZuchtScreen } from './ZuchtScreen';
export { LitterDetailScreen } from './LitterDetailScreen';
export { KittenDetailScreen } from './KittenDetailScreen';

export { RunningLitterCard, PlannedLitterCard } from './LitterCard';
export { LitterEditorSheet } from './LitterEditorSheet';
export { KittenEditorSheet } from './KittenEditorSheet';
export { BirthLogSheet } from './BirthLogSheet';
export { ScheduleSection } from './ScheduleSection';
export {
  CollarDot,
  CollarPicker,
  DataRow,
  DateInput,
  LitterStatusBadge,
  Loading,
  SaleStatusBadge,
  SexPicker,
  Sparkline,
  WeightLevelBadge,
} from './parts';

export {
  addBirthEvent,
  addKitten,
  deleteKitten,
  ensureLitterBorn,
  linkInterest,
  markKittenDeceased,
  noonOf,
  revokeKittenDeath,
  toggleTaskDone,
  updateSaleStatus,
} from './data';

export {
  analyzeLitterWeights,
  contractionIntervals,
  contractionStats,
  countWeightWarnings,
  countdownLabel,
  dueDateFromMating,
  formatDuration,
  groupTasksByWeek,
  isLivingKitten,
  nextOpenTask,
  pregnancyInfo,
  suggestCollarColor,
  summarizeLitter,
  summaryLine,
  weighingLine,
  type ContractionEntry,
  type ContractionStats,
  type LitterSummary,
  type PregnancyInfo,
  type TaskWeekGroup,
} from './litter';

export { useSettings, useTicker, mergeSettings } from './hooks';
