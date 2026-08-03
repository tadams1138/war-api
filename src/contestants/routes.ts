import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { requireAuth } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import type { ObjectStorage } from './storage.js';
import { addContestant, patchContestant, removeContestant } from './contestantsService.js';
import { addContestantImage, reorderContestantMedia, removeContestantMedia } from './mediaService.js';
import { findWarById } from '../wars/warsRepository.js';
import { presentContestant } from './contestantPresenter.js';

export interface ContestantsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  storage: ObjectStorage;
  publicBaseUrl: string;
}

function mapError(kind: string, reply: FastifyReply, errors?: string[]) {
  switch (kind) {
    case 'notFound':
      return reply.code(404).send({ error: 'not found' });
    case 'forbidden':
      return reply.code(403).send({ error: 'forbidden' });
    case 'notDraft':
      return reply.code(403).send({ error: 'War is no longer editable' });
    case 'validationError':
      return reply.code(422).send({ error: 'validation error', details: errors });
    default:
      return reply.code(500).send({ error: 'internal error' });
  }
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

export function registerContestantsRoutes(app: FastifyInstance, deps: ContestantsRouteDeps): void {
  const { db, auth } = deps;

  app.post<{ Params: { id: string } }>(
    '/wars/:id/contestants',
    { preHandler: requireAuth(auth) },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const outcome = await addContestant(
        db,
        {
          warId: request.params.id,
          voterId: request.voterId!,
          name: body.name as string,
          bio: body.bio as string | null | undefined,
          attributes: body.attributes as Record<string, unknown> | undefined,
        },
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return mapError(outcome.kind, reply, 'errors' in outcome ? outcome.errors : undefined);
      }
      const war = await findWarById(db, request.params.id);
      const view = await presentContestant(db, outcome.value, war!, deps.publicBaseUrl);
      return reply.code(201).send(view);
    },
  );

  app.patch<{ Params: { id: string; cId: string } }>(
    '/wars/:id/contestants/:cId',
    { preHandler: requireAuth(auth) },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const outcome = await patchContestant(
        db,
        request.params.id,
        request.params.cId,
        request.voterId!,
        {
          name: body.name as string | undefined,
          bio: body.bio as string | null | undefined,
          attributes: body.attributes as Record<string, unknown> | undefined,
        },
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return mapError(outcome.kind, reply, 'errors' in outcome ? outcome.errors : undefined);
      }
      const war = await findWarById(db, request.params.id);
      const view = await presentContestant(db, outcome.value, war!, deps.publicBaseUrl);
      return reply.send(view);
    },
  );

  app.delete<{ Params: { id: string; cId: string } }>(
    '/wars/:id/contestants/:cId',
    { preHandler: requireAuth(auth) },
    async (request, reply) => {
      const outcome = await removeContestant(db, request.params.id, request.params.cId, request.voterId!, new Date());
      if (outcome.kind !== 'ok') {
        return mapError(outcome.kind, reply);
      }
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string; cId: string } }>(
    '/wars/:id/contestants/:cId/images',
    { preHandler: requireAuth(auth) },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(422).send({ error: 'no file uploaded' });
      }
      const buffer = await file.toBuffer();
      const outcome = await addContestantImage(
        db,
        deps.storage,
        {
          warId: request.params.id,
          contestantId: request.params.cId,
          voterId: request.voterId!,
          buffer,
          mimeType: file.mimetype,
          originalExt: extensionFor(file.mimetype),
        },
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return mapError(outcome.kind, reply, 'errors' in outcome ? outcome.errors : undefined);
      }
      return reply.code(201).send({
        id: outcome.value.id,
        display_order: outcome.value.displayOrder,
      });
    },
  );

  app.patch<{ Params: { id: string; cId: string; mId: string } }>(
    '/wars/:id/contestants/:cId/media/:mId',
    { preHandler: requireAuth(auth) },
    async (request, reply) => {
      const body = request.body as { display_order?: number };
      const outcome = await reorderContestantMedia(
        db,
        request.params.id,
        request.params.cId,
        request.params.mId,
        request.voterId!,
        body.display_order ?? 0,
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return mapError(outcome.kind, reply);
      }
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string; cId: string; mId: string } }>(
    '/wars/:id/contestants/:cId/media/:mId',
    { preHandler: requireAuth(auth) },
    async (request, reply) => {
      const outcome = await removeContestantMedia(
        db,
        request.params.id,
        request.params.cId,
        request.params.mId,
        request.voterId!,
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return mapError(outcome.kind, reply);
      }
      return reply.code(204).send();
    },
  );
}
