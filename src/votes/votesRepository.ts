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

/**
 * Casts a vote and increments both denormalised counters in one transaction
 * (spec §6, §8.4). Callers must have already established this is a first
 * vote on this matchup for this voter — retries and conflicts are handled
 * by the caller (spec §10.1) before this ever inserts.
 */
export async function castVote(
  db: Kysely<Database>,
  matchup: Matchup,
  voterId: string,
  winnerId: string,
  presentedLeftId: string,
): Promise<Vote> {
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto('votes')
      .values({
        id: newId(),
        matchup_id: matchup.id,
        voter_id: voterId,
        winner_id: winnerId,
        presented_left_id: presentedLeftId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

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

    return toVote(row);
  });
}
