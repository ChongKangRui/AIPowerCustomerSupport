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

  // Drops and recreates the schema, reapplies every migration, then reseeds
  // (prisma.config.ts wires `migrate reset`'s seed step to prisma/seed.ts) —
  // deterministic starting state for every test run. --skip-generate: the
  // client is already generated (postinstall), no schema-shape change here.
  execSync("npx prisma migrate reset --force --skip-generate", {
    stdio: "inherit",
    env,
  });
}
