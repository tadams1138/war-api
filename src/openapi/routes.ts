import type { FastifyInstance } from 'fastify';

/**
 * Publishes the document @fastify/swagger generated from route schemas
 * (spec §11.2). Hidden from the document itself -- it is the contract's
 * delivery mechanism, not a described endpoint.
 */
export function registerOpenApiRoutes(app: FastifyInstance): void {
  app.get('/openapi.json', { schema: { hide: true } }, async (_request, reply) => {
    return reply.type('application/json').send(app.swagger());
  });
}
