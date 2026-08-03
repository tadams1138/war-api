import type { Kysely } from 'kysely';
import { buildApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config.js';
import { signAccessToken } from '../../src/auth/jwt.js';
import type { Database } from '../../src/db/types.js';
import { FakeGoogleAuthProvider } from './fakeGoogleProvider.js';
import { InMemoryObjectStorage } from './fakeStorage.js';
import { getTestDb } from './testDb.js';

export function testConfig(): AppConfig {
  return loadConfig({
    UI_ORIGINS: 'https://app.test',
    JWT_SECRET: 'test-jwt-secret',
    INTERNAL_TASK_TOKEN: 'test-internal-token',
    S3_PUBLIC_BASE_URL: 'https://cdn.test',
    GOOGLE_REDIRECT_URI: 'https://api.test/api/v1/auth/google/callback',
  } as NodeJS.ProcessEnv);
}

export interface TestHarness {
  app: Awaited<ReturnType<typeof buildApp>>;
  db: Kysely<Database>;
  google: FakeGoogleAuthProvider;
  storage: InMemoryObjectStorage;
  config: AppConfig;
  jwtFor: (voterId: string) => Promise<string>;
}

export async function buildTestHarness(): Promise<TestHarness> {
  const db = await getTestDb();
  const config = testConfig();
  const google = new FakeGoogleAuthProvider();
  const storage = new InMemoryObjectStorage(config.s3.publicBaseUrl);

  const app = await buildApp({ db, google, storage, config });

  return {
    app,
    db,
    google,
    storage,
    config,
    jwtFor: (voterId: string) => signAccessToken(voterId, { secret: config.jwtSecret, issuer: config.jwtIssuer }),
  };
}
