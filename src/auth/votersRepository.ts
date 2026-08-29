import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';
import type { OAuthProfile } from './googleProvider.js';

export interface Voter {
  id: string;
  provider: string;
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

function toVoter(row: {
  id: string;
  provider: string;
  provider_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}): Voter {
  return {
    id: row.id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

/**
 * Finds the voter for a (provider, provider_user_id) pair, creating one if
 * this is the first login. Two different provider_user_ids always produce
 * two different voters — there is no cross-account merge (spec §5).
 */
export async function findOrCreateVoter(
  db: Kysely<Database>,
  provider: string,
  profile: OAuthProfile,
): Promise<{ voter: Voter; created: boolean }> {
  const existing = await db
    .selectFrom('voters')
    .selectAll()
    .where('provider', '=', provider)
    .where('provider_user_id', '=', profile.providerUserId)
    .executeTakeFirst();

  if (existing) {
    return { voter: toVoter(existing), created: false };
  }

  const inserted = await db
    .insertInto('voters')
    .values({
      id: newId(),
      provider,
      provider_user_id: profile.providerUserId,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { voter: toVoter(inserted), created: true };
}

export async function findVoterById(db: Kysely<Database>, id: string): Promise<Voter | undefined> {
  const row = await db.selectFrom('voters').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toVoter(row) : undefined;
}
