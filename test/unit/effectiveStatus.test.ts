import { describe, expect, it } from 'vitest';
import { effectiveStatus } from '../../src/wars/effectiveStatus.js';

describe('effectiveStatus', () => {
  it('returns the stored status when ends_at is null', () => {
    // Arrange
    const war = { status: 'active', endsAt: null };

    // Act
    const status = effectiveStatus(war, new Date('2026-01-01T00:00:00Z'));

    // Assert
    expect(status).toBe('active');
  });

  it('returns the stored status when ends_at is in the future', () => {
    // Arrange
    const war = { status: 'active', endsAt: new Date('2026-01-02T00:00:00Z') };

    // Act
    const status = effectiveStatus(war, new Date('2026-01-01T00:00:00Z'));

    // Assert
    expect(status).toBe('active');
  });

  it('returns closed when ends_at has passed, regardless of stored status', () => {
    // Arrange
    const war = { status: 'active', endsAt: new Date('2026-01-01T00:00:00Z') };

    // Act
    const status = effectiveStatus(war, new Date('2026-01-01T00:00:01Z'));

    // Assert
    expect(status).toBe('closed');
  });

  it('returns closed the instant ends_at equals now', () => {
    // Arrange
    const now = new Date('2026-01-01T00:00:00Z');
    const war = { status: 'active', endsAt: now };

    // Act
    const status = effectiveStatus(war, now);

    // Assert
    expect(status).toBe('closed');
  });

  it('leaves an already-draft War as draft when ends_at has not passed', () => {
    // Arrange
    const war = { status: 'draft', endsAt: null };

    // Act
    const status = effectiveStatus(war, new Date());

    // Assert
    expect(status).toBe('draft');
  });
});
