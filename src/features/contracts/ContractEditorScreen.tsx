import { Screen, EmptyState } from '../../ui';

/** Platzhalter — wird vom zuständigen Modul ersetzt. */
export function ContractEditorScreen() {
  return (
    <Screen title="Vertrag" back>
      <EmptyState title="Noch nicht gebaut" description="Dieser Bereich wird gerade umgesetzt." />
    </Screen>
  );
}
