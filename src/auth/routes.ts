import type { FastifyInstance } from 'fastify';
import { requiresBearerAuth } from '../openapi/security.js';
import { beginLogin, completeCallback, currentVoter, logout, refresh, type AuthDependencies } from './authService.js';
import { requireAuth } from './plugin.js';

const REFRESH_COOKIE = 'refresh_token';
const STATE_COOKIE = 'oauth_state';
const AUTH_COOKIE_PATH = '/api/v1/auth';

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
  app.get<{ Params: { provider: string } }>('/auth/:provider/login', async (request, reply) => {
    if (request.params.provider !== 'google') {
      return reply.code(404).send();
    }
    const { state, authorizationUrl } = await beginLogin(deps, config.googleRedirectUri);
    void reply.setCookie(STATE_COOKIE, state, { ...refreshCookieOptions(), maxAge: 600 });
    return reply.redirect(authorizationUrl);
  });

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string } }>(
    '/auth/:provider/callback',
    async (request, reply) => {
      if (request.params.provider !== 'google') {
        return reply.code(404).send();
      }
      const { code, state } = request.query;
      if (!code) {
        return reply.code(400).send({ error: 'missing code' });
      }
      const expectedState = request.cookies[STATE_COOKIE];
      if (!expectedState || !state || expectedState !== state) {
        void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });
        return reply.code(400).send({ error: 'state mismatch' });
      }

      const result = await completeCallback(deps, { code, redirectUri: config.googleRedirectUri });

      void reply.setCookie(REFRESH_COOKIE, result.refreshTokenValue, refreshCookieOptions());
      void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });

      // No token of any kind in the redirect (spec §5.1).
      return reply.redirect(`${config.uiOrigins[0]}/auth/callback`);
    },
  );

  app.post('/auth/refresh', async (request, reply) => {
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
  });

  app.delete('/auth/session', { schema: requiresBearerAuth, preHandler: requireAuth(deps) }, async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    await logout(deps, request.voterId!, presented);
    void reply.clearCookie(REFRESH_COOKIE, { path: AUTH_COOKIE_PATH });
    return reply.code(204).send();
  });

  app.get('/auth/me', { schema: requiresBearerAuth, preHandler: requireAuth(deps) }, async (request, reply) => {
    const voter = await currentVoter(deps, request.headers.authorization);
    return reply.send({
      voter: { id: voter.id, display_name: voter.displayName, avatar_url: voter.avatarUrl },
    });
  });
}
