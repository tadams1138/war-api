import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { AuthDependencies } from '../auth/authService.js';
import { authenticatedVoterId } from '../auth/authService.js';
import { listMediaByContestant } from '../contestants/contestantMediaRepository.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { presentMedia } from '../contestants/mediaPresenter.js';
import { effectiveStatus } from '../wars/effectiveStatus.js';
import { findWarById, isMember } from '../wars/warsRepository.js';
import { rankContestants } from './scoring.js';

export interface RankingsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  publicBaseUrl: string;
}

export function registerRankingsRoutes(app: FastifyInstance, deps: RankingsRouteDeps): void {
  const { db } = deps;

  app.get<{ Params: { id: string } }>('/wars/:id/rankings', async (request, reply) => {
    const war = await findWarById(db, request.params.id);
    if (!war) {
      return reply.code(404).send({ error: 'not found' });
    }

    if (war.visibility === 'invite_only') {
      let voterId: string;
      try {
        voterId = await authenticatedVoterId(deps.auth, request.headers.authorization);
      } catch {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      if (war.creatorId !== voterId && !(await isMember(db, war.id, voterId))) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      void reply.header('Cache-Control', 'private, max-age=30');
    } else {
      void reply.header('Cache-Control', 'public, max-age=30');
    }

    const contestants = await listContestantsByWar(db, war.id);
    const ranked = rankContestants(
      contestants.map((c) => ({ id: c.id, name: c.name, winCount: c.winCount, appearanceCount: c.appearanceCount })),
    );

    const rankings = await Promise.all(
      ranked.map(async (entry) => {
        const media = await listMediaByContestant(db, entry.contestant.id);
        return {
          rank: entry.rank,
          contestant: {
            id: entry.contestant.id,
            name: entry.contestant.name,
            media: presentMedia(media, deps.publicBaseUrl),
          },
          wins: entry.contestant.winCount,
          appearances: entry.contestant.appearanceCount,
        };
      }),
    );

    return reply.send({
      war_id: war.id,
      status: effectiveStatus(war, new Date()),
      updated_at: new Date().toISOString(),
      rankings,
    });
  });
}
