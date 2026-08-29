import path from 'node:path';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Database } from '../../src/db/types.js';

let container: StartedPostgreSqlContainer | undefined;
let db: Kysely<Database> | undefined;
let pool: pg.Pool | undefined;

/**
 * Connects tests to Postgres: `DATABASE_URL` when set (CI's postgres:16-alpine
 * service), otherwise a local Testcontainers Postgres (spec §12). Migrations
 * run once per test process via the same `node-pg-migrate` runner `npm run
 * migrate` uses, against `db/migrations`.
 */
export async function getTestDb(): Promise<Kysely<Database>> {
  if (db) {
    return db;
  }

  const connectionString = process.env.DATABASE_URL ?? (await startContainer());

  await runner({
    databaseUrl: connectionString,
    dir: path.resolve(process.cwd(), 'db/migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

  pool = new pg.Pool({ connectionString });
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return db;
}

async function startContainer(): Promise<string> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  return container.getConnectionUri();
}

/** Wipes all domain tables between scenarios so each test starts from a clean slate. */
export async function truncateAll(): Promise<void> {
  const instance = await getTestDb();
  await sql`TRUNCATE TABLE votes, war_memberships, matchups, contestant_media, contestants, refresh_tokens, wars, voters RESTART IDENTITY CASCADE`.execute(
    instance,
  );
}

export async function closeTestDb(): Promise<void> {
  await db?.destroy();
  await pool?.end();
  await container?.stop();
  db = undefined;
  pool = undefined;
  container = undefined;
}
