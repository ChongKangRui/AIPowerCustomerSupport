# Tech Stack

## Core
- Next.js 16 (App Router) + TypeScript
  - Next.js 16 renames Middleware to **Proxy** — the root file is `proxy.ts` exporting `proxy()`, not `middleware.ts`. Same functionality.
- Tailwind CSS 4 + **shadcn/ui** (built on `radix-ui` primitives, `class-variance-authority` for variants) — component library lives in `components/ui/`; `components.json` holds the shadcn config
- **TanStack Query** (`@tanstack/react-query`) — client-side data fetching/caching layer, wired once in `app/providers.tsx`
  - SSR-safe pattern: a fresh `QueryClient` per server render (`environmentManager.isServer()`), one persistent `QueryClient` reused for the life of the browser tab — see that file's comments for why
- **React Hook Form + Zod** (`@hookform/resolvers`) for form state/validation — see `models/*.model.ts` for schemas, `app/login/login-form.tsx` for the pattern

## Database & ORM
- PostgreSQL, hosted on **Neon** (free tier)
- Prisma ORM

## Auth
- Auth.js v5 (`next-auth@beta`), **database session strategy** — confirmed: session lookups against the DB (`@auth/prisma-adapter`), not JWT-encoded cookies
- Roles: Admin, Agent (per `project-scope.md`)
- **Login is credentials (email + password), implemented manually — not via the Credentials provider.** Auth.js throws `UnsupportedStrategy` if a Credentials provider is configured without `session: { strategy: "jwt" }`, which would break the database-session decision above. So `auth.ts` registers no providers; hand-rolled Route Handlers (`app/api/login`, `app/api/logout`) verify the bcrypt hash on `User.passwordHash` and create/delete the `Session` row directly (`lib/session.ts`), setting/clearing the same cookie name Auth.js's own database strategy expects (`lib/session-cookie.ts`, kept dependency-free so the Edge-runtime `proxy.ts` can import it too). `auth()` reads sessions normally from there.
- `proxy.ts` (Edge) does a cheap **cookie-presence-only** redirect gate for protected routes — no DB lookup there (Edge can't bundle `pg`). Real, DB-verified checks happen per-page/route via `auth()` (Server Components/Route Handlers) or client-side via `useCurrentUser()` (a TanStack Query hook hitting Auth.js's own `/api/auth/session` endpoint). Role-based route protection (e.g. admin-only pages) isn't wired into `proxy.ts` yet — see Phase 1 in `implementation-plan.md`.
- Demo login: `prisma/seed.ts` seeds one Admin + one Agent account (`SEED_ADMIN_*`/`SEED_AGENT_*` env vars, defaults documented in `.env.example`); the login page has "Demo agent"/"Demo admin" buttons that autofill those credentials — `app/login/page.tsx` (a Server Component) reads the same `SEED_*` vars directly and passes them down as props to `LoginForm`, no `NEXT_PUBLIC_` duplicate needed. Intentionally left unguarded by `NODE_ENV` — this is a portfolio project, not a real business app, so a one-click demo login in production is acceptable.
- Rate limiting on `/api/login`: **`rate-limiter-flexible`'s `RateLimiterPrisma`** (`lib/rate-limiter.ts`), backed by the existing Neon Postgres DB via the existing `PrismaClient` — no Redis/new infra needed. Uses a `RateLimiterFlexible` model (`key`, `points`, `expire`) added to `prisma/schema.prisma`. Deliberately not `RateLimiterMemory`: Vercel serverless functions are ephemeral/multi-instance, so in-process state wouldn't be shared across invocations and the limiter would silently under-count. `/api/login` has no `runtime = "edge"` export (unlike `proxy.ts`), so it can use Prisma directly with no Edge-compatibility conflict.
  - **Gotcha #1:** `RateLimiterPrisma`'s default `tableName` option is the literal string `'RateLimiterFlexible'` (PascalCase, matching the schema model name) — but Prisma's generated client always camelCases the model into a client property (`prisma.rateLimiterFlexible`), so the default silently resolved to `prisma["RateLimiterFlexible"]` (`undefined`) and threw on every call. Fixed by explicitly passing `tableName: "rateLimiterFlexible"`.
  - **Gotcha #2:** the pre-check in `app/api/login/route.ts` originally used `remainingPoints === 0` to decide "already blocked." That's true as soon as `consumedPoints` merely *reaches* the limit (e.g. 5/5) — one attempt *before* the library's own block logic (inside `consume()`) actually fires. That let the pre-check intercept the boundary attempt itself, before `consume()` ever ran, so the record never got a chance to either block properly or expire and reset — it just sat at its original (pre-block) expiry indefinitely. Fixed by checking `consumedPoints > limit` (strictly over) instead, matching the library's own semantics.
  - Two limiters, keyed separately (mirrors the library's own documented login-protection recipe), with deliberately different lifetimes:
    - `limiterConsecutiveFailsByEmailAndIp` — 5 fails per email+IP → blocked. Short-lived on purpose: `duration` (the failure-count "memory" window) is set equal to `blockDuration` (currently 1 min), so a real account's failure count is never remembered any longer than the block itself lasts, and fully clears once that window passes — confirmed end-to-end (6th attempt → 429 with `Retry-After: 60`; the next attempt after that 60s window → back to a normal 401, not still blocked). A successful login also `.delete()`s the counter immediately, so a real user who mistypes a password a couple times isn't penalized once they get it right.
    - `limiterSlowBruteByIp` — 50 fails per IP per day → blocked for 24h. Deliberately long-lived and never reset on success (an IP isn't a person — it's fine to punish a suspect machine for a full day; it wouldn't be fine to do that to one person's account, which is why the email-keyed limiter above resets quickly instead).
  - **Production-only:** `RATE_LIMITING_ENABLED` (`lib/rate-limiter.ts`, gated on `NODE_ENV === "production"`, same convention as `lib/prisma.ts`'s dev singleton) skips all limiter reads/writes outside production. `app/api/login/route.ts` checks it before touching either limiter at all, so local dev and Playwright e2e runs never trip a 429 from repeated manual/test logins, and never write to the `RateLimiterFlexible` table outside prod.
  - See Phase 1 in `implementation-plan.md`.

## Logging & API conventions
- **Pino** (`lib/logger.ts`) — structured JSON logging in production (Vercel's log viewer parses it natively); piped through the `pino-pretty` CLI as a separate process in dev (`npm run dev`) rather than a Pino transport, to avoid a known Pino-worker-thread/Next.js bundling conflict
- Every Route Handler is wrapped in `withApiHandler` (`lib/api-handler.ts`): gives it a request-scoped child logger, a shared try/catch (throw `HttpError` subclasses — `BadRequestError`, `UnauthorizedError`, `NotFoundError`, etc. — for a specific status/message; a Zod validation error becomes 400 automatically; anything else becomes a generic 500), and an `x-request-id` response header
- Client side: a shared `apiClient` (axios, `lib/api-client.ts`) unwraps `withApiHandler`'s `{ error }` JSON into a plain `Error`, so `useMutation`/`useQuery` call sites just read `error.message`

## AI
- **Google Gemini API** (free tier via Google AI Studio)
- Accessed through the **Vercel AI SDK** (`ai` package + `@ai-sdk/google` adapter) rather than calling Gemini's SDK directly — provider-agnostic call sites, easy to swap later
  - `generateObject` — structured output for Path A confidence decision (`{ confident, response }`) and ticket summarization (`{ summary, category, sentiment }`)
  - `streamText` — Path B rephrase draft streamed into the agent UI
  - Model split: Gemini Flash-Lite for cheap/fast tasks (confidence check, summarization), Gemini 2.5 Flash for quality-sensitive generation (customer-facing replies, rephrasing)

## Email
- **Gmail API (`googleapis`)** — handles both inbound and outbound, against a dedicated demo Gmail account. Decided against Mailgun: Mailgun needs a domain with MX/TXT records, and a genuinely free subdomain with the DNS control Mailgun requires isn't realistically achievable (see setup guide below for why).
  - Inbound: polling via `gmail.users.history.list` (incremental sync using a stored `historyId`), triggered externally.
  - Outbound: same Gmail account sends customer replies (Path A/B, threaded via `threadId`) **and** internal agent notification emails.
  - Polling trigger: an external free scheduled-ping service (e.g. **cron-job.org**, free, down to 1-minute intervals) hits a secret-protected Next.js Route Handler (`/api/cron/poll-gmail`) on Vercel. This avoids deploying a separate always-on worker (Railway/Fly.io) — no second hosting target needed.

## Testing
- **Playwright** (`@playwright/test`) for e2e — config only so far, no specs written yet (see Phase 0 in `implementation-plan.md`)
- Runs against a **dedicated test database**, never dev/production: `playwright.config.ts`'s `webServer` boots `next dev` on port 3100 with `DATABASE_URL` overridden for that one process; `e2e/global-setup.ts` creates the test DB if it doesn't exist yet, then `prisma migrate reset --force` (schema + seed) before every run, so each run starts from the same known state
- Resolution lives in `lib/database-url.ts` (`resolveTestDatabaseUrl`/`resolveTestDatabaseName`/`resolveMaintenanceDatabaseUrl`), mirroring `resolveDatabaseUrl`'s precedence: `DATABASE_URL_TEST` (e.g. a dedicated Neon test branch) wins outright, otherwise built from the same local `DB_HOST`/`DB_USER`/`DB_PASSWORD` pieces against `DB_NAME_TEST` (default `${DB_NAME}_test`)
- `npm run test:e2e` / `npm run test:e2e:ui`

## Hosting
- **Vercel** — Next.js app

## Dashboard
- Charting library: **Tremor or shadcn/ui charts** — still open, decide when building that screen. Both pair with Tailwind; Tremor leans toward ready-made dashboard components, shadcn charts (built on Recharts) leans toward more manual composition but matches if shadcn/ui is already used elsewhere in the UI.

---

## Open items / things to confirm before or during build

1. **Dashboard charting library** — Tremor vs shadcn/ui charts, still open (see above).
2. **Need internal notification email sending too** — Gmail API handles customer-facing threads well, but sending a one-off "you've been assigned" email to an agent from the same account works fine as well (just a non-threaded send via the same client) — no second email service needed, noting this so it isn't assumed forgotten.
3. **`historyId` persistence** — the polling logic needs somewhere to store the last-seen Gmail `historyId` between runs (a small table, e.g. `EmailSyncState`) so restarts/concurrent triggers don't reprocess or miss messages.

> Step-by-step Gmail API setup (Google Cloud config, OAuth token, polling code, send code, cron trigger) now lives in `implementation-plan.md` (Phase 1), as build tasks rather than reference material.
