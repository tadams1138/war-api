import type { Kysely, Selectable } from 'kysely';
import type { Database, WarsTable } from '../db/types.js';
import { toJsonb } from '../db/jsonb.js';
import { newId } from '../db/uuid.js';
import type { ContestantSchemaField } from '../contestants/schemaValidation.js';

export interface War {
  id: string;
  creatorId: string | null;
  title: string;
  category: string | null;
  status: string;
  visibility: string;
  mediaMode: string;
  contestantSchema: ContestantSchemaField[];
  endsAt: Date | null;
  createdAt: Date;
}

function toWar(row: Selectable<WarsTable>): War {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    mediaMode: row.media_mode,
    contestantSchema: (row.contestant_schema ?? []) as ContestantSchemaField[],
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export interface CreateWarInput {
  creatorId: string;
  title: string;
  category: string | null;
  visibility: string;
  mediaMode: string;
  contestantSchema: ContestantSchemaField[];
  endsAt: Date | null;
}

export async function createWar(db: Kysely<Database>, input: CreateWarInput): Promise<War> {
  const row = await db
    .insertInto('wars')
    .values({
      id: newId(),
      creator_id: input.creatorId,
      title: input.title,
      category: input.category,
      status: 'draft',
      visibility: input.visibility,
      media_mode: input.mediaMode,
      contestant_schema: toJsonb(input.contestantSchema),
      ends_at: input.endsAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toWar(row);
}

export async function findWarById(db: Kysely<Database>, id: string): Promise<War | undefined> {
  const row = await db.selectFrom('wars').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toWar(row) : undefined;
}

export interface ListWarsFilter {
  status?: string;
  category?: string;
  cursor?: string;
  limit: number;
}

export async function listWars(db: Kysely<Database>, filter: ListWarsFilter): Promise<War[]> {
  let query = db.selectFrom('wars').selectAll().orderBy('created_at', 'desc').orderBy('id', 'desc');

  if (filter.status) {
    query = query.where('status', '=', filter.status);
  }
  if (filter.category) {
    query = query.where('category', '=', filter.category);
  }
  if (filter.cursor) {
    query = query.where('id', '<', filter.cursor);
  }

  const rows = await query.limit(filter.limit).execute();
  return rows.map((row) => toWar(row));
}

export interface WarPatch {
  title?: string;
  category?: string | null;
  visibility?: string;
  mediaMode?: string;
  contestantSchema?: ContestantSchemaField[];
  endsAt?: Date | null;
}

export async function updateWar(db: Kysely<Database>, id: string, patch: WarPatch): Promise<War> {
  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.category !== undefined) values.category = patch.category;
  if (patch.visibility !== undefined) values.visibility = patch.visibility;
  if (patch.mediaMode !== undefined) values.media_mode = patch.mediaMode;
  if (patch.contestantSchema !== undefined) values.contestant_schema = toJsonb(patch.contestantSchema);
  if (patch.endsAt !== undefined) values.ends_at = patch.endsAt;

  const row = await db
    .updateTable('wars')
    .set(values)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return toWar(row);
}

export async function setWarStatus(db: Kysely<Database>, id: string, status: string): Promise<War> {
  const row = await db
    .updateTable('wars')
    .set({ status })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return toWar(row);
}

/** Materialises stored status for expired Wars (spec §6, §8.7). Idempotent. */
export async function closeExpiredWars(db: Kysely<Database>, now: Date): Promise<number> {
  const rows = await db
    .updateTable('wars')
    .set({ status: 'closed' })
    .where('status', '=', 'active')
    .where('ends_at', 'is not', null)
    .where('ends_at', '<=', now)
    .returning('id')
    .execute();
  return rows.length;
}

export async function createMembership(db: Kysely<Database>, warId: string, voterId: string): Promise<void> {
  await db
    .insertInto('war_memberships')
    .values({ war_id: warId, voter_id: voterId })
    .onConflict((oc) => oc.columns(['war_id', 'voter_id']).doNothing())
    .execute();
}

export async function isMember(db: Kysely<Database>, warId: string, voterId: string): Promise<boolean> {
  const row = await db
    .selectFrom('war_memberships')
    .select('war_id')
    .where('war_id', '=', warId)
    .where('voter_id', '=', voterId)
    .executeTakeFirst();
  return row !== undefined;
}
