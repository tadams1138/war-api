import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { hashRefreshToken } from '../../src/auth/refreshTokens.js';
import { findRefreshTokenByHash } from '../../src/auth/refreshTokensRepository.js';
import { extractCookieValue } from '../setup/httpHelpers.js';
import { beginLogin, loginAndCallback, postRefresh } from '../setup/authFlow.js';
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

  it('rejects a callback that omits the state query parameter entirely', async () => {
    // Arrange
    const { agent, stateCookie } = await beginLogin(harness);
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
    const { agent } = await beginLogin(harness);
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
    const { agent, stateCookie, advertisedRedirectUri } = await beginLogin(harness);
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
    const { agent, stateCookie } = await beginLogin(harness);
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

/**
 * The `502` boundary of spec §4.1 #4 -- deliberately not a Gherkin scenario
 * (stage 1's design review reasoning: a wire-level robustness property, the
 * same category as the redirect-URI-pinning tests above). Both the
 * exchange-failure mapping and the downstream-failure exclusion are
 * asserted here so the boundary's scope is pinned exactly, not just its
 * existence.
 */
describe('Callback exchange failures (spec §4.1 #4)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  it('maps an openid-client/oauth4webapi validation error from the exchange to a 502, not a raw 500', async () => {
    // Arrange: a class-typed error carrying the library's own internal
    // error code as its message -- exactly the shape that reached three
    // separate users' browsers as an opaque 500 (spec §4.1 #4).
    class FakeOperationProcessingError extends Error {
      code = 'OAUTH_INVALID_RESPONSE';
      constructor() {
        super('OAUTH_INVALID_RESPONSE');
        this.name = 'OperationProcessingError';
      }
    }
    const { agent, stateCookie } = await beginLogin(harness);
    const code = randomUUID();
    harness.google.failNextExchange(new FakeOperationProcessingError());

    // Act
    const response = await agent.get('/api/v1/auth/google/callback').query({ code, state: stateCookie }).set('Cookie', `oauth_state=${stateCookie}`);

    // Assert
    expect(response.status).toBe(502);
    expect((response.body as { error?: string }).error).toBe('authentication with Google failed');
    expect((response.body as { error?: string }).error).not.toContain('OAUTH_INVALID_RESPONSE');
  });

  it('maps a network failure reaching Google to a 502', async () => {
    // Arrange
    const { agent, stateCookie } = await beginLogin(harness);
    const code = randomUUID();
    harness.google.failNextExchange(new Error('getaddrinfo ENOTFOUND accounts.google.com'));

    // Act
    const response = await agent.get('/api/v1/auth/google/callback').query({ code, state: stateCookie }).set('Cookie', `oauth_state=${stateCookie}`);

    // Assert
    expect(response.status).toBe(502);
    expect(extractCookieValue(response.get('Set-Cookie'), 'refresh_token')).toBeUndefined();
  });

  it('leaves a failure downstream of a successful exchange (the voter upsert) as an unmapped 500, not 502', async () => {
    // Arrange: a provider_user_id exceeding voters.provider_user_id's
    // VARCHAR(256) forces the insert itself to fail -- a real defect in
    // this API's own logic, not the provider's response being unusable.
    const { agent, stateCookie } = await beginLogin(harness);
    const code = randomUUID();
    harness.google.registerCode(code, {
      providerUserId: 'x'.repeat(300),
      displayName: 'Downstream Failure',
      avatarUrl: null,
    });

    // Act
    const response = await agent.get('/api/v1/auth/google/callback').query({ code, state: stateCookie }).set('Cookie', `oauth_state=${stateCookie}`);

    // Assert: a 500 alone doesn't prove it happened *downstream* of a
    // successful exchange -- pin that the exchange itself actually ran
    // (design review finding 5), not just that some 500 occurred.
    expect(response.status).toBe(500);
    expect(harness.google.lastExchangeCallbackUrl).toBeDefined();
  });
});

/**
 * The `error`-first precedence and independence spec §4.1 #1 requires --
 * checked before, and regardless of, the state-cookie check (design review
 * finding 1: the acceptance scenario's one existing test happens to send a
 * matching cookie, which would pass even a subtly wrong
 * `if (error && expectedState)`).
 */
describe('OAuth error parameter precedence and independence (spec §4.1 #1)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  it('is honored even when a state mismatch would otherwise fire, and never reaches the exchange', async () => {
    // Arrange: a real, valid oauth_state cookie is present, but the query's
    // own `state` is deliberately wrong -- if `error` were checked only
    // after (or gated on) state matching, this would come back 400 "state
    // mismatch" instead.
    const { agent, stateCookie } = await beginLogin(harness);
    const code = randomUUID();

    // Act
    const response = await agent
      .get('/api/v1/auth/google/callback')
      .query({ error: 'access_denied', code, state: 'not-the-real-state' })
      .set('Cookie', `oauth_state=${stateCookie}`);

    // Assert
    expect(response.status).toBe(403);
    expect((response.body as { reason?: string }).reason).toBe('access_denied');
    expect(harness.google.lastExchangeCallbackUrl).toBeUndefined();
  });

  it('is honored with no oauth_state cookie present at all', async () => {
    // Arrange: no login leg at all, so no cookie is ever set.
    await harness.app.ready();
    const agent = request(harness.app.server);

    // Act
    const response = await agent.get('/api/v1/auth/google/callback').query({ error: 'access_denied' });

    // Assert
    expect(response.status).toBe(403);
    expect((response.body as { reason?: string }).reason).toBe('access_denied');
  });

  it('treats an empty error parameter as absent and falls through to the missing-code check', async () => {
    // Arrange
    const { agent, stateCookie } = await beginLogin(harness);

    // Act
    const response = await agent.get('/api/v1/auth/google/callback').query({ error: '' }).set('Cookie', `oauth_state=${stateCookie}`);

    // Assert
    expect(response.status).toBe(400);
    expect((response.body as { error?: string }).error).toBe('missing code');
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
