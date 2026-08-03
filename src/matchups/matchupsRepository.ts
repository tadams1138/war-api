import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';

export interface Matchup {
  id: string;
  warId: string;
  contestantAId: string;
  contestantBId: string;
}

interface MatchupRow {
  id: string;
  war_id: string;
  contestant_a_id: string;
  contestant_b_id: string;
}

function toMatchup(row: MatchupRow): Matchup {
  return { id: row.id, warId: row.war_id, contestantAId: row.contestant_a_id, contestantBId: row.contestant_b_id };
}

/** Generates every unordered pair for a War's contestants (spec §6, §8.2). */
export async function generateMatchups(db: Kysely<Database>, warId: string, contestantIds: string[]): Promise<number> {
  const sorted = [...contestantIds].sort();
  const rows: { id: string; war_id: string; contestant_a_id: string; contestant_b_id: string }[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      rows.push({ id: newId(), war_id: warId, contestant_a_id: sorted[i]!, contestant_b_id: sorted[j]! });
    }
  }

  if (rows.length === 0) {
    return 0;
  }

  await db.insertInto('matchups').values(rows).execute();
  return rows.length;
}

export async function countMatchupsForWar(db: Kysely<Database>, warId: string): Promise<number> {
  const row = await db
    .selectFrom('matchups')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('war_id', '=', warId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

export async function findMatchupById(db: Kysely<Database>, id: string): Promise<Matchup | undefined> {
  const row = await db.selectFrom('matchups').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toMatchup(row as unknown as MatchupRow) : undefined;
}

/**
 * The voter's unvoted pair whose contestants have the lowest combined
 * appearance_count, ties broken by a stable per-voter shuffle (spec §8.4).
 */
export async function findNextMatchupForVoter(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
): Promise<Matchup | undefined> {
  const row = await db
    .selectFrom('matchups as m')
    .innerJoin('contestants as ca', 'ca.id', 'm.contestant_a_id')
    .innerJoin('contestants as cb', 'cb.id', 'm.contestant_b_id')
    .select(['m.id as id', 'm.war_id as war_id', 'm.contestant_a_id as contestant_a_id', 'm.contestant_b_id as contestant_b_id'])
    .where('m.war_id', '=', warId)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('votes as v')
            .select('v.id')
            .whereRef('v.matchup_id', '=', 'm.id')
            .where('v.voter_id', '=', voterId),
        ),
      ),
    )
    .orderBy(sql`(ca.appearance_count + cb.appearance_count)`, 'asc')
    .orderBy(sql`md5(m.id::text || ${voterId}::text)`, 'asc')
    .limit(1)
    .executeTakeFirst();

  return row ? toMatchup(row as unknown as MatchupRow) : undefined;
}

/**
 * Every pair the voter has not yet voted on, in the same stable order
 * `findNextMatchupForVoter` would serve them — used to compute the
 * prefetch block (spec §8.4).
 */
export async function findUnvotedMatchupsForVoter(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  limit: number,
): Promise<Matchup[]> {
  const rows = await db
    .selectFrom('matchups as m')
    .innerJoin('contestants as ca', 'ca.id', 'm.contestant_a_id')
    .innerJoin('contestants as cb', 'cb.id', 'm.contestant_b_id')
    .select(['m.id as id', 'm.war_id as war_id', 'm.contestant_a_id as contestant_a_id', 'm.contestant_b_id as contestant_b_id'])
    .where('m.war_id', '=', warId)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('votes as v')
            .select('v.id')
            .whereRef('v.matchup_id', '=', 'm.id')
            .where('v.voter_id', '=', voterId),
        ),
      ),
    )
    .orderBy(sql`(ca.appearance_count + cb.appearance_count)`, 'asc')
    .orderBy(sql`md5(m.id::text || ${voterId}::text)`, 'asc')
    .limit(limit)
    .execute();

  return rows.map((row) => toMatchup(row as unknown as MatchupRow));
}

export async function countVotesByVoterInWar(db: Kysely<Database>, warId: string, voterId: string): Promise<number> {
  const row = await db
    .selectFrom('votes as v')
    .innerJoin('matchups as m', 'm.id', 'v.matchup_id')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('m.war_id', '=', warId)
    .where('v.voter_id', '=', voterId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}
