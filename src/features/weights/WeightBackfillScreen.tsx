import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, useParams } from 'react-router';
import { db } from '../../db/db';
import { EmptyState, Screen, Spinner } from '../../ui';

/** Existing bookmarks lead to the same litter weighing screen. */
export function WeightBackfillScreen() {
  const { kittenId = '' } = useParams();
  const kitten = useLiveQuery(async () => (await db.kittens.get(kittenId)) ?? null, [kittenId]);
  if (kitten === undefined) return <Screen title="Wiegen" back><Spinner /></Screen>;
  if (!kitten) return <Screen title="Wiegen" back><EmptyState icon="alert" title="Kitten nicht gefunden" /></Screen>;
  return <Navigate to={`/wiegen/${kitten.litterId}`} replace />;
}
