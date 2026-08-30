import swagger from '@fastify/swagger';
import type { FastifyInstance } from 'fastify';

const API_TITLE = 'War API';
// Kept in step with package.json's "version" field (spec §11.2: info.version
// must be present; this project has no automated release-version pipeline
// yet, so it is not derived from package.json at build time).
const API_VERSION = '0.1.0';

/**
 * Registers @fastify/swagger so the OpenAPI document is generated from the
 * routes' own JSON Schemas rather than hand-maintained (spec §11.2). Must
 * be registered before any routes so its `onRoute` hook observes every one
 * of them, including those added inside nested, prefixed plugins.
 */
export async function registerOpenApiPlugin(app: FastifyInstance, apiPrefix: string): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: API_TITLE, version: API_VERSION },
      servers: [{ url: apiPrefix }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });
}
