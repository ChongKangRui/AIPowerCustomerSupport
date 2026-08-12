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
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  const user = process.env.DB_USER ?? "postgres";
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME ?? "CustomerSupportDB";

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
