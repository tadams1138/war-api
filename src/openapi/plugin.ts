import swagger from '@fastify/swagger';
import type { FastifyInstance } from 'fastify';

export interface OpenApiInfo {
  title: string;
  version: string;
}

/**
 * Registers @fastify/swagger so the OpenAPI document is generated from the
 * routes' own JSON Schemas rather than hand-maintained (spec §11.2). Must
 * be registered before any routes so its `onRoute` hook observes every one
 * of them, including those added inside nested, prefixed plugins.
 *
 * Takes `info` from its caller rather than sourcing it itself, so this
 * module holds no configuration of its own (spec §11.2: info.title and
 * info.version are present, but where they come from is `app.ts`'s call).
 */
export async function registerOpenApiPlugin(app: FastifyInstance, apiPrefix: string, info: OpenApiInfo): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info,
      servers: [{ url: apiPrefix }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    // @fastify/swagger otherwise names components.schemas entries
    // positionally ("def-0", "def-1", ...) by registration order, ignoring
    // each schema's own `$id` -- so the shared MediaItem/ResolvedAttribute/
    // WarSummary/ContestantDetail schemas (registerSharedSchemas,
    // src/openapi/schemas.ts) would publish as unnameable, order-dependent
    // keys. Preferring `$id` keeps the published component names stable and
    // meaningful; falls back to the positional name for any schema with no
    // `$id` of its own.
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, i) => String(json.$id ?? `def-${i}`),
    },
  });
}
