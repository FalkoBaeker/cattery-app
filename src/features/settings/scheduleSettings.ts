/** Speichert Fahrplan-Einstellungen und zieht bestehende Würfe atomar nach. */

import { clearSettingsCache, db } from '../../db/db';
import { syncAllLitterSchedules } from '../../domain/schedule';
import type { SchedulePlan, Settings } from '../../types';

export async function saveScheduleSettings(
  current: Settings,
  schedule: SchedulePlan,
): Promise<Settings> {
  const next: Settings = { ...current, schedule, id: 'singleton' };

  await db.transaction(
    'rw',
    [db.settings, db.litters, db.kittens, db.careTasks],
    async () => {
      await db.settings.put(next);
      await syncAllLitterSchedules(next);
    },
  );

  // `getSettings` puffert den alten Stand; nach erfolgreichem Commit muss der
  // nächste nicht-reaktive Leser ebenfalls den neuen Fahrplan erhalten.
  clearSettingsCache();
  return next;
}
