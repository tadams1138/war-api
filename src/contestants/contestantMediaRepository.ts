import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';

export interface ContestantMedia {
  id: string;
  contestantId: string;
  kind: string;
  displayOrder: number;
  storageKey: string | null;
  originalExt: string | null;
  width: number | null;
  height: number | null;
}

interface MediaRow {
  id: string;
  contestant_id: string;
  kind: string;
  display_order: number;
  storage_key: string | null;
  original_ext: string | null;
  width: number | null;
  height: number | null;
}

function toMedia(row: MediaRow): ContestantMedia {
  return {
    id: row.id,
    contestantId: row.contestant_id,
    kind: row.kind,
    displayOrder: row.display_order,
    storageKey: row.storage_key,
    originalExt: row.original_ext,
    width: row.width,
    height: row.height,
  };
}

export interface CreateImageMediaInput {
  contestantId: string;
  displayOrder: number;
  storageKey: string;
  originalExt: string;
  width: number;
  height: number;
}

export async function createImageMedia(db: Kysely<Database>, input: CreateImageMediaInput): Promise<ContestantMedia> {
  const row = await db
    .insertInto('contestant_media')
    .values({
      id: newId(),
      contestant_id: input.contestantId,
      kind: 'image',
      display_order: input.displayOrder,
      storage_key: input.storageKey,
      original_ext: input.originalExt,
      width: input.width,
      height: input.height,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toMedia(row as unknown as MediaRow);
}

export async function listMediaByContestant(db: Kysely<Database>, contestantId: string): Promise<ContestantMedia[]> {
  const rows = await db
    .selectFrom('contestant_media')
    .selectAll()
    .where('contestant_id', '=', contestantId)
    .orderBy('display_order', 'asc')
    .execute();
  return rows.map((row) => toMedia(row as unknown as MediaRow));
}

export async function countMediaByContestant(db: Kysely<Database>, contestantId: string): Promise<number> {
  const row = await db
    .selectFrom('contestant_media')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('contestant_id', '=', contestantId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

export async function findMediaById(db: Kysely<Database>, id: string): Promise<ContestantMedia | undefined> {
  const row = await db.selectFrom('contestant_media').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toMedia(row as unknown as MediaRow) : undefined;
}

export async function setDisplayOrder(db: Kysely<Database>, id: string, displayOrder: number): Promise<void> {
  await db.updateTable('contestant_media').set({ display_order: displayOrder }).where('id', '=', id).execute();
}

export async function deleteMedia(db: Kysely<Database>, id: string): Promise<void> {
  await db.deleteFrom('contestant_media').where('id', '=', id).execute();
}
