import "dotenv/config";
import { execSync } from "node:child_process";

import { Client } from "pg";

import {
  resolveMaintenanceDatabaseUrl,
  resolveTestDatabaseName,
  resolveTestDatabaseUrl,
} from "../lib/database-url";

// Postgres error code for "database already exists" — see
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const POSTGRES_DUPLICATE_DATABASE = "42P04";

/**
 * `CREATE DATABASE` for the test database itself, if it doesn't exist yet.
 * Connects to Postgres's default `postgres` maintenance database to do it —
 * you can't create a database while connected to it. One-time/idempotent:
 * safe to run on every test run once the database exists.
 */
async function ensureTestDatabaseExists() {
  const dbName = resolveTestDatabaseName();
  if (!dbName) {
    // DATABASE_URL_TEST points at an already-provisioned database (e.g. a
    // dedicated Neon test branch) — nothing for us to create.
    return;
  }

  const client = new Client({ connectionString: resolveMaintenanceDatabaseUrl() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`[e2e] created test database "${dbName}"`);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== POSTGRES_DUPLICATE_DATABASE) {
      throw error;
    }
  } finally {
    await client.end();
  }
}

/**
 * Runs once before the whole Playwright suite (wired via `globalSetup` in
 * playwright.config.ts). Points a dedicated test database at the current
 * migrations + seed data so every run starts from the same known state,
 * entirely separate from dev/production data — see tech-stack.md and
 * lib/database-url.ts for the DATABASE_URL_TEST / DB_NAME_TEST resolution.
 */
export default async function globalSetup() {
  await ensureTestDatabaseExists();

  const env = { ...process.env, DATABASE_URL: resolveTestDatabaseUrl() };

  // Drops and recreates the schema, then reapplies every migration.
  //
  // Prisma 7 no longer runs `generate` or the configured seed script
  // automatically as part of `migrate reset` — both used to be implicit
  // in older Prisma CLIs. (--skip-generate used to opt out of the former
  // and is no longer a valid flag at all, which is why it's gone from the
  // call below.)
  //
  // The client is already generated (postinstall), so nothing to do
  // there. But seeding is no longer implicit, so run it explicitly right
  // after, so the test DB still ends up in the same deterministic seeded
  // state every run.
  execSync("npx prisma migrate reset --force", { stdio: "inherit", env });
  execSync("npx prisma db seed", { stdio: "inherit", env });
}
