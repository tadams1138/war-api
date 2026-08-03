import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { findContestantById } from '../contestants/contestantsRepository.js';
import { listMediaByContestant } from '../contestants/contestantMediaRepository.js';
import { presentMedia, type MediaItemView } from '../contestants/mediaPresenter.js';
import {
  countMatchupsForWar,
  countVotesByVoterInWar,
  findUnvotedMatchupsForVoter,
  type Matchup,
} from './matchupsRepository.js';
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

async function contestantView(db: Kysely<Database>, contestantId: string, publicBaseUrl: string): Promise<ContestantView> {
  const contestant = await findContestantById(db, contestantId);
  if (!contestant) {
    throw new Error(`contestant ${contestantId} not found`);
  }
  const media = await listMediaByContestant(db, contestantId);
  return { id: contestant.id, name: contestant.name, media: presentMedia(media, publicBaseUrl) };
}

async function matchupMedia(db: Kysely<Database>, matchup: Matchup, publicBaseUrl: string): Promise<MediaItemView[]> {
  const [a, b] = await Promise.all([
    listMediaByContestant(db, matchup.contestantAId),
    listMediaByContestant(db, matchup.contestantBId),
  ]);
  return [...presentMedia(a, publicBaseUrl), ...presentMedia(b, publicBaseUrl)];
}

/**
 * Builds the `/matchups/next` response: the voter's next matchup (side
 * decided by the API, spec §8.4), progress, and an advisory prefetch block
 * naming the following matchup's media.
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

  const left = isLeftSide(matchup.id, voterId) ? matchup.contestantAId : matchup.contestantBId;
  const right = left === matchup.contestantAId ? matchup.contestantBId : matchup.contestantAId;

  const [leftView, rightView] = await Promise.all([
    contestantView(db, left, publicBaseUrl),
    contestantView(db, right, publicBaseUrl),
  ]);

  const result: NextMatchupView = {
    matchup: { id: matchup.id, left: leftView, right: rightView },
    progress: { voted, total },
  };

  const upcoming = candidates[1];
  if (upcoming) {
    result.prefetch = {
      matchup_id: upcoming.id,
      media: await matchupMedia(db, upcoming, publicBaseUrl),
    };
  }

  return result;
}
