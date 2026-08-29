import { describe, expect, it } from 'vitest';
import { rankContestants, type ScorableContestant } from '../../src/rankings/scoring.js';

function contestant(overrides: Partial<ScorableContestant> & { id: string }): ScorableContestant {
  return {
    name: overrides.id,
    winCount: 0,
    appearanceCount: 0,
    ...overrides,
  };
}

describe('rankContestants', () => {
  it('ranks by raw win count descending', () => {
    // Arrange
    const contestants = [
      contestant({ id: 'b', winCount: 300, appearanceCount: 400 }),
      contestant({ id: 'a', winCount: 320, appearanceCount: 400 }),
    ];

    // Act
    const ranked = rankContestants(contestants);

    // Assert
    expect(ranked.map((r) => r.contestant.id)).toEqual(['a', 'b']);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.rank).toBe(2);
  });

  it('breaks ties by fewer appearances', () => {
    // Arrange
    const contestants = [
      contestant({ id: 'b', winCount: 50, appearanceCount: 80 }),
      contestant({ id: 'a', winCount: 50, appearanceCount: 60 }),
    ];

    // Act
    const ranked = rankContestants(contestants);

    // Assert
    expect(ranked.map((r) => r.contestant.id)).toEqual(['a', 'b']);
  });

  it('does not let a high win rate on few showings outrank more total wins', () => {
    // Arrange
    const contestants = [
      contestant({ id: 'a', winCount: 3, appearanceCount: 3 }),
      contestant({ id: 'b', winCount: 320, appearanceCount: 400 }),
    ];

    // Act
    const ranked = rankContestants(contestants);

    // Assert
    expect(ranked.map((r) => r.contestant.id)).toEqual(['b', 'a']);
  });

  it('breaks remaining ties alphabetically by name', () => {
    // Arrange
    const contestants = [
      contestant({ id: '2', name: 'Zeta', winCount: 10, appearanceCount: 10 }),
      contestant({ id: '1', name: 'Alpha', winCount: 10, appearanceCount: 10 }),
    ];

    // Act
    const ranked = rankContestants(contestants);

    // Assert
    expect(ranked.map((r) => r.contestant.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('lists zero-appearance contestants last with a null rank', () => {
    // Arrange
    const contestants = [
      contestant({ id: 'c', winCount: 0, appearanceCount: 0 }),
      contestant({ id: 'a', winCount: 5, appearanceCount: 10 }),
    ];

    // Act
    const ranked = rankContestants(contestants);

    // Assert
    expect(ranked.map((r) => r.contestant.id)).toEqual(['a', 'c']);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.rank).toBeNull();
  });
});
