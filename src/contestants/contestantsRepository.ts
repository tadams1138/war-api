import type { Kysely, Selectable } from 'kysely';
import type { ContestantsTable, Database } from '../db/types.js';
import { toJsonb } from '../db/jsonb.js';
import { newId } from '../db/uuid.js';

export interface Contestant {
  id: string;
  warId: string;
  name: string;
  bio: string | null;
  attributes: Record<string, unknown>;
  winCount: number;
  appearanceCount: number;
}

function toContestant(row: Selectable<ContestantsTable>): Contestant {
  return {
    id: row.id,
    warId: row.war_id,
    name: row.name,
    bio: row.bio,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    winCount: row.win_count,
    appearanceCount: row.appearance_count,
  };
}

export interface CreateContestantInput {
  warId: string;
  name: string;
  bio: string | null;
  attributes: Record<string, unknown>;
}

export async function createContestant(db: Kysely<Database>, input: CreateContestantInput): Promise<Contestant> {
  const row = await db
    .insertInto('contestants')
    .values({
      id: newId(),
      war_id: input.warId,
      name: input.name,
      bio: input.bio,
      attributes: toJsonb(input.attributes),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toContestant(row);
}

export async function findContestantById(db: Kysely<Database>, id: string): Promise<Contestant | undefined> {
  const row = await db.selectFrom('contestants').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toContestant(row) : undefined;
}

/**
 * Batches a lookup of many contestants by id into one query (design review
 * finding 9) — the alternative of one `findContestantById` call per id is
 * what `/matchups/next` used to pay for its current pair and prefetch pair.
 */
export async function findContestantsByIds(db: Kysely<Database>, ids: string[]): Promise<Map<string, Contestant>> {
  const byId = new Map<string, Contestant>();
  if (ids.length === 0) {
    return byId;
  }
  const rows = await db.selectFrom('contestants').selectAll().where('id', 'in', ids).execute();
  for (const row of rows) {
    const contestant = toContestant(row);
    byId.set(contestant.id, contestant);
  }
  return byId;
}

export async function listContestantsByWar(db: Kysely<Database>, warId: string): Promise<Contestant[]> {
  const rows = await db
    .selectFrom('contestants')
    .selectAll()
    .where('war_id', '=', warId)
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map((row) => toContestant(row));
}

/**
 * Batches each War's contestant count into one query, keyed by War id (spec
 * §11.2.1's `contestant_count` on `WarSummary`) -- mirrors
 * `listMediaByContestants`'s batching pattern above for the same N+1 reason
 * a page of Wars would otherwise pay. Counts every `contestants` row
 * regardless of status (there is none to filter on), so a `draft` War's
 * full contestant count is reported, not zero.
 */
export async function countContestantsByWarIds(db: Kysely<Database>, warIds: string[]): Promise<Map<string, number>> {
  const byWar = new Map<string, number>();
  if (warIds.length === 0) {
    return byWar;
  }
  const rows = await db
    .selectFrom('contestants')
    .select(['war_id', (eb) => eb.fn.countAll<string>().as('count')])
    .where('war_id', 'in', warIds)
    .groupBy('war_id')
    .execute();
  for (const row of rows) {
    byWar.set(row.war_id, Number(row.count));
  }
  return byWar;
}

export interface ContestantPatch {
  name?: string;
  bio?: string | null;
  attributes?: Record<string, unknown>;
}

export async function updateContestant(db: Kysely<Database>, id: string, patch: ContestantPatch): Promise<Contestant> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.bio !== undefined) values.bio = patch.bio;
  if (patch.attributes !== undefined) values.attributes = toJsonb(patch.attributes);

  const row = await db
    .updateTable('contestants')
    .set(values)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return toContestant(row);
}

export async function deleteContestant(db: Kysely<Database>, id: string): Promise<void> {
  await db.deleteFrom('contestants').where('id', '=', id).execute();
}
