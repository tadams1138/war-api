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
  });
}
