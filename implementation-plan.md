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
- [ ] Build a minimal login page (credentials: email + password, simplest for a single-org demo)
  - Password verification + `Session` row creation is a hand-rolled Server Action — the Credentials provider can't be used alongside database sessions. See `tech-stack.md` → Auth.
- [x] Seed script: create one Admin user (`prisma/seed.ts`, `npm run db:seed`)
- [ ] Deploy skeleton to Vercel, confirm build + DB connection work end-to-end in production early (de-risks deployment issues later)

---

## Phase 1 — Auth, Roles & User Management
Goal: Admin/Agent access control and admin-only user management, building on Phase 0's login.

- [ ] Route/middleware protection: admin-only pages (`/admin/*`) vs agent pages
- [ ] Server Action/query scoping: agents only see tickets assigned to them; admins see all
- [ ] Admin UI: list users, create/invite an agent, edit role
- [x] Confirm `middleware.ts` (already present in repo) is repurposed for this route protection rather than left over from scaffolding — replaced by `proxy.ts` (Next.js 16 renamed Middleware to Proxy). Currently an optimistic session-cookie check only; role enforcement still to be added in the pages/Server Actions.

---

## Phase 2 — Gmail API Integration
Goal: real emails become tickets in the DB, and the app can reply back into the same Gmail thread. (Moved here from `tech-stack.md` — see that file's Email section for the high-level decision/rationale.)

### Google Cloud / OAuth setup (one-time, manual, in Google Cloud Console)
- [ ] Create a dedicated Gmail account for the demo (not your personal inbox)
- [ ] Create a Google Cloud project (e.g. `ai-support-demo`)
- [ ] Enable the Gmail API (APIs & Services → Library)
- [ ] Configure OAuth consent screen: External user type, app name/support email, scope `gmail.modify`, add the demo Gmail account as a test user, leave app in **Testing** mode
- [ ] Create OAuth client ID (Web application type), temporarily set redirect URI to `https://developers.google.com/oauthplayground`
- [ ] Get a refresh token via OAuth Playground: use your own client ID/secret, authorize with the demo Gmail account, exchange for tokens, copy the refresh token
- [ ] Store `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER` in `.env` and Vercel project settings
- [ ] Generate and store `CRON_SECRET` (random string) for securing the poll endpoint

### Code
- [x] `npm install googleapis`
- [ ] `lib/gmail.ts` — OAuth2 client + `gmail` instance
- [ ] Implement `EmailSyncState` read/write helpers (get/update stored `historyId`)
- [ ] One-time bootstrap: call `gmail.users.getProfile` to get the starting `historyId`, store it
- [ ] Build `pollGmailAndCreateTickets()`: `gmail.users.history.list` since last `historyId` → fetch each new message → decode headers/body
- [ ] Map inbound message → ticket: new sender/thread creates a `Ticket` + `TicketMessage`; known `threadId` appends a `TicketMessage` to the existing ticket
- [ ] Build `sendGmailReply()`: construct raw MIME message with `In-Reply-To`/`References` headers, send via `gmail.users.messages.send` with `threadId`
- [ ] Route Handler `app/api/cron/poll-gmail/route.ts` — checks `Authorization: Bearer $CRON_SECRET`, calls `pollGmailAndCreateTickets()`
- [ ] Register a free scheduled job on cron-job.org hitting the deployed poll endpoint every 1–2 min
- [ ] End-to-end test: send a real email to the demo inbox → confirm a `Ticket` is created; send a reply from the app → confirm it appears threaded in Gmail

---

## Phase 3 — Ticket Core: Data, List, Detail, Lifecycle
Goal: tickets are fully manageable by a human, independent of AI.

- [ ] Finalize `Ticket` status enum: `OPEN`, `RESOLVED`, `CLOSED`
- [ ] Ticket list page: table with filtering (status, assigned agent) and sorting
- [ ] Ticket detail page: full conversation thread (all `TicketMessage`s in order)
- [ ] Manual agent actions on ticket detail: reply, mark Resolved, mark Closed (permanent)
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
