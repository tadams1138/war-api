import type { FastifyReply, FastifyRequest, FastifySchema } from 'fastify';
import { authenticatedVoterId, type AuthDependencies } from './authService.js';

declare module 'fastify' {
  interface FastifyRequest {
    voterId?: string;
  }
}

/**
 * A Fastify preHandler that requires a valid Bearer JWT (spec §5: "All
 * protected endpoints require Authorization: Bearer <jwt>"). Populates
 * `request.voterId` on success, or replies 401 without calling the handler.
 */
export function requireAuth(deps: AuthDependencies) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      request.voterId = await authenticatedVoterId(deps, request.headers.authorization);
    } catch {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  };
}

/**
 * Route options for an endpoint gated by the bearer JWT: the preHandler that
 * enforces it and the OpenAPI marker that documents it, produced together so
 * neither can be added without the other (spec §5, §11.2). Accepts the
 * route's own schema (if any) so adding request/response validation later
 * can never overwrite the security marker.
 */
export function bearerAuthRoute(deps: AuthDependencies, schema: FastifySchema = {}) {
  return { schema: { ...schema, security: [{ bearerAuth: [] }] }, preHandler: requireAuth(deps) };
}
