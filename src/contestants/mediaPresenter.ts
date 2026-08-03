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
 * Builds the response shape for a contestant's media array (spec §8, "Media
 * Representation"). Which variant widths exist is derived from the stored
 * source width — the same "never upscale" rule applied at upload time
 * (spec §11.1) — rather than persisted separately.
 */
export function presentMedia(media: ContestantMedia[], publicBaseUrl: string): MediaItemView[] {
  return media.map((item) => {
    const sourceWidth = item.width ?? 0;
    const sourceHeight = item.height ?? 0;
    const variants: MediaVariantView[] = VARIANT_WIDTHS.filter((width) => width <= sourceWidth).map((width) => ({
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
