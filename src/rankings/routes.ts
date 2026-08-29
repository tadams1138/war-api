import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { AuthDependencies } from '../auth/authService.js';
import { authenticatedVoterId } from '../auth/authService.js';
import { rankingsFor } from './rankingsService.js';

export interface RankingsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  publicBaseUrl: string;
}

export function registerRankingsRoutes(app: FastifyInstance, deps: RankingsRouteDeps): void {
  const { db } = deps;

  app.get<{ Params: { id: string } }>('/wars/:id/rankings', async (request, reply) => {
    let voterId: string | null = null;
    if (request.headers.authorization) {
      try {
        voterId = await authenticatedVoterId(deps.auth, request.headers.authorization);
      } catch {
        voterId = null;
      }
    }

    const outcome = await rankingsFor(db, request.params.id, voterId, new Date(), deps.publicBaseUrl);

    switch (outcome.kind) {
      case 'notFound':
        return reply.code(404).send({ error: 'not found' });
      case 'unauthorized':
        return reply.code(401).send({ error: 'unauthorized' });
      case 'ok': {
        const cacheControl = outcome.visibility === 'invite_only' ? 'private, max-age=30' : 'public, max-age=30';
        void reply.header('Cache-Control', cacheControl);
        return reply.send(outcome.view);
      }
    }
  });
}
