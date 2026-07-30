import { Screen, EmptyState } from '../../ui';

/** Platzhalter — wird vom zuständigen Modul ersetzt. */
export function WaitlistScreen() {
  return (
    <Screen title="Warteliste">
      <EmptyState title="Noch nicht gebaut" description="Dieser Bereich wird gerade umgesetzt." />
    </Screen>
  );
}
