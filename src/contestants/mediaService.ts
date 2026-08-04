import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { loadDraftWarOwnedBy } from '../wars/warAccess.js';
import type { War } from '../wars/warsRepository.js';
import type { MutationOutcome } from '../shared/outcomes.js';
import { findContestantById, type Contestant } from './contestantsRepository.js';
import { deleteMedia, findMediaById, setDisplayOrder, type ContestantMedia } from './contestantMediaRepository.js';
import { uploadContestantImage, type UploadOutcome } from './imageUploadService.js';
import type { ObjectStorage } from './storage.js';

async function guardDraftOwnedContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  voterId: string,
  now: Date,
): Promise<
  | { kind: 'ok'; war: War; contestant: Contestant }
  | { kind: 'notFound' }
  | { kind: 'forbidden' }
  | { kind: 'notDraft' }
> {
  const warGuard = await loadDraftWarOwnedBy(db, warId, voterId, now);
  if (warGuard.kind !== 'ok') return warGuard;

  const contestant = await findContestantById(db, contestantId);
  if (!contestant || contestant.warId !== warId) return { kind: 'notFound' };

  return { kind: 'ok', war: warGuard.war, contestant };
}

export interface AddImageInput {
  warId: string;
  contestantId: string;
  voterId: string;
  buffer: Buffer;
  mimeType: string;
  originalExt: string;
}

export type AddImageOutcome = MutationOutcome<ContestantMedia>;

export async function addContestantImage(
  db: Kysely<Database>,
  storage: ObjectStorage,
  input: AddImageInput,
  now: Date,
): Promise<AddImageOutcome> {
  const guard = await guardDraftOwnedContestant(db, input.warId, input.contestantId, input.voterId, now);
  if (guard.kind !== 'ok') return guard;

  const outcome: UploadOutcome = await uploadContestantImage(db, storage, {
    contestantId: input.contestantId,
    buffer: input.buffer,
    mimeType: input.mimeType,
    originalExt: input.originalExt,
  });

  if (!outcome.ok) {
    const message = outcome.reason === 'too-many-images' ? 'a contestant may hold at most 10 images' : 'invalid image upload';
    return { kind: 'validationError', errors: [message] };
  }
  return { kind: 'ok', value: outcome.media };
}

export async function reorderContestantMedia(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  mediaId: string,
  voterId: string,
  displayOrder: number,
  now: Date,
): Promise<MutationOutcome<void>> {
  const guard = await guardDraftOwnedContestant(db, warId, contestantId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const media = await findMediaById(db, mediaId);
  if (!media || media.contestantId !== contestantId) return { kind: 'notFound' };

  await setDisplayOrder(db, mediaId, displayOrder);
  return { kind: 'ok', value: undefined };
}

export async function removeContestantMedia(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  mediaId: string,
  voterId: string,
  now: Date,
): Promise<MutationOutcome<void>> {
  const guard = await guardDraftOwnedContestant(db, warId, contestantId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const media = await findMediaById(db, mediaId);
  if (!media || media.contestantId !== contestantId) return { kind: 'notFound' };

  await deleteMedia(db, mediaId);
  return { kind: 'ok', value: undefined };
}
