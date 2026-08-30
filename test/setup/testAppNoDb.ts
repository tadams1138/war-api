import type { Kysely } from 'kysely';
import { buildApp } from '../../src/app.js';
import type { Database } from '../../src/db/types.js';
import { buildCommonDeps } from './testApp.js';

export interface NoDbHarness {
  app: Awaited<ReturnType<typeof buildApp>>;
}

/**
 * A `db` that throws a clear, immediate error the moment anything touches
 * it, rather than failing later with an opaque "x is not a function" three
 * layers away from the real cause. Every property access -- not just calls
 * -- goes through this, so `db.selectFrom` itself throws before it ever
 * gets the chance to be called.
 */
function unusableDb(): Kysely<Database> {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      throw new Error(
        `buildAppWithoutDb() has no database; '${String(prop)}' was accessed. Use buildTestHarness() for data-dependent scenarios.`,
      );
    },
  };
  return new Proxy({}, handler) as unknown as Kysely<Database>;
}

/**
 * Builds the app without a real database connection. Only scenarios that
 * never touch a data-dependent route may use this: the generated OpenAPI
 * document depends solely on which routes got registered and their JSON
 * Schemas, never on data, so it needs no Postgres/Testcontainers dependency.
 */
export async function buildAppWithoutDb(): Promise<NoDbHarness> {
  const { config, google, storage } = buildCommonDeps();
  const app = await buildApp({ db: unusableDb(), google, storage, config });
  return { app };
}
