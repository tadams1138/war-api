import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';
import type { Matchup } from '../matchups/matchupsRepository.js';

export interface Vote {
  id: string;
  matchupId: string;
  voterId: string;
  winnerId: string;
  presentedLeftId: string;
}

function toVote(row: {
  id: string;
  matchup_id: string;
  voter_id: string;
  winner_id: string;
  presented_left_id: string;
}): Vote {
  return {
    id: row.id,
    matchupId: row.matchup_id,
    voterId: row.voter_id,
    winnerId: row.winner_id,
    presentedLeftId: row.presented_left_id,
  };
}

export async function findVote(db: Kysely<Database>, matchupId: string, voterId: string): Promise<Vote | undefined> {
  const row = await db
    .selectFrom('votes')
    .selectAll()
    .where('matchup_id', '=', matchupId)
    .where('voter_id', '=', voterId)
    .executeTakeFirst();
  return row ? toVote(row) : undefined;
}

export interface CastVoteResult {
  /** False when a concurrent insert for this (matchup, voter) won the race. */
  inserted: boolean;
  vote: Vote;
}

/**
 * Casts a vote and increments both denormalised counters in one transaction
 * (spec §6, §8.4). The insert is `ON CONFLICT DO NOTHING` against the
 * `UNIQUE (matchup_id, voter_id)` constraint, which is the real arbiter when
 * two requests for the same voter race (design review finding 2) — the
 * caller's pre-check (spec §10.1) is only a fast path, not the source of
 * truth. When the insert is skipped, the counters are **not** touched, so
 * the losing request never double-increments them; it returns the row the
 * winner (or an earlier vote) already wrote.
 */
export async function castVote(
  db: Kysely<Database>,
  matchup: Matchup,
  voterId: string,
  winnerId: string,
  presentedLeftId: string,
): Promise<CastVoteResult> {
  return db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto('votes')
      .values({
        id: newId(),
        matchup_id: matchup.id,
        voter_id: voterId,
        winner_id: winnerId,
        presented_left_id: presentedLeftId,
      })
      .onConflict((oc) => oc.columns(['matchup_id', 'voter_id']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (!inserted) {
      const existing = await trx
        .selectFrom('votes')
        .selectAll()
        .where('matchup_id', '=', matchup.id)
        .where('voter_id', '=', voterId)
        .executeTakeFirstOrThrow();
      return { inserted: false, vote: toVote(existing) };
    }

    await trx
      .updateTable('contestants')
      .set((eb) => ({ win_count: eb('win_count', '+', 1) }))
      .where('id', '=', winnerId)
      .execute();

    await trx
      .updateTable('contestants')
      .set((eb) => ({ appearance_count: eb('appearance_count', '+', 1) }))
      .where('id', 'in', [matchup.contestantAId, matchup.contestantBId])
      .execute();

    return { inserted: true, vote: toVote(inserted) };
  });
}
