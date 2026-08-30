import type { FastifyInstance } from 'fastify';
import { mediaItemSchema } from '../contestants/mediaPresenter.js';
import { resolvedAttributeSchema } from '../contestants/schemaValidation.js';
import { contestantDetailSchema } from '../contestants/contestantPresenter.js';
import { warSummarySchema } from '../wars/warPresenter.js';

/**
 * Registers the four `$id`-bearing response body schemas the Core Voting
 * Loop slice shares across routes (spec §11.2.1) so route schemas can
 * `$ref` them by name. Must run before any route registration that
 * references them (mirrors `registerOpenApiPlugin`'s own ordering
 * requirement -- both are called from `src/app.ts` before any route).
 *
 * Each schema itself lives beside the presenter/view interface it mirrors
 * (`mediaItemSchema` in `mediaPresenter.ts`, etc.), not here: this module's
 * only responsibility is wiring them into Fastify's schema registry, not
 * defining what they contain.
 */
export function registerSharedSchemas(app: FastifyInstance): void {
  app.addSchema(mediaItemSchema);
  app.addSchema(resolvedAttributeSchema);
  app.addSchema(warSummarySchema);
  app.addSchema(contestantDetailSchema);
}
