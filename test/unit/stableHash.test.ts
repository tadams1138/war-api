import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stableHash, isLeftSide } from '../../src/matchups/stableHash.js';

describe('stableHash', () => {
  it('is deterministic for the same matchup and voter', () => {
    // Arrange
    const matchupId = '11111111-1111-1111-1111-111111111111';
    const voterId = '22222222-2222-2222-2222-222222222222';

    // Act
    const first = stableHash(matchupId, voterId);
    const second = stableHash(matchupId, voterId);

    // Assert
    expect(first).toBe(second);
  });

  it('differs across voters for the same matchup (not guaranteed but true for these fixtures)', () => {
    // Arrange
    const matchupId = '11111111-1111-1111-1111-111111111111';
    const voterA = '22222222-2222-2222-2222-222222222222';
    const voterB = '33333333-3333-3333-3333-333333333333';

    // Act
    const hashA = stableHash(matchupId, voterA);
    const hashB = stableHash(matchupId, voterB);

    // Assert
    expect(hashA).not.toBe(hashB);
  });

  it('matches the md5(matchup_id || voter_id) hex digest named in the spec', () => {
    // Arrange
    const matchupId = 'm1';
    const voterId = 'v1';
    // md5('m1v1') computed independently with node:crypto for this fixture.
    const expected = createHash('md5').update('m1v1').digest('hex');

    // Act
    const hash = stableHash(matchupId, voterId);

    // Assert
    expect(hash).toBe(expected);
  });
});

describe('isLeftSide', () => {
  it('is deterministic for the same matchup and voter', () => {
    // Arrange
    const matchupId = '11111111-1111-1111-1111-111111111111';
    const voterId = '22222222-2222-2222-2222-222222222222';

    // Act
    const first = isLeftSide(matchupId, voterId);
    const second = isLeftSide(matchupId, voterId);

    // Assert
    expect(first).toBe(second);
  });

  it('depends on its inputs rather than being a constant value', () => {
    // Arrange: recomputing the same digest with the same library restates
    // the implementation and can never fail while it stays internally
    // consistent (design review finding 11). Instead, assert the property
    // the spec actually needs: across a spread of matchup ids, both sides
    // occur — a constant-true or constant-false implementation would fail.
    const voterId = 'v1';
    const matchupIds = Array.from({ length: 20 }, (_, i) => `matchup-${i}`);

    // Act
    const results = matchupIds.map((matchupId) => isLeftSide(matchupId, voterId));

    // Assert
    expect(results).toContain(true);
    expect(results).toContain(false);
  });
});
