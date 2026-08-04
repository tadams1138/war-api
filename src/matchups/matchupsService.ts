import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { findContestantsByIds } from '../contestants/contestantsRepository.js';
import { listMediaByContestants } from '../contestants/contestantMediaRepository.js';
import { presentMedia, type MediaItemView } from '../contestants/mediaPresenter.js';
import type { ContestantMedia } from '../contestants/contestantMediaRepository.js';
import type { Contestant } from '../contestants/contestantsRepository.js';
import { countMatchupsForWar, countVotesByVoterInWar, findUnvotedMatchupsForVoter } from './matchupsRepository.js';
import { isLeftSide } from './stableHash.js';

export interface ContestantView {
  id: string;
  name: string;
  media: MediaItemView[];
}

export interface NextMatchupView {
  matchup: { id: string; left: ContestantView; right: ContestantView };
  progress: { voted: number; total: number };
  prefetch?: { matchup_id: string; media: MediaItemView[] };
}

function contestantView(
  contestantId: string,
  contestantsById: Map<string, Contestant>,
  mediaByContestant: Map<string, ContestantMedia[]>,
  publicBaseUrl: string,
): ContestantView {
  const contestant = contestantsById.get(contestantId);
  if (!contestant) {
    throw new Error(`contestant ${contestantId} not found`);
  }
  return {
    id: contestant.id,
    name: contestant.name,
    media: presentMedia(mediaByContestant.get(contestantId) ?? [], publicBaseUrl),
  };
}

/**
 * Builds the `/matchups/next` response: the voter's next matchup (side
 * decided by the API, spec §8.4), progress, and an advisory prefetch block
 * naming the following matchup's media. Fetches both contestants and all
 * four media sets (current pair plus prefetch pair) with two batched
 * queries rather than one per contestant (design review finding 9) — this
 * is the endpoint spec §8.4's 500ms prefetch budget makes most
 * latency-sensitive.
 */
export async function nextMatchupForVoter(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  publicBaseUrl: string,
): Promise<NextMatchupView | null> {
  const [candidates, total, voted] = await Promise.all([
    findUnvotedMatchupsForVoter(db, warId, voterId, 2),
    countMatchupsForWar(db, warId),
    countVotesByVoterInWar(db, warId, voterId),
  ]);

  const matchup = candidates[0];
  if (!matchup) {
    return null;
  }

  const upcoming = candidates[1];
  const contestantIds = [matchup.contestantAId, matchup.contestantBId];
  if (upcoming) {
    contestantIds.push(upcoming.contestantAId, upcoming.contestantBId);
  }

  const [contestantsById, mediaByContestant] = await Promise.all([
    findContestantsByIds(db, contestantIds),
    listMediaByContestants(db, contestantIds),
  ]);

  const left = isLeftSide(matchup.id, voterId) ? matchup.contestantAId : matchup.contestantBId;
  const right = left === matchup.contestantAId ? matchup.contestantBId : matchup.contestantAId;

  const result: NextMatchupView = {
    matchup: {
      id: matchup.id,
      left: contestantView(left, contestantsById, mediaByContestant, publicBaseUrl),
      right: contestantView(right, contestantsById, mediaByContestant, publicBaseUrl),
    },
    progress: { voted, total },
  };

  if (upcoming) {
    result.prefetch = {
      matchup_id: upcoming.id,
      media: [
        ...presentMedia(mediaByContestant.get(upcoming.contestantAId) ?? [], publicBaseUrl),
        ...presentMedia(mediaByContestant.get(upcoming.contestantBId) ?? [], publicBaseUrl),
      ],
    };
  }

  return result;
}
