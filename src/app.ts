import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import packageJson from '../package.json' with { type: 'json' };
import type { Database } from './db/types.js';
import type { AuthDependencies } from './auth/authService.js';
import type { GoogleAuthProvider } from './auth/googleProvider.js';
import { registerAuthRoutes } from './auth/routes.js';
import type { ObjectStorage } from './contestants/storage.js';
import { registerContestantsRoutes } from './contestants/routes.js';
import { registerMatchupsRoutes } from './matchups/routes.js';
import { registerOpenApiPlugin } from './openapi/plugin.js';
import { registerOpenApiRoutes } from './openapi/routes.js';
import { registerRankingsRoutes } from './rankings/routes.js';
import { registerWarsRoutes } from './wars/routes.js';
import type { AppConfig } from './config.js';

export interface AppDeps {
  db: Kysely<Database>;
  google: GoogleAuthProvider;
  storage: ObjectStorage;
  config: AppConfig;
}

const API_PREFIX = '/api/v1';
const API_TITLE = 'War API';

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cookie);
  await app.register(cors, { origin: deps.config.uiOrigins, credentials: true });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  // Registered before any route so its onRoute hook observes every one of
  // them, including those added inside nested, prefixed plugins below.
  await registerOpenApiPlugin(app, API_PREFIX, { title: API_TITLE, version: packageJson.version });

  // App Platform's health_check (platform/{env}.yaml in war-infra) polls
  // this exact path. No auth, no dependencies — a check that the process is
  // up and answering HTTP, nothing more.
  app.get(`${API_PREFIX}/health`, async () => ({ status: 'ok' }));

  const authDeps: AuthDependencies = {
    db: deps.db,
    google: deps.google,
    jwt: { secret: deps.config.jwtSecret, issuer: deps.config.jwtIssuer },
  };

  await app.register(
    async (instance) => {
      registerOpenApiRoutes(instance);
      registerAuthRoutes(instance, authDeps, {
        uiOrigins: deps.config.uiOrigins,
        googleRedirectUri: deps.config.google.redirectUri,
      });
      registerWarsRoutes(instance, {
        db: deps.db,
        auth: authDeps,
        publicBaseUrl: deps.config.s3.publicBaseUrl,
        internalTaskToken: deps.config.internalTaskToken,
      });
      registerContestantsRoutes(instance, {
        db: deps.db,
        auth: authDeps,
        storage: deps.storage,
        publicBaseUrl: deps.config.s3.publicBaseUrl,
      });
      registerMatchupsRoutes(instance, { db: deps.db, auth: authDeps, publicBaseUrl: deps.config.s3.publicBaseUrl });
      registerRankingsRoutes(instance, { db: deps.db, auth: authDeps, publicBaseUrl: deps.config.s3.publicBaseUrl });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
