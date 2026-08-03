import { describe, expect, it } from 'vitest';
import { presentMedia } from '../../src/contestants/mediaPresenter.js';
import type { ContestantMedia } from '../../src/contestants/contestantMediaRepository.js';

function media(overrides: Partial<ContestantMedia>): ContestantMedia {
  return {
    id: 'media-1',
    contestantId: 'contestant-1',
    kind: 'image',
    displayOrder: 0,
    storageKey: 'contestants/contestant-1/media-1',
    originalExt: 'jpg',
    width: 2000,
    height: 1500,
    ...overrides,
  };
}

describe('presentMedia', () => {
  it('includes only variant widths the source is wide enough for', () => {
    // Arrange
    const items = [media({ width: 600, height: 450 })];

    // Act
    const [view] = presentMedia(items, 'https://cdn.example.com');

    // Assert
    expect(view!.variants.map((v) => v.width)).toEqual([400]);
  });

  it('builds variant urls by convention', () => {
    // Arrange
    const items = [media({ storageKey: 'contestants/c1/m1', width: 2000, height: 1500 })];

    // Act
    const [view] = presentMedia(items, 'https://cdn.example.com');

    // Assert
    expect(view!.variants).toEqual([
      { width: 400, url: 'https://cdn.example.com/contestants/c1/m1-400.webp' },
      { width: 800, url: 'https://cdn.example.com/contestants/c1/m1-800.webp' },
      { width: 1600, url: 'https://cdn.example.com/contestants/c1/m1-1600.webp' },
    ]);
  });

  it('computes aspect ratio from stored source dimensions', () => {
    // Arrange
    const items = [media({ width: 800, height: 600 })];

    // Act
    const [view] = presentMedia(items, 'https://cdn.example.com');

    // Assert
    expect(view!.aspect_ratio).toBeCloseTo(1.333, 3);
  });
});
