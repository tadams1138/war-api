import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { hashRefreshToken } from '../../src/auth/refreshTokens.js';
import { findRefreshTokenByHash } from '../../src/auth/refreshTokensRepository.js';
import { extractCookieValue } from '../setup/httpHelpers.js';
import { loginAndCallback, postRefresh } from '../setup/authFlow.js';
import { makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

/**
 * Route-level security checks that no scenario in auth.feature exercises
 * directly (design review findings 6 and 14). Not bound to a .feature file —
 * these are implementation-owned regression tests of behaviour the spec
 * requires but the Gherkin does not pin at this granularity.
 */
describe('OAuth callback state validation (spec §5.1: "API validates state")', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  async function beginLogin() {
    const agent = request(harness.app.server);
    const loginResponse = await agent.get('/api/v1/auth/google/login');
    const stateCookie = extractCookieValue(loginResponse.get('Set-Cookie'), 'oauth_state');
    if (!stateCookie) {
      throw new Error('login did not set an oauth_state cookie');
    }
    // The redirect_uri this login leg actually advertised to Google, so
    // tests can assert it against the exchange leg's redirect_uri rather
    // than each independently against the same hardcoded literal.
    const location: string | undefined = loginResponse.headers.location;
    const advertisedRedirectUri = location ? new URL(location).searchParams.get('redirect_uri') : null;
    if (!advertisedRedirectUri) {
      throw new Error('login did not advertise a redirect_uri');
    }
    return { agent, stateCookie, advertisedRedirectUri };
  }

  it('rejects a callback that omits the state query parameter entirely', async () => {
    // Arrange
    const { agent, stateCookie } = await beginLogin();
    const code = randomUUID();
    harness.google.registerCode(code, { providerUserId: 'no-state@example.com', displayName: 'No State', avatarUrl: null });

    // Act
    const response = await agent.get('/api/v1/auth/google/callback').query({ code }).set('Cookie', `oauth_state=${stateCookie}`);

    // Assert
    expect(response.status).toBe(400);
    expect(extractCookieValue(response.get('Set-Cookie'), 'refresh_token')).toBeUndefined();
  });

  it('rejects a callback that arrives with no oauth_state cookie at all', async () => {
    // Arrange
    await harness.app.ready();
    const agent = request(harness.app.server);
    const code = randomUUID();
    harness.google.registerCode(code, { providerUserId: 'no-cookie@example.com', displayName: 'No Cookie', avatarUrl: null });

    // Act
    const response = await agent.get('/api/v1/auth/google/callback').query({ code, state: 'whatever-an-attacker-supplies' });

    // Assert
    expect(response.status).toBe(400);
    expect(extractCookieValue(response.get('Set-Cookie'), 'refresh_token')).toBeUndefined();
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    // Arrange
    const { agent } = await beginLogin();
    const code = randomUUID();
    harness.google.registerCode(code, { providerUserId: 'mismatch@example.com', displayName: 'Mismatch', avatarUrl: null });

    // Act
    const response = await agent
      .get('/api/v1/auth/google/callback')
      .query({ code, state: 'not-the-right-state' })
      .set('Cookie', 'oauth_state=the-real-state');

    // Assert
    expect(response.status).toBe(400);
  });

  it('accepts a callback whose state matches the cookie', async () => {
    // Arrange
    const { agent, stateCookie, advertisedRedirectUri } = await beginLogin();
    const code = randomUUID();
    harness.google.registerCode(code, { providerUserId: 'matches@example.com', displayName: 'Matches', avatarUrl: null });

    // Act
    const response = await agent
      .get('/api/v1/auth/google/callback')
      .query({ code, state: stateCookie })
      .set('Cookie', `oauth_state=${stateCookie}`);

    // Assert
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(extractCookieValue(response.get('Set-Cookie'), 'refresh_token')).toBeTruthy();
    // The redirect_uri Google sees in the exchange leg must equal the one it
    // saw in the authorization leg -- not just each independently matching
    // the same hardcoded literal -- since Google compares the two for exact
    // equality.
    const exchanged = harness.google.lastExchangeCallbackUrl!;
    expect(`${exchanged.origin}${exchanged.pathname}`).toBe(advertisedRedirectUri);
  });

  it('passes Google\'s real callback query parameters (e.g. iss) through to exchangeCode unchanged, not a synthetic reconstruction', async () => {
    // Arrange
    const { agent, stateCookie } = await beginLogin();
    const code = randomUUID();
    harness.google.registerCode(code, { providerUserId: 'iss-fidelity@example.com', displayName: 'Iss Fidelity', avatarUrl: null });

    // Act: Google's real callback carries more than just code/state (RFC 9207's
    // `iss`, plus `scope`/`authuser`/`prompt`) -- a naive code-only
    // reconstruction of the callback URL would silently drop all of these.
    const response = await agent
      .get('/api/v1/auth/google/callback')
      .query({
        code,
        state: stateCookie,
        iss: 'https://accounts.google.com',
        scope: 'openid email profile',
        authuser: '0',
        prompt: 'consent',
      })
      .set('Cookie', `oauth_state=${stateCookie}`);

    // Assert
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const callbackUrl = harness.google.lastExchangeCallbackUrl;
    expect(callbackUrl).toBeDefined();
    expect(callbackUrl?.searchParams.get('code')).toBe(code);
    expect(callbackUrl?.searchParams.get('iss')).toBe('https://accounts.google.com');
    expect(callbackUrl?.searchParams.get('scope')).toBe('openid email profile');
    expect(callbackUrl?.searchParams.get('authuser')).toBe('0');
    expect(callbackUrl?.searchParams.get('prompt')).toBe('consent');
  });
});

describe('DELETE /auth/session only revokes the caller\'s own refresh-token family', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  it('does not revoke another voter\'s refresh-token family when their cookie is presented', async () => {
    // Arrange: voter A logs in and gets a refresh-token family.
    const victim = await loginAndCallback(harness, {
      providerUserId: 'victim@example.com',
      displayName: 'Victim',
      avatarUrl: null,
    });
    const victimStored = await findRefreshTokenByHash(harness.db, hashRefreshToken(victim.refreshTokenValue));
    const victimFamilyId = victimStored!.familyId;

    // Voter B is authenticated (has their own valid JWT) but sends voter A's
    // refresh_token cookie along with the request — e.g. a cross-site
    // request that carries someone else's cookie.
    const attacker = await makeVoter(harness.db, 'attacker');
    const attackerJwt = await harness.jwtFor(attacker.id);

    // Act
    await request(harness.app.server)
      .delete('/api/v1/auth/session')
      .set('Authorization', `Bearer ${attackerJwt}`)
      .set('Cookie', `refresh_token=${victim.refreshTokenValue}`)
      .send();

    // Assert: the victim's family must remain unrevoked.
    const rows = await harness.db.selectFrom('refresh_tokens').selectAll().where('family_id', '=', victimFamilyId).execute();
    expect(rows.every((row) => row.revoked_at === null)).toBe(true);

    // The victim can still refresh normally afterwards.
    const refreshResponse = await postRefresh(harness, victim.refreshTokenValue);
    expect(refreshResponse.status).toBe(200);
  });
});
