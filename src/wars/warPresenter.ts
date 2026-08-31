import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { listMediaByContestants } from '../contestants/contestantMediaRepository.js';
import { presentContestant, type ContestantDetailView } from '../contestants/contestantPresenter.js';
import { effectiveStatus } from './effectiveStatus.js';
import type { War } from './warsRepository.js';

export interface WarSummaryView {
  id: string;
  title: string;
  category: string | null;
  status: string;
  visibility: string;
  media_mode: string;
  contestant_schema: unknown;
  ends_at: string | null;
  contestant_count: number;
}

/**
 * Properties shared by {@link WarSummaryView}'s schema and
 * {@link WarDetailView}'s (which is a `WarSummary` plus `contestants`).
 * Kept as a standalone map, not a schema, so `warDetailResponseSchema` can
 * build a single flat response schema instead of relying on `allOf`
 * merging. Kept beside the interfaces they mirror -- see `mediaItemSchema`
 * (`../contestants/mediaPresenter.ts`) for why.
 */
const warSummaryProperties = {
  id: { type: 'string', format: 'uuid' },
  title: { type: 'string' },
  category: { type: ['string', 'null'] },
  status: { type: 'string', enum: ['draft', 'active', 'closed'] },
  visibility: { type: 'string', enum: ['public', 'invite_only'] },
  media_mode: { type: 'string', enum: ['image'] },
  contestant_schema: {
    type: 'array',
    items: {
      type: 'object',
      required: ['key', 'label', 'type'],
      properties: {
        key: { type: 'string' },
        label: { type: 'string' },
        type: { type: 'string', enum: ['string', 'number', 'text', 'url', 'date'] },
      },
    },
  },
  ends_at: { type: ['string', 'null'], format: 'date-time' },
  contestant_count: { type: 'integer', minimum: 0 },
};

const warSummaryRequired = [
  'id',
  'title',
  'category',
  'status',
  'visibility',
  'media_mode',
  'contestant_schema',
  'ends_at',
  'contestant_count',
];

/** The response body JSON Schema for {@link WarSummaryView} (spec §11.2.1). Registered under `$id: "WarSummary"`. */
export const warSummarySchema = {
  $id: 'WarSummary',
  type: 'object',
  required: warSummaryRequired,
  properties: warSummaryProperties,
};

/**
 * The response body JSON Schema for {@link WarDetailView} (spec §11.2.1):
 * `warSummaryProperties` plus a required `contestants` array. Not
 * registered under a shared `$id` -- only `GET /wars/:id` uses it.
 */
export const warDetailResponseSchema = {
  type: 'object',
  required: [...warSummaryRequired, 'contestants'],
  properties: {
    ...warSummaryProperties,
    contestants: { type: 'array', items: { $ref: 'ContestantDetail#' } },
  },
};

export function presentWarSummary(war: War, now: Date, contestantCount: number): WarSummaryView {
  return {
    id: war.id,
    title: war.title,
    category: war.category,
    status: effectiveStatus(war, now),
    visibility: war.visibility,
    media_mode: war.mediaMode,
    contestant_schema: war.contestantSchema,
    ends_at: war.endsAt ? war.endsAt.toISOString() : null,
    contestant_count: contestantCount,
  };
}

export interface WarDetailView extends WarSummaryView {
  contestants: ContestantDetailView[];
}

export async function presentWarDetail(
  db: Kysely<Database>,
  war: War,
  now: Date,
  publicBaseUrl: string,
): Promise<WarDetailView> {
  const contestants = await listContestantsByWar(db, war.id);
  const mediaByContestant = await listMediaByContestants(
    db,
    contestants.map((c) => c.id),
  );
  const views = contestants.map((c) => presentContestant(c, war, mediaByContestant.get(c.id) ?? [], publicBaseUrl));
  return { ...presentWarSummary(war, now, contestants.length), contestants: views };
}
