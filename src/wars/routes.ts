import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { requireAuth } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { presentWarDetail, presentWarSummary } from './warPresenter.js';
import { activateWar, closeWar, createWarForVoter, getWar, joinWar, patchWar } from './warsService.js';
import { closeExpiredWars, listWars } from './warsRepository.js';

export interface WarsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  publicBaseUrl: string;
  internalTaskToken: string;
}

function mapMutationError(kind: string, reply: { code: (n: number) => { send: (body?: unknown) => unknown } }, errors?: string[]) {
  switch (kind) {
    case 'notFound':
      return reply.code(404).send({ error: 'not found' });
    case 'forbidden':
      return reply.code(403).send({ error: 'forbidden' });
    case 'notDraft':
      return reply.code(403).send({ error: 'War is no longer editable' });
    case 'notActive':
      return reply.code(403).send({ error: 'War is not active' });
    case 'validationError':
      return reply.code(422).send({ error: 'validation error', details: errors });
    default:
      return reply.code(500).send({ error: 'internal error' });
  }
}

export function registerWarsRoutes(app: FastifyInstance, deps: WarsRouteDeps): void {
  const { db, auth } = deps;

  app.get<{ Querystring: { status?: string; category?: string; cursor?: string; limit?: string } }>(
    '/wars',
    async (request, reply) => {
      const limit = Math.min(Number(request.query.limit ?? 20) || 20, 100);
      const wars = await listWars(db, {
        status: request.query.status,
        category: request.query.category,
        cursor: request.query.cursor,
        limit,
      });
      const now = new Date();
      return reply.send({ wars: wars.map((war) => presentWarSummary(war, now)) });
    },
  );

  app.post('/wars', { preHandler: requireAuth(auth) }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const outcome = await createWarForVoter(db, {
      creatorId: request.voterId!,
      title: body.title as string,
      category: (body.category as string | null | undefined) ?? null,
      visibility: body.visibility as string | undefined,
      mediaMode: body.media_mode as string | undefined,
      contestantSchema: body.contestant_schema,
      endsAt: body.ends_at as string | null | undefined,
    });

    if (outcome.kind === 'validationError') {
      return reply.code(422).send({ error: 'validation error', details: outcome.errors });
    }
    return reply.code(201).send(presentWarSummary(outcome.war, new Date()));
  });

  app.get<{ Params: { id: string } }>('/wars/:id', async (request, reply) => {
    const lookup = await getWar(db, request.params.id);
    if (lookup.kind === 'notFound') {
      return reply.code(404).send({ error: 'not found' });
    }
    const detail = await presentWarDetail(db, lookup.war, new Date(), deps.publicBaseUrl);
    return reply.send(detail);
  });

  app.patch<{ Params: { id: string } }>('/wars/:id', { preHandler: requireAuth(auth) }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const outcome = await patchWar(
      db,
      request.params.id,
      request.voterId!,
      {
        title: body.title as string | undefined,
        category: body.category as string | null | undefined,
        visibility: body.visibility as string | undefined,
        contestantSchema: body.contestant_schema,
        endsAt: body.ends_at as string | null | undefined,
      },
      new Date(),
    );

    if (outcome.kind !== 'ok') {
      return mapMutationError(outcome.kind, reply, 'errors' in outcome ? outcome.errors : undefined);
    }
    return reply.send(presentWarSummary(outcome.value, new Date()));
  });

  app.post<{ Params: { id: string } }>('/wars/:id/activate', { preHandler: requireAuth(auth) }, async (request, reply) => {
    const outcome = await activateWar(db, request.params.id, request.voterId!, new Date());
    if (outcome.kind !== 'ok') {
      return mapMutationError(outcome.kind, reply, 'errors' in outcome ? outcome.errors : undefined);
    }
    return reply.send(presentWarSummary(outcome.value, new Date()));
  });

  app.post<{ Params: { id: string } }>('/wars/:id/close', { preHandler: requireAuth(auth) }, async (request, reply) => {
    const outcome = await closeWar(db, request.params.id, request.voterId!, new Date());
    if (outcome.kind !== 'ok') {
      return mapMutationError(outcome.kind, reply);
    }
    return reply.send(presentWarSummary(outcome.value, new Date()));
  });

  app.post<{ Params: { id: string } }>('/wars/:id/join', { preHandler: requireAuth(auth) }, async (request, reply) => {
    const outcome = await joinWar(db, request.params.id, request.voterId!, new Date());
    if (outcome.kind !== 'ok') {
      return mapMutationError(outcome.kind, reply);
    }
    return reply.code(204).send();
  });

  app.post('/internal/close-expired-wars', async (request, reply) => {
    const token = request.headers['x-internal-token'];
    if (token !== deps.internalTaskToken) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const closed = await closeExpiredWars(db, new Date());
    return reply.send({ closed });
  });
}
