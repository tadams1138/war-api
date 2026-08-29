import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.js';
import { findOrCreateVoter, type Voter } from '../../src/auth/votersRepository.js';
import { createWar, type War } from '../../src/wars/warsRepository.js';
import { activateWar } from '../../src/wars/warsService.js';
import { createContestant, type Contestant } from '../../src/contestants/contestantsRepository.js';
import { uploadContestantImage } from '../../src/contestants/imageUploadService.js';
import type { ContestantSchemaField } from '../../src/contestants/schemaValidation.js';
import type { ObjectStorage } from '../../src/contestants/storage.js';
import { createMembership } from '../../src/wars/warsRepository.js';

export async function makeVoter(db: Kysely<Database>, seed: string): Promise<Voter> {
  const { voter } = await findOrCreateVoter(db, 'google', {
    providerUserId: `${seed}-${randomUUID()}`,
    displayName: seed,
    avatarUrl: null,
  });
  return voter;
}

export interface DraftWarOptions {
  title?: string;
  visibility?: string;
  contestantSchema?: ContestantSchemaField[];
  endsAt?: Date | null;
}

export async function makeDraftWar(db: Kysely<Database>, creatorId: string, options: DraftWarOptions = {}): Promise<War> {
  return createWar(db, {
    creatorId,
    title: options.title ?? 'Test War',
    category: null,
    visibility: options.visibility ?? 'public',
    mediaMode: 'image',
    contestantSchema: options.contestantSchema ?? [],
    endsAt: options.endsAt ?? null,
  });
}

export async function makeContestant(
  db: Kysely<Database>,
  warId: string,
  name: string,
  attributes: Record<string, unknown> = {},
): Promise<Contestant> {
  return createContestant(db, { warId, name, bio: null, attributes });
}

async function syntheticJpeg(width = 1200, height = 900): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 80, b: 200 } } }).jpeg().toBuffer();
}

export async function giveContestantAnImage(
  db: Kysely<Database>,
  storage: ObjectStorage,
  contestantId: string,
): Promise<void> {
  const buffer = await syntheticJpeg();
  const outcome = await uploadContestantImage(db, storage, {
    contestantId,
    buffer,
    mimeType: 'image/jpeg',
    originalExt: 'jpg',
  });
  if (!outcome.ok) {
    throw new Error(`failed to seed contestant image: ${outcome.reason}`);
  }
}

/** Builds a War with `count` contestants, each with one image, still in draft. */
export async function makeDraftWarWithContestants(
  db: Kysely<Database>,
  storage: ObjectStorage,
  creatorId: string,
  count: number,
  options: DraftWarOptions = {},
): Promise<{ war: War; contestants: Contestant[] }> {
  const war = await makeDraftWar(db, creatorId, options);
  const contestants: Contestant[] = [];
  for (let i = 0; i < count; i += 1) {
    const contestant = await makeContestant(db, war.id, `Contestant ${i + 1}`);
    await giveContestantAnImage(db, storage, contestant.id);
    contestants.push(contestant);
  }
  return { war, contestants };
}

/** Activates a War as its creator, generating matchups. Throws if activation is rejected. */
export async function activateWarForTest(db: Kysely<Database>, war: War): Promise<War> {
  const outcome = await activateWar(db, war.id, war.creatorId!, new Date());
  if (outcome.kind !== 'ok') {
    throw new Error(`failed to activate War in test fixture: ${outcome.kind}`);
  }
  return outcome.value;
}

export async function joinWarAsVoter(db: Kysely<Database>, warId: string, voterId: string): Promise<void> {
  await createMembership(db, warId, voterId);
}
