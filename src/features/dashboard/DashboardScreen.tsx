import { Screen, EmptyState } from '../../ui';

/** Platzhalter — wird vom zuständigen Modul ersetzt. */
export function DashboardScreen() {
  return (
    <Screen title="Heute">
      <EmptyState title="Noch nicht gebaut" description="Dieser Bereich wird gerade umgesetzt." />
    </Screen>
  );
}
