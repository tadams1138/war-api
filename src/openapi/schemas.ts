import type { FastifyInstance } from 'fastify';

/**
 * Request/response body JSON Schemas for the Core Voting Loop slice (spec
 * §11.2.1). Every shape here is transcribed from the shipped
 * handler/presenter it documents -- see the spec subsection for the source
 * of each. Fastify serializes responses against these with
 * `fast-json-stringify`, which silently drops any property not listed, so
 * each shape below must stay exhaustive for what its presenter actually
 * returns.
 */

const CONTESTANT_FIELD_TYPE_ENUM = ['string', 'number', 'text', 'url', 'date'];

/** A `{ "error": string }` body -- the shape every failure response in this slice uses. */
export const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
};

/** Reflects `src/contestants/mediaPresenter.ts`. Registered as `MediaItem` for cross-route `$ref`. */
export const mediaItemSchema = {
  $id: 'MediaItem',
  type: 'object',
  required: ['kind', 'id', 'display_order', 'aspect_ratio', 'variants'],
  properties: {
    kind: { type: 'string', enum: ['image'] },
    id: { type: 'string', format: 'uuid' },
    display_order: { type: 'integer' },
    aspect_ratio: { type: ['number', 'null'] },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        required: ['width', 'url'],
        properties: {
          width: { type: 'integer' },
          url: { type: 'string' },
        },
      },
    },
  },
};

/** Reflects `resolveAttributes` in `src/contestants/schemaValidation.ts`. Registered as `ResolvedAttribute`. */
export const resolvedAttributeSchema = {
  $id: 'ResolvedAttribute',
  type: 'object',
  required: ['key', 'label', 'type', 'value'],
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    type: { type: 'string', enum: CONTESTANT_FIELD_TYPE_ENUM },
    value: { type: ['string', 'number'] },
  },
};

/**
 * Properties shared by `presentWarSummary`'s output (`WarSummary`) and
 * `presentWarDetail`'s output (which is `WarSummary` plus `contestants`).
 * Kept as a standalone map, not a schema, so the War detail route can build
 * a single flat response schema instead of relying on `allOf` merging.
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
        type: { type: 'string', enum: CONTESTANT_FIELD_TYPE_ENUM },
      },
    },
  },
  ends_at: { type: ['string', 'null'], format: 'date-time' },
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
];

/** Reflects `presentWarSummary` in `src/wars/warPresenter.ts`. Registered as `WarSummary`. */
export const warSummarySchema = {
  $id: 'WarSummary',
  type: 'object',
  required: warSummaryRequired,
  properties: warSummaryProperties,
};

/** Reflects `presentWarDetail`: `WarSummary`'s own properties plus a required `contestants` array. */
export const warDetailResponseSchema = {
  type: 'object',
  required: [...warSummaryRequired, 'contestants'],
  properties: {
    ...warSummaryProperties,
    contestants: { type: 'array', items: { $ref: 'ContestantDetail#' } },
  },
};

/** Reflects `presentContestant` in `src/contestants/contestantPresenter.ts`. Registered as `ContestantDetail`. */
export const contestantDetailSchema = {
  $id: 'ContestantDetail',
  type: 'object',
  required: ['id', 'name', 'bio', 'attributes', 'media', 'win_count', 'appearance_count'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    bio: { type: ['string', 'null'] },
    attributes: { type: 'array', items: { $ref: 'ResolvedAttribute#' } },
    media: { type: 'array', items: { $ref: 'MediaItem#' } },
    win_count: { type: 'integer' },
    appearance_count: { type: 'integer' },
  },
};

/**
 * Registers the shapes above so route schemas can `$ref` them by name.
 * Must run before any route registration that references them (mirrors
 * `registerOpenApiPlugin`'s own ordering requirement).
 */
export function registerSharedSchemas(app: FastifyInstance): void {
  app.addSchema(mediaItemSchema);
  app.addSchema(resolvedAttributeSchema);
  app.addSchema(warSummarySchema);
  app.addSchema(contestantDetailSchema);
}
