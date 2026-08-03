import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { War } from '../wars/warsRepository.js';
import { listMediaByContestant } from './contestantMediaRepository.js';
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

export async function presentContestant(
  db: Kysely<Database>,
  contestant: Contestant,
  war: War,
  publicBaseUrl: string,
): Promise<ContestantDetailView> {
  const media = await listMediaByContestant(db, contestant.id);
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
