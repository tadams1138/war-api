import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { effectiveStatus } from './effectiveStatus.js';
import { findWarById, type War } from './warsRepository.js';

export type WarAccessOutcome = { kind: 'ok'; war: War } | { kind: 'notFound' } | { kind: 'forbidden' } | { kind: 'wrongStatus' };

/**
 * Loads a War, 404s if missing, 403s if the voter isn't its creator, and
 * checks its effective status against `expectedStatus` — the guard that used
 * to be written out independently at every mutation call site, discarding
 * the War it had just loaded and forcing callers to re-fetch it (design
 * review finding 5). Returns the loaded War so callers never need to.
 */
export async function loadWarOwnedBy(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  now: Date,
  expectedStatus: string,
): Promise<WarAccessOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (war.creatorId !== voterId) return { kind: 'forbidden' };
  if (effectiveStatus(war, now) !== expectedStatus) return { kind: 'wrongStatus' };
  return { kind: 'ok', war };
}

export type DraftWarAccessOutcome =
  | { kind: 'ok'; war: War }
  | { kind: 'notFound' }
  | { kind: 'forbidden' }
  | { kind: 'notDraft' };

/** The common case across contestant/media/War-field mutations: draft-only editing. */
export async function loadDraftWarOwnedBy(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  now: Date,
): Promise<DraftWarAccessOutcome> {
  const outcome = await loadWarOwnedBy(db, warId, voterId, now, 'draft');
  if (outcome.kind === 'wrongStatus') {
    return { kind: 'notDraft' };
  }
  return outcome;
}
