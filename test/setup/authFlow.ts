import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { OAuthProfile } from '../../src/auth/googleProvider.js';
import type { TestHarness } from './testApp.js';
import { extractCookieValue } from './httpHelpers.js';

export interface CompletedLogin {
  refreshTokenValue: string;
  callbackResponse: request.Response;
}

/**
 * Drives the real login → callback flow (spec §5.1) against the app, with
 * only the Google network hop stubbed. Returns the refresh-token cookie
 * value the callback set.
 */
export async function loginAndCallback(harness: TestHarness, profile: OAuthProfile): Promise<CompletedLogin> {
  await harness.app.ready();
  const agent = request(harness.app.server);

  const loginResponse = await agent.get('/api/v1/auth/google/login');
  const stateCookie = extractCookieValue(loginResponse.get('Set-Cookie'), 'oauth_state');
  if (!stateCookie) {
    throw new Error('login did not set an oauth_state cookie');
  }

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
