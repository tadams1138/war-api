import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { castVoteForVoter } from '../votes/votesService.js';
import { errorResponseSchema } from '../openapi/schemas.js';
import { countMatchupsForWar, countVotesByVoterInWar } from './matchupsRepository.js';
import { nextMatchupForVoter } from './matchupsService.js';

const contestantViewSchema = {
  type: 'object',
  required: ['id', 'name', 'media'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    media: { type: 'array', items: { $ref: 'MediaItem#' } },
  },
};

const nextMatchupResponseSchema = {
  type: 'object',
  required: ['matchup', 'progress'],
  properties: {
    matchup: {
      type: 'object',
      required: ['id', 'left', 'right'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        // Written as its own copy of `left`'s schema rather than an
        // internal `$ref`, per spec §11.2.1 -- the two simply describe the
        // same shape.
        left: contestantViewSchema,
        right: contestantViewSchema,
      },
    },
    progress: {
      type: 'object',
      required: ['voted', 'total'],
      properties: {
        voted: { type: 'integer' },
        total: { type: 'integer' },
      },
    },
    prefetch: {
      type: 'object',
      required: ['matchup_id', 'media'],
      properties: {
        matchup_id: { type: 'string', format: 'uuid' },
        media: { type: 'array', items: { $ref: 'MediaItem#' } },
      },
    },
  },
};

export interface MatchupsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  publicBaseUrl: string;
}

export function registerMatchupsRoutes(app: FastifyInstance, deps: MatchupsRouteDeps): void {
  const { db, auth } = deps;

  app.get<{ Params: { id: string } }>(
    '/wars/:id/matchups/next',
    bearerAuthRoute(auth, { response: { 200: nextMatchupResponseSchema, 204: {} } }),
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
    bearerAuthRoute(auth),
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
    bearerAuthRoute(auth, {
      body: {
        type: 'object',
        required: ['winner_id'],
        properties: { winner_id: { type: 'string', format: 'uuid' } },
      },
      response: {
        201: { type: 'object', required: ['vote_id'], properties: { vote_id: { type: 'string', format: 'uuid' } } },
        200: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string', enum: ['already recorded'] } },
        },
        409: errorResponseSchema,
        422: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    }),
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
