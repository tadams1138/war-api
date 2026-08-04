import type { FastifyReply } from 'fastify';
import type { Forbidden, NotActive, NotDraft, NotFound, ValidationError } from './outcomes.js';

/** Every non-'ok' outcome kind a domain service in this codebase returns. */
export type HttpFailure = NotFound | Forbidden | NotDraft | NotActive | ValidationError;

/**
 * Maps a failed `MutationOutcome` (or any of the bespoke unions built from
 * the same failure variants) to its HTTP response. Takes the whole outcome
 * so it reads `errors` itself — callers no longer repeat
 * `'errors' in outcome ? outcome.errors : undefined` — and switches on the
 * discriminated union with a `never`-typed default, so an outcome kind this
 * function does not yet handle is a compile error rather than a silent 500
 * (design review finding 7).
 */
export function replyForOutcome(reply: FastifyReply, outcome: HttpFailure): FastifyReply {
  switch (outcome.kind) {
    case 'notFound':
      return reply.code(404).send({ error: 'not found' });
    case 'forbidden':
      return reply.code(403).send({ error: 'forbidden' });
    case 'notDraft':
      return reply.code(403).send({ error: 'War is no longer editable' });
    case 'notActive':
      return reply.code(403).send({ error: 'War is not active' });
    case 'validationError':
      return reply.code(422).send({ error: 'validation error', details: outcome.errors });
    default: {
      const exhaustive: never = outcome;
      throw new Error(`unhandled outcome kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
