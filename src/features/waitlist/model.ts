import type { ID, Interest, WishSex } from '../../types';

/** Wünsche aus Neu- und Altbeständen in eine verlässliche Liste überführen. */
export function interestWishSexes(
  interest: Pick<Interest, 'wishSex' | 'wishSexes'>,
): WishSex[] {
  const valid = (interest.wishSexes ?? []).filter(
    (sex): sex is WishSex => sex === 'male' || sex === 'female' || sex === 'any',
  );
  return valid.length > 0 ? valid : [interest.wishSex];
}

/** Zugeordnete Kitten aus Neu- und Altbeständen ohne Dubletten. */
export function interestKittenIds(
  interest: Pick<Interest, 'kittenId' | 'kittenIds'>,
): ID[] {
  return [...new Set([...(interest.kittenIds ?? []), ...(interest.kittenId ? [interest.kittenId] : [])])];
}

/** Beide Felder synchron halten, damit auch ältere App-Versionen den ersten Treffer sehen. */
export function kittenAssignmentPatch(ids: ID[]): Pick<Interest, 'kittenId' | 'kittenIds'> {
  const unique = [...new Set(ids)];
  return {
    kittenId: unique[0],
    kittenIds: unique.length > 0 ? unique : undefined,
  };
}

export function wishSexPatch(sexes: WishSex[]): Pick<Interest, 'wishSex' | 'wishSexes'> {
  const normalized: WishSex[] = sexes.length > 0 ? sexes : ['any'];
  return {
    wishSex: normalized[0],
    wishSexes: normalized,
  };
}

/** Kurze, aber vollständige Beschreibung für Liste und Detailkopf. */
export function interestWishSummary(
  interest: Pick<Interest, 'wishSex' | 'wishSexes'>,
): string {
  const sexes = interestWishSexes(interest);
  const males = sexes.filter((sex) => sex === 'male').length;
  const females = sexes.filter((sex) => sex === 'female').length;
  const any = sexes.filter((sex) => sex === 'any').length;

  if (sexes.length === 1) {
    if (males) return '1 Kater';
    if (females) return '1 Katze';
    return '1 Kitten · Geschlecht egal';
  }

  const parts = [
    males ? `${males} ${males === 1 ? 'Kater' : 'Kater'}` : null,
    females ? `${females} ${females === 1 ? 'Katze' : 'Katzen'}` : null,
    any ? `${any} × egal` : null,
  ].filter(Boolean);
  return `${sexes.length} Kitten: ${parts.join(', ')}`;
}
