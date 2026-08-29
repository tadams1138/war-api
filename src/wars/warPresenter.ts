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
}

export function presentWarSummary(war: War, now: Date): WarSummaryView {
  return {
    id: war.id,
    title: war.title,
    category: war.category,
    status: effectiveStatus(war, now),
    visibility: war.visibility,
    media_mode: war.mediaMode,
    contestant_schema: war.contestantSchema,
    ends_at: war.endsAt ? war.endsAt.toISOString() : null,
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
  return { ...presentWarSummary(war, now), contestants: views };
}
