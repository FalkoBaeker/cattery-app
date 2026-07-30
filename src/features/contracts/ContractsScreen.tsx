import { Screen, EmptyState } from '../../ui';

/** Platzhalter — wird vom zuständigen Modul ersetzt. */
export function ContractsScreen() {
  return (
    <Screen title="Verträge" back>
      <EmptyState title="Noch nicht gebaut" description="Dieser Bereich wird gerade umgesetzt." />
    </Screen>
  );
}
