import type { Kysely, Selectable } from 'kysely';
import type { ContestantMediaTable, Database } from '../db/types.js';
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
  /** The variant widths actually written at upload time (spec §11.1), or
   * null for rows predating this column — the presenter falls back to
   * filtering today's config for those. */
  variantWidths: number[] | null;
}

function toMedia(row: Selectable<ContestantMediaTable>): ContestantMedia {
  return {
    id: row.id,
    contestantId: row.contestant_id,
    kind: row.kind,
    displayOrder: row.display_order,
    storageKey: row.storage_key,
    originalExt: row.original_ext,
    width: row.width,
    height: row.height,
    variantWidths: row.variant_widths,
  };
}

export interface CreateImageMediaInput {
  contestantId: string;
  displayOrder: number;
  storageKey: string;
  originalExt: string;
  width: number;
  height: number;
  variantWidths: number[];
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
      variant_widths: input.variantWidths,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toMedia(row);
}

export async function listMediaByContestant(db: Kysely<Database>, contestantId: string): Promise<ContestantMedia[]> {
  const rows = await db
    .selectFrom('contestant_media')
    .selectAll()
    .where('contestant_id', '=', contestantId)
    .orderBy('display_order', 'asc')
    .execute();
  return rows.map((row) => toMedia(row));
}

/**
 * Batches the media lookup for many contestants into one query (design
 * review finding 9) — the N+1 alternative of calling `listMediaByContestant`
 * once per contestant is what War detail, rankings, and `/matchups/next`
 * used to pay on every request.
 */
export async function listMediaByContestants(
  db: Kysely<Database>,
  contestantIds: string[],
): Promise<Map<string, ContestantMedia[]>> {
  const byContestant = new Map<string, ContestantMedia[]>();
  if (contestantIds.length === 0) {
    return byContestant;
  }

  const rows = await db
    .selectFrom('contestant_media')
    .selectAll()
    .where('contestant_id', 'in', contestantIds)
    .orderBy('contestant_id', 'asc')
    .orderBy('display_order', 'asc')
    .execute();

  for (const row of rows) {
    const media = toMedia(row);
    const existing = byContestant.get(media.contestantId);
    if (existing) {
      existing.push(media);
    } else {
      byContestant.set(media.contestantId, [media]);
    }
  }
  return byContestant;
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
  return row ? toMedia(row) : undefined;
}

export async function setDisplayOrder(db: Kysely<Database>, id: string, displayOrder: number): Promise<void> {
  await db.updateTable('contestant_media').set({ display_order: displayOrder }).where('id', '=', id).execute();
}

export async function deleteMedia(db: Kysely<Database>, id: string): Promise<void> {
  await db.deleteFrom('contestant_media').where('id', '=', id).execute();
}
