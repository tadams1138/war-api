import type { FastifyReply, FastifyRequest } from 'fastify';
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
