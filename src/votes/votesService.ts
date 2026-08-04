import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { effectiveStatus } from '../wars/effectiveStatus.js';
import { findWarById, isMember } from '../wars/warsRepository.js';
import { findMatchupById } from '../matchups/matchupsRepository.js';
import { isLeftSide } from '../matchups/stableHash.js';
import { castVote, findVote, type Vote } from './votesRepository.js';

export type CastVoteOutcome =
  | { kind: 'created'; vote: Vote }
  | { kind: 'retried' }
  | { kind: 'conflict' }
  | { kind: 'invalidWinner' }
  | { kind: 'warNotActive' }
  | { kind: 'notJoined' }
  | { kind: 'notFound' };

export interface CastVoteInput {
  warId: string;
  matchupId: string;
  voterId: string;
  winnerId: string;
}

/** Casts a vote, enforcing §8.4/§10.1's rules: active War, joined voter, valid winner, final vote. */
export async function castVoteForVoter(
  db: Kysely<Database>,
  input: CastVoteInput,
  now: Date = new Date(),
): Promise<CastVoteOutcome> {
  const war = await findWarById(db, input.warId);
  if (!war) {
    return { kind: 'notFound' };
  }
  if (effectiveStatus(war, now) !== 'active') {
    return { kind: 'warNotActive' };
  }

  const joined = await isMember(db, input.warId, input.voterId);
  if (!joined) {
    return { kind: 'notJoined' };
  }

  const matchup = await findMatchupById(db, input.matchupId);
  if (!matchup || matchup.warId !== input.warId) {
    return { kind: 'notFound' };
  }
  if (input.winnerId !== matchup.contestantAId && input.winnerId !== matchup.contestantBId) {
    return { kind: 'invalidWinner' };
  }

  // Cheap fast path preserving the existing pre-check messages; the
  // repository's ON CONFLICT is the real arbiter for a concurrent retry
  // (design review finding 2), since two requests can both pass this check.
  const existing = await findVote(db, input.matchupId, input.voterId);
  if (existing) {
    return existing.winnerId === input.winnerId ? { kind: 'retried' } : { kind: 'conflict' };
  }

  const presentedLeftId = isLeftSide(matchup.id, input.voterId) ? matchup.contestantAId : matchup.contestantBId;
  const result = await castVote(db, matchup, input.voterId, input.winnerId, presentedLeftId);
  if (!result.inserted) {
    return result.vote.winnerId === input.winnerId ? { kind: 'retried' } : { kind: 'conflict' };
  }
  return { kind: 'created', vote: result.vote };
}
