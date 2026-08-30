import { VARIANT_WIDTHS } from './imageProcessing.js';
import type { ContestantMedia } from './contestantMediaRepository.js';

export interface MediaVariantView {
  width: number;
  url: string;
}

export interface MediaItemView {
  kind: string;
  id: string;
  display_order: number;
  aspect_ratio: number | null;
  variants: MediaVariantView[];
}

/**
 * The response body JSON Schema for {@link MediaItemView} (spec §11.2.1).
 * Registered under `$id: "MediaItem"` (`registerSharedSchemas`,
 * `src/openapi/schemas.ts`) so other routes' schemas can `$ref` it instead
 * of repeating it. Kept beside the interface it mirrors, on pain of the
 * silent field-drop `fast-json-stringify` produces for any property listed
 * here but not on {@link MediaItemView} (or vice versa).
 */
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

/**
 * Builds the response shape for a contestant's media array (spec §8, "Media
 * Representation"). Which variant widths exist prefers the widths actually
 * written at upload time (`variantWidths`, spec §11.1) so that changing
 * today's `VARIANT_WIDTHS` later cannot silently break URLs already
 * advertised for existing content (design review finding 15). Rows written
 * before that column existed fall back to filtering the stored source width
 * against today's config, exactly as before — no backfill required.
 */
export function presentMedia(media: ContestantMedia[], publicBaseUrl: string): MediaItemView[] {
  return media.map((item) => {
    const sourceWidth = item.width ?? 0;
    const sourceHeight = item.height ?? 0;
    const widths = item.variantWidths ?? VARIANT_WIDTHS.filter((width) => width <= sourceWidth);
    const variants: MediaVariantView[] = widths.map((width) => ({
      width,
      url: `${publicBaseUrl}/${item.storageKey}-${width}.webp`,
    }));

    return {
      kind: item.kind,
      id: item.id,
      display_order: item.displayOrder,
      aspect_ratio: sourceHeight > 0 ? sourceWidth / sourceHeight : null,
      variants,
    };
  });
}
