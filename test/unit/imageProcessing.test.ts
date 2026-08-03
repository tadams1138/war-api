import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processImage, validateImageUpload } from '../../src/contestants/imageProcessing.js';

async function makeJpeg(width: number, height: number, withExif = false): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  }).jpeg();

  if (!withExif) {
    return base.toBuffer();
  }

  const plain = await base.toBuffer();
  return sharp(plain)
    .withMetadata({ exif: { IFD0: { Make: 'TestCam', GPSLatitude: '40/1' } } })
    .toBuffer();
}

describe('processImage', () => {
  it('re-encodes into WebP variants at 400, 800, and 1600 wide', async () => {
    // Arrange
    const source = await makeJpeg(2000, 1500);

    // Act
    const result = await processImage(source);

    // Assert
    expect(result.variants.map((v) => v.width).sort((a, b) => a - b)).toEqual([400, 800, 1600]);
    for (const variant of result.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(variant.width);
    }
  });

  it('strips EXIF metadata from every variant', async () => {
    // Arrange
    const source = await makeJpeg(2000, 1500, true);
    const sourceMeta = await sharp(source).metadata();
    expect(sourceMeta.exif).toBeTruthy(); // sanity check the fixture actually carries EXIF

    // Act
    const result = await processImage(source);

    // Assert
    for (const variant of result.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.exif).toBeUndefined();
    }
  });

  it('never upscales: omits variants wider than the source', async () => {
    // Arrange
    const source = await makeJpeg(600, 450);

    // Act
    const result = await processImage(source);

    // Assert
    expect(result.variants.map((v) => v.width)).toEqual([400]);
  });

  it('retains the original dimensions for aspect ratio', async () => {
    // Arrange
    const source = await makeJpeg(800, 600);

    // Act
    const result = await processImage(source);

    // Assert
    expect(result.original.width).toBe(800);
    expect(result.original.height).toBe(600);
  });
});

describe('validateImageUpload', () => {
  it('accepts a JPEG under the 10MB limit', () => {
    // Arrange
    const sizeBytes = 5 * 1024 * 1024;
    const mimeType = 'image/jpeg';

    // Act
    const result = validateImageUpload({ mimeType, sizeBytes });

    // Assert
    expect(result.ok).toBe(true);
  });

  it('rejects a file over 10MB', () => {
    // Arrange
    const sizeBytes = 11 * 1024 * 1024;
    const mimeType = 'image/png';

    // Act
    const result = validateImageUpload({ mimeType, sizeBytes });

    // Assert
    expect(result.ok).toBe(false);
  });

  it('rejects an unsupported mime type', () => {
    // Arrange
    const sizeBytes = 1024;
    const mimeType = 'image/gif';

    // Act
    const result = validateImageUpload({ mimeType, sizeBytes });

    // Assert
    expect(result.ok).toBe(false);
  });
});
