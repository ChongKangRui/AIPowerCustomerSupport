# Tech Stack

## Core
- Next.js 16 (App Router) + TypeScript
  - Next.js 16 renames Middleware to **Proxy** — the root file is `proxy.ts` exporting `proxy()`, not `middleware.ts`. Same functionality.
- Tailwind CSS 4

## Database & ORM
- PostgreSQL, hosted on **Neon** (free tier)
- Prisma ORM

## Auth
- Auth.js v5 (`next-auth@beta`), **database session strategy** — confirmed: session lookups against the DB (`@auth/prisma-adapter`), not JWT-encoded cookies
- Roles: Admin, Agent (per `project-scope.md`)
- **Login is credentials (email + password), implemented manually — not via the Credentials provider.** Auth.js throws `UnsupportedStrategy` if a Credentials provider is configured without `session: { strategy: "jwt" }`, which would break the database-session decision above. So `auth.ts` registers no providers; a Server Action verifies the bcrypt hash on `User.passwordHash`, then creates the `Session` row through the adapter and sets the session cookie itself. `auth()` reads sessions normally from there.

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
