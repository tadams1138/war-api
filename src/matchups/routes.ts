import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { castVoteForVoter } from '../votes/votesService.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { countMatchupsForWar, countVotesByVoterInWar } from './matchupsRepository.js';
import { nextMatchupForVoter, nextMatchupResponseSchema } from './matchupsService.js';

/**
 * Fastify's own request-validation error envelope (ajv, via
 * `@fastify/ajv-compiler`) -- distinct from this route's own `{ error }`
 * shape used for its other 4xx responses. Produced for a malformed body
 * (missing or non-UUID `winner_id`) before the handler ever runs, so
 * `castVoteForVoter`'s own `invalidWinner` (422) is never reached in that
 * case. Verified against Fastify 5.11.0; transcribed into spec §11.2.1.
 */
const validationErrorResponseSchema = {
  type: 'object',
  required: ['statusCode', 'code', 'error', 'message'],
  properties: {
    statusCode: { type: 'integer' },
    code: { type: 'string' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
};

/**
 * The single source of truth for this route's `403` `reason` values --
 * both the schema's `enum` and `VoteForbiddenView`'s type derive from this
 * array, so an unlisted reason or an omitted `reason` at a send site is a
 * compile error rather than a value `fast-json-stringify` would otherwise
 * pass straight through (it does not enforce `enum` on output).
 */
const voteForbiddenReasons = ['war_not_active', 'not_joined'] as const;
export type VoteForbiddenReason = (typeof voteForbiddenReasons)[number];
export interface VoteForbiddenView {
  error: string;
  reason: VoteForbiddenReason;
}

/**
 * This route's `403` -- unlike its other `{ error }`-only 4xx responses --
 * also carries a `reason` discriminator so a client can branch on which of
 * the two forbidden causes occurred without matching `error`'s message text
 * (spec §11.2.1 addendum, 2026-08-30). Scoped to this route only: `POST
 * /wars/:id/join`'s `403` has a single cause and stays on the shared
 * `errorResponseSchema`.
 */
export const voteForbiddenResponseSchema = {
  type: 'object',
  required: ['error', 'reason'],
  properties: {
    error: { type: 'string' },
    reason: { type: 'string', enum: [...voteForbiddenReasons] },
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
        400: validationErrorResponseSchema,
        409: errorResponseSchema,
        422: errorResponseSchema,
        403: voteForbiddenResponseSchema,
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
        case 'warNotActive': {
          const body: VoteForbiddenView = { error: 'War is not active', reason: 'war_not_active' };
          return reply.code(403).send(body);
        }
        case 'notJoined': {
          const body: VoteForbiddenView = { error: 'voter has not joined this War', reason: 'not_joined' };
          return reply.code(403).send(body);
        }
        case 'notFound':
          return reply.code(404).send({ error: 'not found' });
        default:
          return reply.code(500).send({ error: 'internal error' });
      }
    },
  );
}
