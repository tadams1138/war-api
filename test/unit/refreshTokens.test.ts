import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decideRefresh,
  generateRefreshTokenValue,
  hashRefreshToken,
  type StoredRefreshToken,
} from '../../src/auth/refreshTokens.js';

function token(overrides: Partial<StoredRefreshToken> = {}): StoredRefreshToken {
  return {
    id: 'token-1',
    voterId: 'voter-1',
    familyId: 'family-1',
    tokenHash: 'hash',
    expiresAt: new Date('2099-01-01T00:00:00Z'),
    usedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe('generateRefreshTokenValue', () => {
  it('produces a unique opaque value each call', () => {
    // Arrange & Act
    const a = generateRefreshTokenValue();
    const b = generateRefreshTokenValue();

    // Assert
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe('hashRefreshToken', () => {
  it('is a deterministic SHA-256 hex digest', () => {
    // Arrange
    const value = 'a-refresh-token';
    const expected = createHash('sha256').update(value).digest('hex');

    // Act
    const hash = hashRefreshToken(value);

    // Assert
    expect(hash).toBe(expected);
  });
});

describe('decideRefresh', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('rotates a valid, unused, unexpired token', () => {
    // Arrange
    const stored = token();

    // Act
    const decision = decideRefresh(stored, now);

    // Assert
    expect(decision.kind).toBe('rotate');
  });

  it('treats a missing token as invalid', () => {
    // Arrange & Act
    const decision = decideRefresh(undefined, now);

    // Assert
    expect(decision.kind).toBe('invalid');
  });

  it('treats an expired token as invalid', () => {
    // Arrange
    const stored = token({ expiresAt: new Date('2025-01-01T00:00:00Z') });

    // Act
    const decision = decideRefresh(stored, now);

    // Assert
    expect(decision.kind).toBe('invalid');
  });

  it('treats an already-revoked token as invalid', () => {
    // Arrange
    const stored = token({ revokedAt: new Date('2025-06-01T00:00:00Z') });

    // Act
    const decision = decideRefresh(stored, now);

    // Assert
    expect(decision.kind).toBe('invalid');
  });

  it('detects reuse of an already-used token and names its family', () => {
    // Arrange
    const stored = token({ usedAt: new Date('2025-12-31T00:00:00Z'), familyId: 'family-42' });

    // Act
    const decision = decideRefresh(stored, now);

    // Assert
    expect(decision.kind).toBe('reuseDetected');
    expect(decision.kind === 'reuseDetected' && decision.familyId).toBe('family-42');
  });
});
