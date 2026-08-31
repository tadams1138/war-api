import { describe, expect, it } from 'vitest';
import { presentWarSummary } from '../../src/wars/warPresenter.js';
import type { War } from '../../src/wars/warsRepository.js';

function makeWar(overrides: Partial<War> = {}): War {
  return {
    id: 'a5b1e2c4-9999-4a11-8a11-000000000001',
    creatorId: 'creator-1',
    title: 'Test War',
    category: null,
    status: 'draft',
    visibility: 'public',
    mediaMode: 'image',
    contestantSchema: [],
    endsAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('presentWarSummary', () => {
  it('carries the given contestant count on the view, regardless of War status (spec §11.2.1 addendum)', () => {
    // Arrange
    const war = makeWar({ status: 'draft' });

    // Act
    const view = presentWarSummary(war, new Date('2026-01-01T00:00:00Z'), 2);

    // Assert
    expect(view.contestant_count).toBe(2);
  });

  it('reports zero contestants when none are given', () => {
    // Arrange
    const war = makeWar({ status: 'active' });

    // Act
    const view = presentWarSummary(war, new Date('2026-01-01T00:00:00Z'), 0);

    // Assert
    expect(view.contestant_count).toBe(0);
  });
});
