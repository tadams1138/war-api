import type { War } from '../wars/warsRepository.js';
import type { ContestantMedia } from './contestantMediaRepository.js';
import type { Contestant } from './contestantsRepository.js';
import { presentMedia, type MediaItemView } from './mediaPresenter.js';
import { resolveAttributes, type ResolvedAttribute } from './schemaValidation.js';

export interface ContestantDetailView {
  id: string;
  name: string;
  bio: string | null;
  attributes: ResolvedAttribute[];
  media: MediaItemView[];
  win_count: number;
  appearance_count: number;
}

/**
 * Builds a contestant's detail view from media the caller already fetched,
 * rather than fetching it itself — the N+1 alternative (one query per
 * contestant) is what War detail used to pay on every request (design
 * review finding 9). `presentWarDetail` batches the fetch for all of a
 * War's contestants; single-contestant callers pass a one-element result.
 */
export function presentContestant(
  contestant: Contestant,
  war: War,
  media: ContestantMedia[],
  publicBaseUrl: string,
): ContestantDetailView {
  return {
    id: contestant.id,
    name: contestant.name,
    bio: contestant.bio,
    attributes: resolveAttributes(war.contestantSchema, contestant.attributes),
    media: presentMedia(media, publicBaseUrl),
    win_count: contestant.winCount,
    appearance_count: contestant.appearanceCount,
  };
}
