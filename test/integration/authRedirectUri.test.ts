import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildAppWithoutDb } from '../setup/testAppNoDb.js';

/**
 * Closes the observability gap that let the original PUBLIC_BASE_URL bug
 * (spec §9 of war-infra-spec.md) reach every deployment undetected: nothing
 * in the suite previously inspected the `redirect_uri` that actually reaches
 * Google, only `config.google.redirectUri` one layer above the wire. Runs
 * DB-free via `buildAppWithoutDb()` -- `beginLogin` never touches the
 * database, it only generates state and calls `google.authorizationUrl`.
 */
describe('GET /api/v1/auth/google/login redirect_uri', () => {
  it('redirects to an authorization URL carrying the configured PUBLIC_BASE_URL-derived redirect_uri', async () => {
    // Arrange
    const harness = await buildAppWithoutDb();
    await harness.app.ready();

    // Act
    const response = await request(harness.app.server).get('/api/v1/auth/google/login');

    // Assert
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location: string | undefined = response.headers.location;
    expect(location).toBeTruthy();
    const redirectUri = new URL(location!).searchParams.get('redirect_uri');
    expect(redirectUri).toBe('https://api.test/api/v1/auth/google/callback');
  });
});
