import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeDraftWar, makeContestant, giveContestantAnImage } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/media-images.feature', import.meta.url)));

async function largeNoiseJpeg(): Promise<Buffer> {
  // Random noise compresses poorly, approximating a large real-world photo
  // without needing megapixel dimensions that would slow the suite down.
  const width = 2000;
  const height = 1500;
  const raw = randomBytes(width * height * 3);
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

async function smallJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 200, b: 90 } } }).jpeg().toBuffer();
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;
  let warId: string;
  let creatorId: string;
  let contestantId: string;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    const creator = await makeVoter(harness.db, 'creator');
    creatorId = creator.id;
    const war = await makeDraftWar(harness.db, creatorId);
    warId = war.id;
    const contestant = await makeContestant(harness.db, warId, 'Contestant');
    contestantId = contestant.id;
    await harness.app.ready();
  });

  async function uploadImage(buffer: Buffer, filename = 'photo.jpg', contentType = 'image/jpeg') {
    const jwt = await harness.jwtFor(creatorId);
    return request(harness.app.server)
      .post(`/api/v1/wars/${warId}/contestants/${contestantId}/images`)
      .set('Authorization', `Bearer ${jwt}`)
      .attach('file', buffer, { filename, contentType });
  }

  Scenario('Uploaded images are re-encoded into variants', ({ Given, When, Then, And }) => {
    let uploadResponse: request.Response;

    Given('a 10MB JPEG uploaded for a contestant', async () => {
      const buffer = await largeNoiseJpeg();
      uploadResponse = await uploadImage(buffer);
    });

    When('the upload completes', () => {
      expect(uploadResponse.status).toBe(201);
    });

    Then('WebP variants are stored at 400, 800, and 1600 pixels wide', () => {
      const publicKeys = [...harness.storage.publicObjects.keys()];
      expect(publicKeys.some((key) => key.endsWith('-400.webp'))).toBe(true);
      expect(publicKeys.some((key) => key.endsWith('-800.webp'))).toBe(true);
      expect(publicKeys.some((key) => key.endsWith('-1600.webp'))).toBe(true);
    });

    And('the original is retained in a private prefix', () => {
      const privateKeys = [...harness.storage.privateObjects.keys()];
      expect(privateKeys.some((key) => key.startsWith(`originals/${contestantId}/`))).toBe(true);
    });
  });

  Scenario('EXIF metadata is stripped', ({ Given, When, Then }) => {
    Given('an uploaded photo containing GPS coordinates in its EXIF data', async () => {
      const plain = await smallJpeg(1200, 900);
      const withExif = await sharp(plain).withMetadata({ exif: { IFD0: { GPSLatitude: '40/1' } } }).toBuffer();
      await uploadImage(withExif);
    });

    When('the variants are generated', () => {
      // Handled by the upload itself (spec §11.1: processing is synchronous).
    });

    Then('no EXIF metadata is present in any variant', async () => {
      for (const buffer of harness.storage.publicObjects.values()) {
        const meta = await sharp(buffer).metadata();
        expect(meta.exif).toBeUndefined();
      }
    });
  });

  Scenario('Images are never upscaled', ({ Given, When, Then, And }) => {
    Given('an uploaded image 600 pixels wide', async () => {
      const buffer = await smallJpeg(600, 450);
      await uploadImage(buffer);
    });

    When('the variants are generated', () => {
      // Handled by the upload itself.
    });

    Then('a 400px variant exists', () => {
      const publicKeys = [...harness.storage.publicObjects.keys()];
      expect(publicKeys.some((key) => key.endsWith('-400.webp'))).toBe(true);
    });

    And('no 800px or 1600px variant is produced', () => {
      const publicKeys = [...harness.storage.publicObjects.keys()];
      expect(publicKeys.some((key) => key.endsWith('-800.webp'))).toBe(false);
      expect(publicKeys.some((key) => key.endsWith('-1600.webp'))).toBe(false);
    });
  });

  Scenario('Originals are not publicly reachable', ({ Given, When, Then }) => {
    let originalKey: string;
    let response: request.Response;

    Given('a stored original image', async () => {
      const buffer = await smallJpeg(1000, 800);
      await uploadImage(buffer);
      originalKey = [...harness.storage.privateObjects.keys()][0]!;
      expect(harness.storage.publicObjects.has(originalKey)).toBe(false);
    });

    When('it is requested through the public media path', async () => {
      response = await request(harness.app.server).get(`/api/v1/media/${originalKey}`);
    });

    Then('it is not served', () => {
      expect(response.status).toBe(404);
    });
  });

  Scenario('Responses expose variants, not raw URLs', ({ Given, When, Then }) => {
    let warResponse: request.Response;

    Given('a contestant with images', async () => {
      await giveContestantAnImage(harness.db, harness.storage, contestantId);
    });

    When('any endpoint returns that contestant', async () => {
      warResponse = await request(harness.app.server).get(`/api/v1/wars/${warId}`);
    });

    Then('each image includes a variants array with width and url', () => {
      const [contestant] = warResponse.body.contestants;
      expect(contestant.media.length).toBeGreaterThan(0);
      for (const media of contestant.media) {
        expect(Array.isArray(media.variants)).toBe(true);
        expect(media.variants.length).toBeGreaterThan(0);
        for (const variant of media.variants) {
          expect(typeof variant.width).toBe('number');
          expect(typeof variant.url).toBe('string');
        }
      }
    });
  });

  Scenario('A contestant may hold up to ten images', ({ Given, When, Then }) => {
    let eleventhResponse: request.Response;

    Given('a contestant with ten images in a draft War', async () => {
      for (let i = 0; i < 10; i += 1) {
        const buffer = await smallJpeg(500, 400);
        const response = await uploadImage(buffer);
        expect(response.status).toBe(201);
      }
    });

    When('an eleventh image is uploaded', async () => {
      const buffer = await smallJpeg(500, 400);
      eleventhResponse = await uploadImage(buffer);
    });

    Then('the response status is 422', () => {
      expect(eleventhResponse.status).toBe(422);
    });
  });
});
