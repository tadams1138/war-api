import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { validateSchemaDefinition, type ContestantSchemaField } from '../contestants/schemaValidation.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { countMediaByContestant } from '../contestants/contestantMediaRepository.js';
import { generateMatchups } from '../matchups/matchupsRepository.js';
import type { Forbidden, MutationOutcome, NotActive, NotFound } from '../shared/outcomes.js';
import { effectiveStatus } from './effectiveStatus.js';
import { loadDraftWarOwnedBy, loadWarOwnedBy } from './warAccess.js';
import {
  createMembership,
  createWar,
  findWarById,
  isMember,
  setWarStatus,
  updateWar,
  type War,
  type WarPatch,
} from './warsRepository.js';

export interface CreateWarInput {
  creatorId: string;
  title: string;
  category?: string | null;
  visibility?: string;
  mediaMode?: string;
  contestantSchema?: unknown;
  endsAt?: string | null;
}

export type CreateWarOutcome = { kind: 'created'; war: War } | { kind: 'validationError'; errors: string[] };

export async function createWarForVoter(db: Kysely<Database>, input: CreateWarInput): Promise<CreateWarOutcome> {
  const errors: string[] = [];

  if (typeof input.title !== 'string' || input.title.length === 0 || input.title.length > 256) {
    errors.push('title must be a non-empty string of at most 256 characters');
  }

  const mediaMode = input.mediaMode ?? 'image';
  if (mediaMode !== 'image') {
    errors.push('media_mode must be "image" in this slice');
  }

  const visibility = input.visibility ?? 'public';
  if (visibility !== 'public' && visibility !== 'invite_only') {
    errors.push('visibility must be "public" or "invite_only"');
  }

  let contestantSchema: ContestantSchemaField[] = [];
  if (input.contestantSchema !== undefined) {
    const validated = validateSchemaDefinition(input.contestantSchema);
    if (!validated.ok) {
      errors.push(...validated.errors);
    } else {
      contestantSchema = validated.value;
    }
  }

  let endsAt: Date | null = null;
  if (input.endsAt) {
    const parsed = new Date(input.endsAt);
    if (Number.isNaN(parsed.getTime())) {
      errors.push('ends_at must be a valid date-time');
    } else {
      endsAt = parsed;
    }
  }

  if (errors.length > 0) {
    return { kind: 'validationError', errors };
  }

  const war = await createWar(db, {
    creatorId: input.creatorId,
    title: input.title,
    category: input.category ?? null,
    visibility,
    mediaMode,
    contestantSchema,
    endsAt,
  });

  return { kind: 'created', war };
}

export type WarLookupOutcome = { kind: 'found'; war: War } | { kind: 'notFound' };

export async function getWar(db: Kysely<Database>, id: string): Promise<WarLookupOutcome> {
  const war = await findWarById(db, id);
  return war ? { kind: 'found', war } : { kind: 'notFound' };
}

export interface PatchWarInput {
  title?: string;
  category?: string | null;
  visibility?: string;
  contestantSchema?: unknown;
  endsAt?: string | null;
}

export async function patchWar(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  input: PatchWarInput,
  now: Date,
): Promise<MutationOutcome<War>> {
  const guard = await loadDraftWarOwnedBy(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const patch: WarPatch = {};
  const errors: string[] = [];

  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.length === 0 || input.title.length > 256) {
      errors.push('title must be a non-empty string of at most 256 characters');
    } else {
      patch.title = input.title;
    }
  }
  if (input.category !== undefined) {
    patch.category = input.category;
  }
  if (input.visibility !== undefined) {
    if (input.visibility !== 'public' && input.visibility !== 'invite_only') {
      errors.push('visibility must be "public" or "invite_only"');
    } else {
      patch.visibility = input.visibility;
    }
  }
  if (input.contestantSchema !== undefined) {
    const validated = validateSchemaDefinition(input.contestantSchema);
    if (!validated.ok) {
      errors.push(...validated.errors);
    } else {
      patch.contestantSchema = validated.value;
    }
  }
  if (input.endsAt !== undefined) {
    if (input.endsAt === null) {
      patch.endsAt = null;
    } else {
      const parsed = new Date(input.endsAt);
      if (Number.isNaN(parsed.getTime())) {
        errors.push('ends_at must be a valid date-time');
      } else {
        patch.endsAt = parsed;
      }
    }
  }

  if (errors.length > 0) {
    return { kind: 'validationError', errors };
  }

  const updated = await updateWar(db, warId, patch);
  return { kind: 'ok', value: updated };
}

export type ActivateOutcome = MutationOutcome<War>;

/** draft → active: requires ≥2 contestants, each with ≥1 image (spec §8.2). */
export async function activateWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<ActivateOutcome> {
  const guard = await loadDraftWarOwnedBy(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const contestants = await listContestantsByWar(db, warId);
  if (contestants.length < 2) {
    return { kind: 'validationError', errors: ['a War needs at least 2 contestants to activate'] };
  }

  const mediaCounts = await Promise.all(contestants.map((c) => countMediaByContestant(db, c.id)));
  if (mediaCounts.some((count) => count === 0)) {
    return { kind: 'validationError', errors: ['every contestant must have at least one image to activate'] };
  }

  await generateMatchups(db, warId, contestants.map((c) => c.id));
  const activated = await setWarStatus(db, warId, 'active');
  return { kind: 'ok', value: activated };
}

export type CloseOutcome = MutationOutcome<War, NotFound | Forbidden | NotActive>;

export async function closeWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<CloseOutcome> {
  const guard = await loadWarOwnedBy(db, warId, voterId, now, 'active');
  if (guard.kind === 'wrongStatus') return { kind: 'notActive' };
  if (guard.kind !== 'ok') return guard;

  const closed = await setWarStatus(db, warId, 'closed');
  return { kind: 'ok', value: closed };
}

export type JoinOutcome = MutationOutcome<void, NotFound | NotActive>;

export async function joinWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<JoinOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (effectiveStatus(war, now) !== 'active') return { kind: 'notActive' };

  if (!(await isMember(db, warId, voterId))) {
    await createMembership(db, warId, voterId);
  }
  return { kind: 'ok', value: undefined };
}
