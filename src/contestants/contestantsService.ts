import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { effectiveStatus } from '../wars/effectiveStatus.js';
import { findWarById } from '../wars/warsRepository.js';
import type { MutationOutcome } from '../shared/outcomes.js';
import { validateAttributes } from './schemaValidation.js';
import {
  createContestant,
  deleteContestant,
  findContestantById,
  updateContestant,
  type Contestant,
} from './contestantsRepository.js';

export interface CreateContestantInput {
  warId: string;
  voterId: string;
  name: string;
  bio?: string | null;
  attributes?: Record<string, unknown>;
}

async function assertDraftWarOwnedBy(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  now: Date,
): Promise<{ kind: 'ok' } | { kind: 'notFound' } | { kind: 'forbidden' } | { kind: 'notDraft' }> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (war.creatorId !== voterId) return { kind: 'forbidden' };
  if (effectiveStatus(war, now) !== 'draft') return { kind: 'notDraft' };
  return { kind: 'ok' };
}

export async function addContestant(
  db: Kysely<Database>,
  input: CreateContestantInput,
  now: Date,
): Promise<MutationOutcome<Contestant>> {
  const guard = await assertDraftWarOwnedBy(db, input.warId, input.voterId, now);
  if (guard.kind !== 'ok') return guard;

  const war = await findWarById(db, input.warId);
  const attributes = input.attributes ?? {};
  const validated = validateAttributes(war!.contestantSchema, attributes);
  if (!validated.ok) {
    return { kind: 'validationError', errors: validated.errors };
  }

  if (typeof input.name !== 'string' || input.name.length === 0 || input.name.length > 256) {
    return { kind: 'validationError', errors: ['name must be a non-empty string of at most 256 characters'] };
  }

  const contestant = await createContestant(db, {
    warId: input.warId,
    name: input.name,
    bio: input.bio ?? null,
    attributes,
  });
  return { kind: 'ok', value: contestant };
}

export interface PatchContestantInput {
  name?: string;
  bio?: string | null;
  attributes?: Record<string, unknown>;
}

export async function patchContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  voterId: string,
  input: PatchContestantInput,
  now: Date,
): Promise<MutationOutcome<Contestant>> {
  const guard = await assertDraftWarOwnedBy(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const contestant = await findContestantById(db, contestantId);
  if (!contestant || contestant.warId !== warId) return { kind: 'notFound' };

  const war = await findWarById(db, warId);
  if (input.attributes !== undefined) {
    const validated = validateAttributes(war!.contestantSchema, input.attributes);
    if (!validated.ok) {
      return { kind: 'validationError', errors: validated.errors };
    }
  }
  if (input.name !== undefined && (input.name.length === 0 || input.name.length > 256)) {
    return { kind: 'validationError', errors: ['name must be a non-empty string of at most 256 characters'] };
  }

  const updated = await updateContestant(db, contestantId, {
    name: input.name,
    bio: input.bio,
    attributes: input.attributes,
  });
  return { kind: 'ok', value: updated };
}

export async function removeContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  voterId: string,
  now: Date,
): Promise<MutationOutcome<void>> {
  const guard = await assertDraftWarOwnedBy(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const contestant = await findContestantById(db, contestantId);
  if (!contestant || contestant.warId !== warId) return { kind: 'notFound' };

  await deleteContestant(db, contestantId);
  return { kind: 'ok', value: undefined };
}
