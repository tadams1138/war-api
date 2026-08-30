import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { requireAuth } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { requiresBearerAuth } from '../openapi/security.js';
import { castVoteForVoter } from '../votes/votesService.js';
import { countMatchupsForWar, countVotesByVoterInWar } from './matchupsRepository.js';
import { nextMatchupForVoter } from './matchupsService.js';

export interface MatchupsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  publicBaseUrl: string;
}

export function registerMatchupsRoutes(app: FastifyInstance, deps: MatchupsRouteDeps): void {
  const { db, auth } = deps;

  app.get<{ Params: { id: string } }>(
    '/wars/:id/matchups/next',
    { schema: requiresBearerAuth, preHandler: requireAuth(auth) },
    async (request, reply) => {
      const view = await nextMatchupForVoter(db, request.params.id, request.voterId!, deps.publicBaseUrl);
      if (!view) {
        return reply.code(204).send();
      }
      return reply.send(view);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/wars/:id/my-progress',
    { schema: requiresBearerAuth, preHandler: requireAuth(auth) },
    async (request, reply) => {
      const [voted, total] = await Promise.all([
        countVotesByVoterInWar(db, request.params.id, request.voterId!),
        countMatchupsForWar(db, request.params.id),
      ]);
      return reply.send({ voted, total });
    },
  );

  app.post<{ Params: { id: string; mId: string }; Body: { winner_id: string } }>(
    '/wars/:id/matchups/:mId/vote',
    { schema: requiresBearerAuth, preHandler: requireAuth(auth) },
    async (request, reply) => {
      const outcome = await castVoteForVoter(db, {
        warId: request.params.id,
        matchupId: request.params.mId,
        voterId: request.voterId!,
        winnerId: request.body.winner_id,
      });

      switch (outcome.kind) {
        case 'created':
          return reply.code(201).send({ vote_id: outcome.vote.id });
        case 'retried':
          return reply.code(200).send({ status: 'already recorded' });
        case 'conflict':
          return reply.code(409).send({ error: 'vote already cast for a different winner' });
        case 'invalidWinner':
          return reply.code(422).send({ error: 'winner_id must be a contestant in this matchup' });
        case 'warNotActive':
          return reply.code(403).send({ error: 'War is not active' });
        case 'notJoined':
          return reply.code(403).send({ error: 'voter has not joined this War' });
        case 'notFound':
          return reply.code(404).send({ error: 'not found' });
        default:
          return reply.code(500).send({ error: 'internal error' });
      }
    },
  );
}
