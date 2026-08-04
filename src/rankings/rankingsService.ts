import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { listMediaByContestants } from '../contestants/contestantMediaRepository.js';
import { presentMedia, type MediaItemView } from '../contestants/mediaPresenter.js';
import { effectiveStatus } from '../wars/effectiveStatus.js';
import { findWarById, isMember } from '../wars/warsRepository.js';
import { rankContestants } from './scoring.js';

export interface RankingEntry {
  rank: number | null;
  contestant: { id: string; name: string; media: MediaItemView[] };
  wins: number;
  appearances: number;
}

export interface RankingsView {
  war_id: string;
  status: string;
  updated_at: string;
  rankings: RankingEntry[];
}

export type RankingsOutcome =
  | { kind: 'ok'; view: RankingsView; visibility: string }
  | { kind: 'notFound' }
  | { kind: 'unauthorized' };

/**
 * Assembles a War's rankings response (spec §9): the invite-only membership
 * check, scoring, and view assembly all live here rather than in the route
 * handler, matching the routes → service → repository → presenter layering
 * every other domain in this slice follows (design review finding 8).
 * `viewerId` is `null` for an anonymous request — JWT extraction stays a
 * route concern.
 */
export async function rankingsFor(
  db: Kysely<Database>,
  warId: string,
  viewerId: string | null,
  now: Date,
  publicBaseUrl: string,
): Promise<RankingsOutcome> {
  const war = await findWarById(db, warId);
  if (!war) {
    return { kind: 'notFound' };
  }

  if (war.visibility === 'invite_only') {
    if (viewerId === null) {
      return { kind: 'unauthorized' };
    }
    if (war.creatorId !== viewerId && !(await isMember(db, war.id, viewerId))) {
      return { kind: 'unauthorized' };
    }
  }

  const contestants = await listContestantsByWar(db, war.id);
  const ranked = rankContestants(
    contestants.map((c) => ({ id: c.id, name: c.name, winCount: c.winCount, appearanceCount: c.appearanceCount })),
  );

  const mediaByContestant = await listMediaByContestants(
    db,
    ranked.map((entry) => entry.contestant.id),
  );

  const rankings: RankingEntry[] = ranked.map((entry) => ({
    rank: entry.rank,
    contestant: {
      id: entry.contestant.id,
      name: entry.contestant.name,
      media: presentMedia(mediaByContestant.get(entry.contestant.id) ?? [], publicBaseUrl),
    },
    wins: entry.contestant.winCount,
    appearances: entry.contestant.appearanceCount,
  }));

  return {
    kind: 'ok',
    visibility: war.visibility,
    view: {
      war_id: war.id,
      status: effectiveStatus(war, now),
      updated_at: now.toISOString(),
      rankings,
    },
  };
}
