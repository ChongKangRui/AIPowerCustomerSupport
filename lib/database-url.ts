// This file resolves the Postgres connection string Prisma uses.
// In production (Vercel + Neon), `DATABASE_URL` is set directly and wins
// as-is. Locally, the code below builds the URL from separate
// DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME pieces instead.

// Why not just write `DATABASE_URL="postgresql://postgres:$DB_PASSWORD@..."`
// in .env? Next.js's env loader expands `$VAR` references like that (see
// "Referencing Other Variables" in its env docs). The Prisma CLI
// (`prisma migrate dev`, `prisma studio`, `db:seed`) loads .env through
// plain `dotenv` instead, and `dotenv` does NOT expand `$VAR`.
//
// That mismatch breaks the connection string under the Prisma CLI. It
// would work under `next dev`, but DB_PASSWORD would end up in the URL
// as the literal four characters `$DB_PASSWORD` everywhere else.
//
// Building the URL here in code avoids that problem. Both
// prisma.config.ts and lib/prisma.ts call this function instead of
// reading `process.env.DATABASE_URL` directly.
//
// resolveDatabaseUrl and resolveTestDatabaseUrl below both call this
// function, so the credential handling (and its error message) lives in
// one place.
function buildLocalUrl(database: string): string {
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  const user = process.env.DB_USER ?? "postgres";
  const password = process.env.DB_PASSWORD;

  if (!password) {
    throw new Error(
      "No database configured: set DATABASE_URL (production), or DB_PASSWORD " +
        "(+ optionally DB_HOST/DB_PORT/DB_USER/DB_NAME) for local Postgres — see .env.example."
    );
  }

  // encodeURIComponent stops special characters (@, :, /) in the password from breaking the URL.
  const credentials = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgresql://${credentials}@${host}:${port}/${database}`;
}

// Returns DATABASE_URL as-is if it is set (production). Otherwise falls
// back to the local URL built by buildLocalUrl above.
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  return buildLocalUrl(process.env.DB_NAME ?? "CustomerSupportDB");
}

/**
 * Resolves the connection string for the separate database Playwright
 * e2e tests use. See playwright.config.ts and e2e/global-setup.ts. Tests
 * never touch dev or production data.
 *
 * - Uses the same precedence rule as `DATABASE_URL` in resolveDatabaseUrl.
 * - Builds the URL from the same local DB_HOST/DB_PORT/DB_USER/DB_PASSWORD
 *   pieces.
 */
export function resolveTestDatabaseUrl(): string {
  if (process.env.DATABASE_URL_TEST) {
    return process.env.DATABASE_URL_TEST;
  }

  return buildLocalUrl(resolveTestDatabaseName());
}

/**
 * The test database name. Used by the one-time "does it exist yet" check
 * in e2e/global-setup.ts.
 *
 * This always builds the name from DB_NAME. It does not check whether
 * `DATABASE_URL_TEST` is set.
 */
export function resolveTestDatabaseName(): string {
  return `${process.env.DB_NAME ?? "CustomerSupportDB"}_test`;
}

/**
 * Connection string for Postgres's default `postgres` maintenance
 * database.
 *
 * Used only to run `CREATE DATABASE` for the test database itself. You
 * cannot create a database while connected to it. Built from local
 * pieces only. Not meaningful when `DATABASE_URL_TEST` points at an
 * already-provisioned cloud database.
 */
export function resolveMaintenanceDatabaseUrl(): string {
  return buildLocalUrl("postgres");
}
