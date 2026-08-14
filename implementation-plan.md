# Implementation Plan

Reference `project-scope.md` for product decisions and `tech-stack.md` for stack decisions. This file breaks the build into phases of small, sequential tasks.

**Priority:** Phases 0–3 are core — foundations, auth/roles, real email ingestion, and manageable tickets. That's a working product on its own. Phases 4–7 (AI, notifications, dashboard, polish) are lower priority — build in order, but they're where scope gets trimmed first if time runs short.

---

## Phase 0 — Foundations
Goal: empty-but-deployed skeleton, DB connected, auth working, nothing product-specific yet.

- [x] Draft initial Prisma schema: `User` (role: ADMIN/AGENT), `Account`/`Session` (Auth.js tables), `Ticket`, `TicketMessage`, `KnowledgeBaseEntry`, `EmailSyncState`
- [x] Create Neon Postgres project, get connection string
- [x] Wire Prisma to Neon, run first migration (Prisma 7 + `@prisma/adapter-pg` driver adapter; client generated to `lib/generated/prisma`, gitignored)
- [x] Set up `.env.example` documenting every env var the project will need (fill in as later phases add more)
- [x] Install and configure Auth.js with `@auth/prisma-adapter`, database session strategy (`auth.ts`, `app/api/auth/[...nextauth]/route.ts`)
- [x] Build a minimal login page (credentials: email + password, simplest for a single-org demo) — `app/login/page.tsx` + `app/login/login-form.tsx` (React Hook Form + Zod), plus "Demo agent"/"Demo admin" buttons that autofill seeded credentials for quick testing
  - Password verification + `Session` row creation is hand-rolled via Route Handlers (`app/api/login`, `app/api/logout`), not a Server Action or the Credentials provider — the Credentials provider can't be used alongside database sessions. See `tech-stack.md` → Auth.
- [x] Seed script: create one Admin user + one Agent user (`prisma/seed.ts`, `npm run db:seed`, `SEED_ADMIN_*`/`SEED_AGENT_*` env vars)
- [x] Add Tailwind CSS 4 + shadcn/ui component library (`components/ui/`, `components.json`) as the UI foundation
- [x] Add TanStack Query (`app/providers.tsx`) as the client-side data layer, with an SSR-safe `QueryClient` pattern
- [x] Structured logging (Pino, `lib/logger.ts`) + shared `withApiHandler` Route Handler wrapper (`lib/api-handler.ts`) for consistent request logging/error responses across API routes; client-side `apiClient` (axios, `lib/api-client.ts`) unwraps those error responses
- [x] `/api/health-check` route + `/health-check` page for a basic liveness check
- [x] Playwright e2e setup: `playwright.config.ts` boots `next dev` on a separate port (3100, own `distDir` too — see `tech-stack.md` → Testing gotchas) against a dedicated test database; `e2e/global-setup.ts` creates that database if needed and resets+reseeds it (`prisma migrate reset --force` + explicit `prisma db seed`) before every run. Auth spec coverage (login, logout, session/route-protection redirects, open-redirect guard) written via the `e2e-test-writer` subagent — see `e2e/*.spec.ts`. `npm run test:e2e`.
- [x] Vitest unit test setup: `vitest.config.mts` (jsdom + React Testing Library installed for later component tests), co-located `*.test.ts` convention — see `tech-stack.md` → Testing for the three interop gotchas (next-auth/`next/server` resolution, Prisma-at-import, `*.spec.ts` glob collision with Playwright). First pass covers pure logic only: `lib/safe-redirect.ts`, `models/auth.model.ts`, `lib/utils.ts`, `lib/api-handler.ts`'s `HttpError` hierarchy. `npm run test`.
- [x] Second pass: React Testing Library component tests (`*.test.tsx`, same `npm run test`) for client-side/presentational behavior that was previously only exercised via a full e2e round trip — `app/login/login-form.test.tsx` (client-side validation, demo-account autofill), `components/users/user-form-dialog.test.tsx` (validation + pre-fill for both create/edit modes), `components/users/users-view.test.tsx` (search/role-filter wiring), `components/tickets/tickets-table.test.tsx` (Unassigned/customer-name rendering). `apiClient`/`next/navigation` are mocked rather than hit for real, wrapped in a fresh `QueryClient` per test. The corresponding e2e tests in `e2e/login.spec.ts`, `e2e/admin-create-user.spec.ts`, `e2e/admin-edit-user.spec.ts`, `e2e/users.spec.ts`, `e2e/tickets.spec.ts` were trimmed to drop what's now redundant, keeping only the paths that genuinely need a real login/DB round trip (success, 409/403 conflicts, server-verified state like "password really unchanged").
- [x] Deploy skeleton to Vercel, confirm build + DB connection work end-to-end in production early (de-risks deployment issues later)

---

## Phase 1 — Auth, Roles & User Management
Goal: Admin/Agent access control and admin-only user management, building on Phase 0's login.

- [x] Admin-only page access control: optimistic cookie-presence check in `proxy.ts` (can't know the role without a DB call — database session strategy means the session cookie carries no role claim), authoritative role check + redirect done DB-side in the page itself (pattern established in `/users` — `app/(main)/users/page.tsx`). Deliberately not done in `proxy.ts` itself — Next.js's own docs (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`) call for optimistic-only checks there, warning that DB reads on every matched request (including prefetches) cause performance issues. No dedicated `/admin/*` route exists; that matcher entry in `proxy.ts` is currently unused.
- [x] Server Action/query scoping: agents only see tickets assigned to them; admins see all (`GET /api/tickets`, `app/api/tickets/route.ts` — `where: { assignedToId: session.user.id }` for agents, no filter for admins; the sole authoritative enforcement point, no page-level role check)
- [x] Admin UI: list users (`/users` page + `GET /api/users`, admin-only, client-side search/role filter — see `components/users/users-view.tsx`) — edit role still pending
- [x] Admin UI: create/invite an agent (`POST /api/users`, admin-only — "New user" modal in `components/users/create-user-dialog.tsx`, always creates role `AGENT`; validation shared via `models/user.model.ts`)
- [x] Admin UI: edit a user's name/email/password (`PATCH /api/users/[id]`, admin-only — edit icon per row in `components/users/users-table.tsx` opens `components/users/edit-user-dialog.tsx`, sharing form UI with the create dialog via `components/users/user-form-dialog.tsx`; password left unchanged when blank; validation via `models/user.model.ts`'s `updateUserSchema`) — role is still not editable from this form, that remains a separate future action
- [x] Admin UI: soft-delete a user (`DELETE /api/users/[id]`, admin-only — sets `User.deletedAt` rather than removing the row, so historical `Ticket`/`TicketMessage` references stay intact; Admins can never be deleted (403 `ForbiddenError`); force-invalidates the deleted user's sessions via `destroyAllUserSessions` in `lib/session.ts`; delete icon per row in `components/users/users-table.tsx` opens `components/users/delete-user-dialog.tsx`'s confirmation `AlertDialog`) — `User.email` stays permanently `@unique` (deliberate: an email is reserved forever once used, even after the row is deleted); only login and the admin list filter on `deletedAt`, create/edit's conflict checks don't
- [x] Session-revocation/logout redirect hardening: `app/(main)/layout.tsx` now does its own `auth()` check (redirects to `/login`) on top of `proxy.ts`'s cheap cookie-presence check, closing the gap where a cookie survives but its `Session` row doesn't (revoked by an admin, expired) — previously such a page just silently rendered a logged-out-looking fallback instead of leaving; `components/navbar.tsx` (client-side) redirects the instant `useCurrentUser()` resolves to no user while mounted, and forces a re-check via `router.refresh()` on bfcache restore (`pageshow`/`persisted`), mirroring `app/login/login-form.tsx`'s existing pattern in the opposite direction. Logout also switched `router.push` → `router.replace` so the just-left protected page's history entry can't be reached via Back.
- [x] Rate limiting / brute-force protection on `/api/login`: `rate-limiter-flexible`'s `RateLimiterPrisma` (`lib/rate-limiter.ts`), backed by the existing Neon Postgres DB via a new `RateLimiterFlexible` model — no Redis needed. Two limiters (mirrors the library's own documented login-protection recipe): 5 consecutive fails per email+IP → 15 min block; 50 fails per IP per day → 24h block. Wired into `app/api/login/route.ts` (pre-check via `get()`, `consume()` on failure, `delete()` on success so a legitimate user's later success clears their count). See `tech-stack.md` → Auth for the `tableName` gotcha this surfaced.
- [x] Confirm `middleware.ts` (already present in repo) is repurposed for this route protection rather than left over from scaffolding — replaced by `proxy.ts` (Next.js 16 renamed Middleware to Proxy). Currently an optimistic session-cookie check only; role enforcement still to be added in the pages/Server Actions.

---

## Phase 2 — Gmail API Integration
Goal: real emails become tickets in the DB, and the app can reply back into the same Gmail thread. (Moved here from `tech-stack.md` — see that file's Email section for the high-level decision/rationale.)

### Google Cloud / OAuth setup (one-time, manual, in Google Cloud Console)
- [x] Create a dedicated Gmail account for the demo 
- [x] Create a Google Cloud project (e.g. `ai-support-demo`)
- [x] Enable the Gmail API (APIs & Services → Library)
- [x] Configure OAuth consent screen: External user type, app name/support email, scope `gmail.modify`, add the demo Gmail account as a test user, leave app in **Testing** mode
- [x] Create OAuth client ID (Web application type), temporarily set redirect URI to `https://developers.google.com/oauthplayground`
- [x] Get a refresh token via OAuth Playground: use your own client ID/secret, authorize with the demo Gmail account, exchange for tokens, copy the refresh token
- [x] Store `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER` in `.env` and Vercel project settings
- [x] Generate and store `CRON_SECRET` (random string) for securing the poll endpoint

### Code
- [x] `npm install googleapis`
- [x] `lib/gmail.ts` — OAuth2 client + `gmail` instance (refresh-token flow, plain module-level singleton per `lib/gmail.ts`'s header comment — no hot-reload guard needed, it just wraps an HTTP client)
- [x] Implement `EmailSyncState` read/write helpers (`getLastHistoryId`/`updateLastHistoryId`, upsert on `id: "gmail"`)
- [x] One-time bootstrap: `bootstrapHistoryId()` calls `gmail.users.getProfile` to get the starting `historyId`, stores it (idempotent — no-ops if already bootstrapped; deliberately does NOT backfill old mail, just anchors "from now on")
- [x] Build `pollGmailAndCreateTickets()`: pages `gmail.users.history.list` since last `historyId` → fetches each new message (`messages.get`) → decodes headers/MIME body (`parseGmailMessage`/`extractBodyText`, prefers `text/plain`, falls back to raw `text/html`) — watermark only advances once the whole poll succeeds, so a partial failure safely re-covers the same window next run
- [x] Map inbound message → ticket: new `gmailThreadId` creates a `Ticket` + `TicketMessage`; known `threadId` appends a `TicketMessage` to the existing ticket (`processMessage()` in `lib/gmail.ts`). Idempotency check (`TicketMessage.gmailMessageId` lookup) before even calling `messages.get`; Prisma unique-constraint catch (`P2002`) as a concurrency backstop; self-sent mail (`SENT` label or `From === GMAIL_USER`) and messages that 404 on fetch (e.g. Gmail Chat entries in the history stream) are skipped, not fatal
- [x] Manual test entrypoint `scripts/poll-gmail.ts` (`npm run gmail:poll`) since the cron route doesn't exist yet — verified against the real demo inbox: bootstrap, new-ticket creation, and the 404-skip path all confirmed working end-to-end. `lib/gmail.ts` currently still has some "TEMP DEBUG" console logging (search for that marker) left in on purpose for inbox/MIME exploration — to be stripped before this phase is considered fully done
- [ ] Build `sendGmailReply()`: construct raw MIME message with `In-Reply-To`/`References` headers, send via `gmail.users.messages.send` with `threadId`
- [ ] Route Handler `app/api/cron/poll-gmail/route.ts` — checks `Authorization: Bearer $CRON_SECRET`, calls `pollGmailAndCreateTickets()`
- [ ] Register a free scheduled job on cron-job.org hitting the deployed poll endpoint every 1–2 min
- [ ] End-to-end test: send a real email to the demo inbox → confirm a `Ticket` is created; send a reply from the app → confirm it appears threaded in Gmail (read half spot-checked manually via `gmail:poll`; still need the same-thread-append and no-op-idempotency re-poll checks, plus the send half once `sendGmailReply()` exists)

---

## Phase 3 — Ticket Core: Data, List, Detail, Lifecycle
Goal: tickets are fully manageable by a human, independent of AI.

- [x] Finalize `Ticket` status enum: `OPEN`, `RESOLVED`, `CLOSED`
- [x] Ticket list page: table, role-scoped (`/tickets` page + `GET /api/tickets` — see `components/tickets/*`, `hooks/use-tickets.ts`)
- [x] Server-side sorting (subject/status/createdAt) + pagination (fixed 20/page), synced to the URL (`?page=&sortBy=&sortDir=`) — `models/ticket.model.ts` (shared Zod query schema + sortBy allow-list), `app/api/tickets/route.ts`, `components/tickets/use-tickets-table.tsx` (TanStack Table v9), `components/ui/data-table.tsx` (generic rendering shell shared with `UsersTable`)
- [x] Server-side status filter + debounced subject search, synced to the URL (`?status=&q=`, both omitted at their "no filter" default) — same query schema/route as above; search input debounces 700ms via `hooks/use-debounced-value.ts` before it ever reaches the URL/API, so typing doesn't fire a request per keystroke. Assigned-agent filtering is still a separate, later increment
- [x] Ticket detail page: full conversation thread (all `TicketMessage`s in order) — `/tickets/[id]` page + `GET /api/tickets/[id]`, role-scoped same as the list route (see `components/tickets/ticket-detail-view.tsx`, `hooks/use-ticket.ts`); subject on the list page links here (`components/tickets/use-tickets-table.tsx`)
- [x] Manual agent actions on ticket detail: mark Resolved, mark Closed (permanent) — `PATCH /api/tickets/[id]` (`ALLOWED_TRANSITIONS` allow-list), `hooks/use-update-ticket-status.ts`
- [ ] Manual agent reply on ticket detail, sent as a real outbound email — blocked on `sendGmailReply()` (Phase 2, MIME + `In-Reply-To`/`References` threading) not existing yet; see Phase 2's e2e-test todo above
- [ ] Lifecycle rule: customer reply to a `RESOLVED` ticket → reopen to `OPEN`, notify/assign a human
- [ ] Resolved-ticket closing message template: must state that replying reopens the ticket and signals dissatisfaction
- [ ] Lifecycle rule: customer reply to a `CLOSED` ticket → ignore + send automated "ticket closed, submit a new request" bounce, no new ticket created
- [ ] Wire these lifecycle rules into the Gmail inbound handler from Phase 2 (an inbound message on an existing thread must check the ticket's current status before deciding what to do)

---

## Phase 4 — AI Integration (Gemini)
_Lower priority — see note at top._
Goal: Path A (full auto-resolve) and Path B (human draft + AI rephrase) both working, plus summarization.

- [x] Install Vercel AI SDK (`ai`, `@ai-sdk/google`) — still need to store `GEMINI_API_KEY`
- [ ] Seed `KnowledgeBaseEntry` table with ~10–20 FAQ/policy entries
- [ ] Build Path A function: `generateObject` call with KB stuffed into context, schema `{ confident: boolean, response: string }`
- [ ] Wire Path A into the inbound ticket flow: new ticket → run confidence check → if confident, send AI reply via `sendGmailReply`, mark ticket `RESOLVED`
- [ ] Build round-robin assignment function for escalated (non-confident) tickets
- [ ] Wire Path B trigger: not confident → assign via round robin → notify agent (stub for now, real notification in Phase 5)
- [ ] Ticket detail UI: agent draft textarea + "Rephrase with AI" button using `streamText`
- [ ] Ticket summarization: `generateObject` producing `{ summary, category, sentiment }`, displayed on ticket detail
- [ ] Decide and document: does summarization run once at ticket creation/escalation, or on-demand from the UI? (flagged as open in earlier review — resolve here)

---

## Phase 5 — Notifications
_Lower priority — see note at top._
Goal: an agent knows when a ticket lands on their desk.

- [ ] In-app notification indicator (e.g. badge/list) for newly assigned tickets
- [ ] Email notification via Gmail API (non-threaded send) on assignment
- [ ] Wire both into the Phase 4 round-robin assignment step

---

## Phase 6 — Dashboard & Analytics
_Lower priority — see note at top._
Goal: the "Dashboard to view and manage all tickets" feature, with the agreed fallback path.

- [ ] Baseline: ticket list/queue + basic counts (open/resolved/closed, AI-resolved vs human-resolved) — ship this first regardless
- [ ] Decide charting library: Tremor vs shadcn/ui charts
- [ ] Chart: resolution time
- [ ] Chart: AI-resolved vs human-resolved rate over time
- [ ] Chart: ticket volume trend
- [ ] Checkpoint: if charts are eating too much time, stop at the baseline counts version — that satisfies the feature on its own

---

## Phase 7 — Polish, QA & Deployment
_Lower priority — see note at top._
Goal: everything demoable end-to-end.

- [ ] Full QA pass: Path A auto-resolve, Path B escalation + rephrase, reopen-on-reply, closed-ticket bounce
- [ ] Env var audit in Vercel production settings (all Gmail/Gemini/DB/auth secrets present)
- [ ] Confirm cron-job.org is pointed at the production poll endpoint, not localhost
- [ ] Write README: architecture overview, key decisions, screenshots — this is a portfolio piece, so the write-up matters as much as the code
- [ ] Final production deploy
