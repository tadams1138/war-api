import type { Kysely } from 'kysely';
import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config.js';
import type { Database } from '../../src/db/types.js';
import { FakeGoogleAuthProvider } from './fakeGoogleProvider.js';
import { InMemoryObjectStorage } from './fakeStorage.js';
import { testConfig } from './testApp.js';

export interface NoDbHarness {
  app: Awaited<ReturnType<typeof buildApp>>;
  config: AppConfig;
}

/**
 * Builds the app without a real database connection. Only scenarios that
 * never touch a data-dependent route may use this: the generated OpenAPI
 * document depends solely on which routes got registered and their JSON
 * Schemas, never on data, so it needs no Postgres/Testcontainers dependency.
 */
export async function buildAppWithoutDb(): Promise<NoDbHarness> {
  const config = testConfig();
  const google = new FakeGoogleAuthProvider();
  const storage = new InMemoryObjectStorage(config.s3.publicBaseUrl);
  const db = {} as unknown as Kysely<Database>;

  const app = await buildApp({ db, google, storage, config });
  return { app, config };
}
