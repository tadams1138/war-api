import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { OAuthProfile } from '../../src/auth/googleProvider.js';
import type { TestHarness } from './testApp.js';
import { extractCookieValue } from './httpHelpers.js';

export interface CompletedLogin {
  refreshTokenValue: string;
  callbackResponse: request.Response;
}

export interface BegunLogin {
  agent: ReturnType<typeof request>;
  stateCookie: string;
  /** The `redirect_uri` this login leg actually advertised to Google (design review finding 7). */
  advertisedRedirectUri: string;
}

/**
 * Drives the login leg only (spec §5.1's step 1) and stops before the
 * callback -- the shared setup every "begin a login, then do something
 * callback-shaped" test needs (design review finding 7: this used to be
 * three near-identical local copies).
 */
export async function beginLogin(harness: TestHarness): Promise<BegunLogin> {
  await harness.app.ready();
  const agent = request(harness.app.server);

  const loginResponse = await agent.get('/api/v1/auth/google/login');
  const stateCookie = extractCookieValue(loginResponse.get('Set-Cookie'), 'oauth_state');
  if (!stateCookie) {
    throw new Error('login did not set an oauth_state cookie');
  }

  const location: string | undefined = loginResponse.headers.location;
  const advertisedRedirectUri = location ? new URL(location).searchParams.get('redirect_uri') : null;
  if (!advertisedRedirectUri) {
    throw new Error('login did not advertise a redirect_uri');
  }

  return { agent, stateCookie, advertisedRedirectUri };
}

/**
 * Drives the real login → callback flow (spec §5.1) against the app, with
 * only the Google network hop stubbed. Returns the refresh-token cookie
 * value the callback set.
 */
export async function loginAndCallback(harness: TestHarness, profile: OAuthProfile): Promise<CompletedLogin> {
  const { agent, stateCookie } = await beginLogin(harness);

  const code = randomUUID();
  harness.google.registerCode(code, profile);

  const callbackResponse = await agent
    .get('/api/v1/auth/google/callback')
    .query({ code, state: stateCookie })
    .set('Cookie', `oauth_state=${stateCookie}`);

  const refreshTokenValue = extractCookieValue(callbackResponse.get('Set-Cookie'), 'refresh_token');
  if (!refreshTokenValue) {
    throw new Error(`callback did not set a refresh_token cookie (status ${callbackResponse.status})`);
  }

  return { refreshTokenValue, callbackResponse };
}

export async function postRefresh(harness: TestHarness, refreshTokenValue: string, origin = 'https://app.test') {
  await harness.app.ready();
  return request(harness.app.server)
    .post('/api/v1/auth/refresh')
    .set('Cookie', `refresh_token=${refreshTokenValue}`)
    .set('Origin', origin)
    .send();
}
