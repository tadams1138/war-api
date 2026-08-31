import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerSharedSchemas } from '../../src/openapi/schemas.js';
import { mediaItemSchema, type MediaItemView } from '../../src/contestants/mediaPresenter.js';
import { resolvedAttributeSchema, type ResolvedAttribute } from '../../src/contestants/schemaValidation.js';
import { contestantDetailSchema, type ContestantDetailView } from '../../src/contestants/contestantPresenter.js';
import { warSummarySchema, type WarSummaryView } from '../../src/wars/warPresenter.js';
import { nextMatchupResponseSchema, type NextMatchupView } from '../../src/matchups/matchupsService.js';

/**
 * Pins every response body schema (spec §11.2.1) to full byte-for-byte
 * agreement with the presenter output it describes. `fast-json-stringify`
 * silently drops any property a schema does not list -- an
 * `objectContaining`/subset assertion would not catch that in either
 * direction, which is exactly the gap `openapi.steps.ts` leaves (it only
 * asserts on the generated *document*, never on a real serialized body).
 * Fixtures are typed against each presenter's own view interface, so a
 * field added to (or removed from) an interface breaks this file at
 * compile time until the fixture -- and by extension the schema under
 * test -- catches up.
 */
function buildProbeApp(schema: object, fixture: unknown) {
  const app = Fastify();
  registerSharedSchemas(app);
  app.get('/probe', { schema: { response: { 200: schema } } }, async () => fixture);
  return app;
}

describe('response body schemas serialize every field (spec §11.2.1)', () => {
  it('MediaItem: every field, non-null aspect_ratio', async () => {
    // Arrange
    const fixture: MediaItemView = {
      kind: 'image',
      id: 'a5b1e2c4-1111-4a11-8a11-000000000001',
      display_order: 2,
      aspect_ratio: 1.5,
      variants: [{ width: 400, url: 'https://cdn.example.com/x-400.webp' }],
    };
    const app = buildProbeApp(mediaItemSchema, fixture);

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.body).toBe(JSON.stringify(fixture));
  });

  it('MediaItem: null aspect_ratio and empty variants survive', async () => {
    // Arrange
    const fixture: MediaItemView = {
      kind: 'image',
      id: 'a5b1e2c4-1111-4a11-8a11-000000000002',
      display_order: 0,
      aspect_ratio: null,
      variants: [],
    };
    const app = buildProbeApp(mediaItemSchema, fixture);

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.body).toBe(JSON.stringify(fixture));
  });

  it('ResolvedAttribute: every field intact', async () => {
    // Arrange
    const fixture: ResolvedAttribute = { key: 'height', label: 'Height', type: 'number', value: 72 };
    const app = buildProbeApp(resolvedAttributeSchema, fixture);

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.body).toBe(JSON.stringify(fixture));
  });

  it('WarSummary: every field, non-null category/ends_at', async () => {
    // Arrange
    const fixture: WarSummaryView = {
      id: 'a5b1e2c4-2222-4a11-8a11-000000000001',
      title: 'Best Pageant',
      category: 'pageant',
      status: 'active',
      visibility: 'public',
      media_mode: 'image',
      contestant_schema: [{ key: 'height', label: 'Height', type: 'number' }],
      ends_at: '2026-01-01T00:00:00.000Z',
      contestant_count: 4,
    };
    const app = buildProbeApp(warSummarySchema, fixture);

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.body).toBe(JSON.stringify(fixture));
  });

  it('WarSummary: null category/ends_at and empty contestant_schema survive', async () => {
    // Arrange
    const fixture: WarSummaryView = {
      id: 'a5b1e2c4-2222-4a11-8a11-000000000002',
      title: 'Best Pageant',
      category: null,
      status: 'draft',
      visibility: 'invite_only',
      media_mode: 'image',
      contestant_schema: [],
      ends_at: null,
      contestant_count: 0,
    };
    const app = buildProbeApp(warSummarySchema, fixture);

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.body).toBe(JSON.stringify(fixture));
  });

  it('ContestantDetail: every field, non-null bio, nested attributes/media', async () => {
    // Arrange
    const fixture: ContestantDetailView = {
      id: 'a5b1e2c4-3333-4a11-8a11-000000000001',
      name: 'Contestant A',
      bio: 'A short bio',
      attributes: [{ key: 'height', label: 'Height', type: 'number', value: 72 }],
      media: [
        {
          kind: 'image',
          id: 'a5b1e2c4-3333-4a11-8a11-000000000002',
          display_order: 0,
          aspect_ratio: 1.5,
          variants: [{ width: 400, url: 'https://cdn.example.com/x-400.webp' }],
        },
      ],
      win_count: 3,
      appearance_count: 5,
    };
    const app = buildProbeApp(contestantDetailSchema, fixture);

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.body).toBe(JSON.stringify(fixture));
  });

  it('ContestantDetail: null bio and empty attributes/media survive', async () => {
    // Arrange
    const fixture: ContestantDetailView = {
      id: 'a5b1e2c4-3333-4a11-8a11-000000000003',
      name: 'Contestant B',
      bio: null,
      attributes: [],
      media: [],
      win_count: 0,
      appearance_count: 0,
    };
    const app = buildProbeApp(contestantDetailSchema, fixture);

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.body).toBe(JSON.stringify(fixture));
  });

  it('NextMatchupView: prefetch present', async () => {
    // Arrange
    const contestant = (suffix: string) => ({
      id: `a5b1e2c4-4444-4a11-8a11-00000000000${suffix}`,
      name: `Contestant ${suffix}`,
      media: [],
    });
    const fixture: NextMatchupView = {
      matchup: { id: 'a5b1e2c4-4444-4a11-8a11-000000000009', left: contestant('1'), right: contestant('2') },
      progress: { voted: 2, total: 10 },
      prefetch: { matchup_id: 'a5b1e2c4-4444-4a11-8a11-000000000008', media: [] },
    };
    const app = buildProbeApp(nextMatchupResponseSchema, fixture);

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.body).toBe(JSON.stringify(fixture));
  });

  it('NextMatchupView: prefetch absent (every pair already voted)', async () => {
    // Arrange
    const contestant = (suffix: string) => ({
      id: `a5b1e2c4-5555-4a11-8a11-00000000000${suffix}`,
      name: `Contestant ${suffix}`,
      media: [],
    });
    const fixture: NextMatchupView = {
      matchup: { id: 'a5b1e2c4-5555-4a11-8a11-000000000009', left: contestant('1'), right: contestant('2') },
      progress: { voted: 10, total: 10 },
    };
    const app = buildProbeApp(nextMatchupResponseSchema, fixture);

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.body).toBe(JSON.stringify(fixture));
  });
});

describe('empty-body statuses stay empty (spec §11.2.1)', () => {
  it.each([
    ['DELETE /auth/session', 204],
    ['POST /wars/:id/join', 204],
    ['GET /wars/:id/matchups/next', 204],
    ['GET /auth/:provider/login', 404],
  ])('%s %i serializes with a zero-length body', async (_route, status) => {
    // Arrange
    const app = Fastify();
    app.get('/probe', { schema: { response: { [status]: {} } } }, async (_request, reply) => {
      return reply.code(status).send();
    });

    // Act
    const response = await app.inject({ method: 'GET', url: '/probe' });

    // Assert
    expect(response.statusCode).toBe(status);
    expect(response.body).toBe('');
  });
});
