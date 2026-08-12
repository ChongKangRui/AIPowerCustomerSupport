/**
 * Resolves the Postgres connection string Prisma should use.
 *
 * - Production (Vercel + Neon): `DATABASE_URL` is set directly and wins as-is.
 * - Local development: built here from DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/
 *   DB_NAME instead of embedding the password inside a single DATABASE_URL
 *   string.
 *
 * Why not just write `DATABASE_URL="postgresql://postgres:$DB_PASSWORD@..."`
 * in .env? Next.js's own env loader expands `$VAR` references like that
 * (see "Referencing Other Variables" in its env docs), but the Prisma CLI
 * (`prisma migrate dev`, `prisma studio`, `db:seed`) loads .env itself via
 * plain `dotenv`, which does NOT expand `$VAR` — the connection string would
 * work under `next dev` and silently break under every Prisma CLI command
 * (DB_PASSWORD would end up literally in the URL as the four characters
 * `$DB_PASSWORD`). Building the URL here in code sidesteps that inconsistency
 * entirely: both prisma.config.ts and lib/prisma.ts call this function
 * instead of reading `process.env.DATABASE_URL` directly.
 */
// Builds a local Postgres connection string from the DB_HOST/DB_PORT/DB_USER/
// DB_PASSWORD pieces, pointed at whichever `database` name is passed in.
// Shared by resolveDatabaseUrl and resolveTestDatabaseUrl below so the
// credential-handling (and its error message) only lives in one place.
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

  // encodeURIComponent so a password containing @, :, / etc. doesn't corrupt the URL.
  const credentials = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgresql://${credentials}@${host}:${port}/${database}`;
}

export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  return buildLocalUrl(process.env.DB_NAME ?? "CustomerSupportDB");
}

/**
 * Same resolution as resolveDatabaseUrl, but for the separate database
 * Playwright e2e tests run against (see playwright.config.ts + e2e/global-setup.ts)
 * so tests never touch dev/production data.
 *
 * - same precedence rule as `DATABASE_URL` in resolveDatabaseUrl.
 * - built from the same local DB_HOST/DB_PORT/DB_USER/DB_PASSWORD
 *   
 */
export function resolveTestDatabaseUrl(): string {
  if (process.env.DATABASE_URL_TEST) {
    return process.env.DATABASE_URL_TEST;
  }

  return buildLocalUrl(resolveTestDatabaseName());
}

/**
 * The test database's name, for the one-time "does it exist yet" check in
 * e2e/global-setup.ts. Returns null when `DATABASE_URL_TEST` is set directly —
 * in that case we don't know (or need to know) the database name, and assume
 * whatever it points to has already been provisioned.
 */
export function resolveTestDatabaseName(): string {
  return `${process.env.DB_NAME ?? "CustomerSupportDB"}_test`;
}

/**
 * Connection string for Postgres's default `postgres` maintenance database —
 * used only to run `CREATE DATABASE` for the test database itself (you can't
 * create a database while connected to it). Local pieces only; not meaningful
 * when `DATABASE_URL_TEST` points at an already-provisioned cloud database.
 */
export function resolveMaintenanceDatabaseUrl(): string {
  return buildLocalUrl("postgres");
}
