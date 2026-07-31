import { describe, expect, it } from 'vitest';
import type { Interest } from '../../types';
import {
  interestKittenIds,
  interestWishSexes,
  interestWishSummary,
  kittenAssignmentPatch,
} from './model';

const stamp = { createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' };

function interest(overrides: Partial<Interest> = {}): Interest {
  return {
    id: 'i1',
    name: 'Familie Test',
    wishSex: 'any',
    status: 'new',
    sortIndex: 0,
    ...stamp,
    ...overrides,
  };
}

describe('mehrere Kittenwünsche und Zuordnungen', () => {
  it('liest alte Einzelwünsche weiterhin korrekt', () => {
    expect(interestWishSexes(interest({ wishSex: 'female' }))).toEqual(['female']);
    expect(interestWishSummary(interest({ wishSex: 'female' }))).toBe('1 Katze');
  });

  it('erhält wiederholte Wünsche in ihrer Reihenfolge', () => {
    const value = interest({ wishSexes: ['male', 'female', 'male'] });
    expect(interestWishSexes(value)).toEqual(['male', 'female', 'male']);
    expect(interestWishSummary(value)).toBe('3 Kitten: 2 Kater, 1 Katze');
  });

  it('vereinigt alte und neue Kitten-Zuordnungen ohne Dubletten', () => {
    expect(interestKittenIds(interest({ kittenId: 'k1', kittenIds: ['k1', 'k2'] }))).toEqual([
      'k1',
      'k2',
    ]);
    expect(kittenAssignmentPatch(['k2', 'k3'])).toEqual({
      kittenId: 'k2',
      kittenIds: ['k2', 'k3'],
    });
  });
});
