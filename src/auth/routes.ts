import type { FastifyInstance } from 'fastify';
import { beginLogin, completeCallback, currentVoter, exchangeGoogleCode, logout, refresh, type AuthDependencies } from './authService.js';
import { bearerAuthRoute } from './plugin.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';

const REFRESH_COOKIE = 'refresh_token';
const STATE_COOKIE = 'oauth_state';
const AUTH_COOKIE_PATH = '/api/v1/auth';

/** The `{ error, reason }` body check #1 of §4.1's "Callback failure responses" table returns. */
export interface OAuthDeclinedView {
  error: string;
  reason: string;
}

/**
 * Unlike `voteForbiddenResponseSchema` (matchups/routes.ts), `reason` here
 * is not a closed `enum`: spec §4.1 #1 passes the OAuth provider's `error`
 * parameter through verbatim, since the set of codes a provider can send is
 * not this API's vocabulary to close off.
 */
export const oauthDeclinedResponseSchema = {
  type: 'object',
  required: ['error', 'reason'],
  properties: {
    error: { type: 'string' },
    reason: { type: 'string' },
  },
};

export interface AuthRouteConfig {
  uiOrigins: string[];
  googleRedirectUri: string;
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: AUTH_COOKIE_PATH,
  };
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDependencies, config: AuthRouteConfig): void {
  app.get<{ Params: { provider: string } }>(
    '/auth/:provider/login',
    // Success is a bare 302 redirect (no body); the only bodied outcome is
    // an unsupported provider's 404 (spec §11.2.1 discrepancy 2: "confirmed
    // redirect-or-empty-404 only -- no body to schema on that route").
    { schema: { response: { 404: {} } } },
    async (request, reply) => {
      if (request.params.provider !== 'google') {
        return reply.code(404).send();
      }
      const { state, authorizationUrl } = await beginLogin(deps, config.googleRedirectUri);
      void reply.setCookie(STATE_COOKIE, state, { ...refreshCookieOptions(), maxAge: 600 });
      return reply.redirect(authorizationUrl);
    },
  );

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/:provider/callback',
    // Success is a redirect with no body (spec §11.2.1 discrepancy 1: the
    // stale §7.1 200-body example is superseded by §4.1's cookie flow).
    // The four failure responses are spec §4.1's "Callback failure
    // responses" table, checked in that exact order below.
    { schema: { response: { 400: errorResponseSchema, 403: oauthDeclinedResponseSchema, 502: errorResponseSchema } } },
    async (request, reply) => {
      if (request.params.provider !== 'google') {
        return reply.code(404).send();
      }
      const { code, state, error } = request.query;

      // #1 -- the provider declined to grant what was asked (spec §4.1 #1).
      // Checked first and independent of the state cookie: no code is ever
      // exchanged on this branch, so there is nothing for state validation
      // to protect. An empty `error` (`?error=`) is treated as absent.
      if (error) {
        const body: OAuthDeclinedView = { error: 'authorization declined', reason: error };
        return reply.code(403).send(body);
      }

      if (!code) {
        return reply.code(400).send({ error: 'missing code' });
      }
      const expectedState = request.cookies[STATE_COOKIE];
      if (!expectedState || !state || expectedState !== state) {
        void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });
        return reply.code(400).send({ error: 'state mismatch' });
      }

      // Google's real callback query, verbatim -- RFC 9207's `iss` and the rest,
      // which the token-exchange library validates straight off this URL. The
      // origin and path come from the one redirect_uri this app ever advertises
      // (the same config value the login leg sends above), so the two legs
      // cannot diverge and nothing off the request line can steer them.
      const callbackUrl = new URL(config.googleRedirectUri);
      callbackUrl.search = new URL(request.url, config.googleRedirectUri).search;

      // #4 -- the error boundary is scoped to the exchange call alone (spec
      // §4.1 #4). Whatever completeCallback does afterwards (voter upsert,
      // refresh-token issuance) runs outside this try/catch, so a failure
      // there keeps surfacing as an unmapped 500, exactly as before.
      let profile;
      try {
        profile = await exchangeGoogleCode(deps, { callbackUrl });
      } catch {
        return reply.code(502).send({ error: 'authentication with Google failed' });
      }
      const result = await completeCallback(deps, profile);

      void reply.setCookie(REFRESH_COOKIE, result.refreshTokenValue, refreshCookieOptions());
      void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });

      // No token of any kind in the redirect (spec §5.1).
      return reply.redirect(`${config.uiOrigins[0]}/auth/callback`);
    },
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        response: {
          200: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const origin = request.headers.origin;
      if (!origin || !config.uiOrigins.includes(origin)) {
        return reply.code(403).send({ error: 'origin not allowed' });
      }

      const presented = request.cookies[REFRESH_COOKIE];
      if (!presented) {
        return reply.code(401).send({ error: 'no refresh token' });
      }

      const result = await refresh(deps, presented);
      if (result.kind !== 'refreshed') {
        void reply.clearCookie(REFRESH_COOKIE, { path: AUTH_COOKIE_PATH });
        return reply.code(401).send({ error: 'invalid refresh token' });
      }

      void reply.setCookie(REFRESH_COOKIE, result.refreshTokenValue, refreshCookieOptions());
      return reply.send({ token: result.jwt });
    },
  );

  app.delete(
    '/auth/session',
    bearerAuthRoute(deps, { response: { 204: {} } }),
    async (request, reply) => {
      const presented = request.cookies[REFRESH_COOKIE];
      await logout(deps, request.voterId!, presented);
      void reply.clearCookie(REFRESH_COOKIE, { path: AUTH_COOKIE_PATH });
      return reply.code(204).send();
    },
  );

  app.get(
    '/auth/me',
    bearerAuthRoute(deps, {
      response: {
        200: {
          type: 'object',
          required: ['voter'],
          properties: {
            voter: {
              type: 'object',
              required: ['id', 'display_name', 'avatar_url'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                display_name: { type: ['string', 'null'] },
                avatar_url: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    }),
    async (request, reply) => {
      const voter = await currentVoter(deps, request.headers.authorization);
      return reply.send({
        voter: { id: voter.id, display_name: voter.displayName, avatar_url: voter.avatarUrl },
      });
    },
  );
}
