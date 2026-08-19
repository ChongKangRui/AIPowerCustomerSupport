# AI-Powered Customer Support Platform

An internal support desk for a single company that turns real customer emails into tickets, then lets AI resolve the easy ones automatically and hands the rest to a human agent — with AI helping that agent write the reply too. Built end-to-end: real Gmail ingestion, threaded email replies, an AI resolution pipeline with two distinct paths, role-based ticket management, in-app notifications, and an admin analytics dashboard.

**Live Demo:** [ai-power-customer-support.vercel.app](https://ai-power-customer-support.vercel.app)

The login page has one-click **"Demo admin"** / **"Demo agent"** buttons — no sign-up needed, just click and explore.

Want to see the full loop end-to-end? Send an email to **`customersupporttest4@gmail.com`** — the demo support inbox — and watch it land as a new ticket in the dashboard (AI-resolved automatically, or escalated to an agent, depending on what you ask).

> If AI resolution doesn't seem to trigger, it's most likely the Gemini free-tier daily quota being exhausted (this project runs on a free API key — see [What I Learned](#what-i-learned)) rather than a bug. The ticket still gets created and escalated to an agent either way, so the core flow still works — this should rarely, if ever, actually happen at this demo's traffic level.

---

## Features

### Ticket Management

- **Real email ingestion** — a Gmail inbox is polled on a schedule; each inbound email becomes a new `Ticket`, or appends to an existing one if it's a reply on an open thread
- **Threaded replies** — an agent's reply goes out as a real email in the same Gmail thread (correct `Message-ID`/`References` chaining, not just a matching subject line)
- **Ticket list** — server-side sort, filter, search and pagination, synced to the URL; agents see only their own assigned tickets, admins see everything
- **Ticket detail** — full conversation thread, status controls, assignment, and reply composer
- **Lifecycle automation** — an automated email fires on Resolve/Close; a customer reply to a `Resolved` ticket reopens it and routes back to a human automatically; a `Closed` ticket is a terminal dead end

### AI Resolution (Google Gemini)

- **Path A — full auto-resolve**: checks a small knowledge base against the inquiry; if confident, replies to the customer directly and closes the loop with no human involved
- **Path B — escalate + assign**: not confident → the ticket is auto-assigned to the least-loaded agent (round-robin by current workload)
- **"Rephrase with AI"** — once an agent drafts a reply, one click rewrites it into a standard, professional tone, **streamed live** into the textarea as it generates
- Structured output (`generateObject`) for the confidence decision, streaming (`streamText`) for the rephrase — via the [Vercel AI SDK](https://sdk.vercel.ai/), not a direct provider SDK, so the model call sites stay provider-agnostic

### Admin

- **User management** — create/deactivate agents, role-scoped, soft-delete (a deleted agent's ticket history stays intact)
- **Bulk ticket assignment** — select multiple open tickets and assign them in one action
- **Analytics dashboard** — six stat cards plus three trend charts (resolution time, AI-vs-agent resolution rate, ticket volume) over a rolling 6-month window

### Platform / Infrastructure

- **Auth** — Auth.js v5, **database session strategy** (revocable server-side, not a self-verifying JWT), with a hand-rolled bcrypt credentials flow layered underneath it
- **Rate limiting** — Postgres-backed login brute-force protection (`rate-limiter-flexible`), no Redis needed
- **In-app notifications** — polling-based, with unread badges and toast alerts for new assignments and replies
- **Structured logging** — every API request gets a request-scoped Pino logger with a correlating `x-request-id`
- **Security hardening** — HTML sanitization on Gmail's HTML-only fallback, email header-injection stripping on outbound mail, and Next.js-native security headers
- **Testing** — Vitest + React Testing Library for logic/components, Playwright for real auth/session/access-control flows against a dedicated, auto-seeded test database
- **CI** — GitHub Actions runs the full test suite against a real Postgres service container on every push/PR to `main`
- **Dockerized dev environment** — one command spins up Postgres + the app together, pre-seeded with demo accounts

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, TanStack Query, TanStack Table v9, React Hook Form + Zod |
| UI | Tailwind CSS 4, shadcn/ui (Radix UI primitives), Recharts (via shadcn charts), Sonner (toasts) |
| Database & ORM | PostgreSQL (hosted on [Neon](https://neon.tech)), Prisma ORM 7 (driver adapters) |
| Auth | Auth.js v5 (`next-auth@beta`), database session strategy, bcrypt |
| AI | Google Gemini, via the [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` + `@ai-sdk/google`) |
| Email | Gmail API (`googleapis`) — polling for inbound, raw RFC 2822 for outbound |
| Logging | Pino — structured JSON in production, `pino-pretty` in dev |
| Rate Limiting | `rate-limiter-flexible`, Postgres-backed |
| Validation | Zod — shared schemas between client and server |
| Testing | Playwright (e2e) · Vitest + React Testing Library (unit/component) |
| CI/CD | GitHub Actions |
| Containerization | Docker (dev environment) |
| Deployment | Vercel (app) · Neon (database) |

---

## Project Structure

```
ai-power-customer-support-application/
├── app/
│   ├── (main)/            # Pages behind login — layout.tsx requires a valid session
│   │   ├── tickets/        # List + detail views
│   │   ├── users/          # Admin-only user management
│   │   └── dashboard/       # Admin-only analytics
│   ├── api/                # Every backend endpoint, one route.ts per resource
│   │   ├── cron/            # Bearer-secret-protected Gmail poll, for an external scheduler
│   │   └── gmail/poll/       # Session-authenticated Gmail poll, for the in-app auto-sync
│   └── login/               # The one page outside (main), since you're not logged in yet
├── components/
│   ├── tickets/ , users/    # One folder per feature
│   └── ui/                  # shadcn/ui primitives + a shared data-table shell
├── hooks/                   # One TanStack Query hook per server interaction
├── models/                  # Zod schemas + API "wire shape" types, shared client/server
├── lib/                     # Infrastructure: Prisma client, Gmail client, Gemini client,
│                             #   sessions, withApiHandler, logging, rate limiting
├── prisma/                  # schema.prisma + seed scripts
├── e2e/                     # Playwright specs
├── compose.yml              # Docker Compose: Postgres + app, one command
└── proxy.ts                 # Edge-runtime auth gate (Next.js 16's renamed Middleware)
```

---

## Getting Started

### Prerequisites

| Tool | Needed for |
| --- | --- |
| [Node.js](https://nodejs.org/) & npm | Both setup paths |
| [Docker](https://www.docker.com/) | Docker setup path (recommended) |
| [PostgreSQL](https://www.postgresql.org/) | Local machine setup path |
| A Gmail account + [Google Cloud](https://console.cloud.google.com/) OAuth credentials | Email ingestion/sending (optional — the app runs fine without it, just with no live inbox) |
| A [Google AI Studio](https://aistudio.google.com/) API key | AI auto-resolve/rephrase (optional, same caveat as above) |

### 1. Clone the repo

```bash
git clone https://github.com/ChongKangRui/AIPowerCustomerSupport.git
cd AIPowerCustomerSupport
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

`.env.example` is heavily commented — every variable explains where to get it and why it's needed. The essentials to get a working login:

| Variable | Description |
| --- | --- |
| `DB_PASSWORD` | Local Postgres password (Docker path fills this into the container too) |
| `AUTH_SECRET` | Session signing secret — generate with `npx auth secret` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Demo admin login, also what the "Demo admin" button autofills |
| `SEED_AGENT_EMAIL` / `SEED_AGENT_PASSWORD` | Demo agent login |

Everything else (`GMAIL_*`, `GEMINI_API_KEY`, `CRON_SECRET`) is only needed for the Gmail/AI features — the app runs and logs in fine without them.

Now pick **one** of the two setups below.

### Option A — Docker (recommended)

One command builds and starts Postgres + the app together, running migrations and seeding the two demo accounts automatically on every start.

```bash
docker compose up
```

- App → [http://localhost:3000](http://localhost:3000)
- Postgres → `localhost:5433` (mapped from container port `5432`)

Demo accounts are seeded automatically; demo **ticket** data isn't (yet) — seed it manually after the app container is up:

```bash
docker compose exec app npm run db:seed:tickets
```

### Option B — Local machine

1. Install PostgreSQL locally and make sure it's running.
2. Install dependencies (also runs `prisma generate` via `postinstall`):
   ```bash
   npm install
   ```
3. Run migrations and seed demo data:
   ```bash
   npm run db:migrate
   npm run db:seed
   npm run db:seed:tickets   # optional — demo ticket data
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
   → [http://localhost:3000](http://localhost:3000)

---

## Testing

`npm run test` (Vitest) needs nothing beyond `npm install`. `npm run test:e2e` (Playwright) needs its browser binary installed first — a one-time step, not covered by `npm install`:

```bash
npx playwright install --with-deps chromium
```

Then:

```bash
npm run test        # Vitest — pure logic + component tests, no DB required
npm run test:e2e    # Playwright — real browser/server/DB flows
```

`test:e2e` also needs a reachable Postgres (local or Docker, same as the app itself) — it runs against a **dedicated test database**, entirely isolated from dev data, automatically created, reset and reseeded before every run — see `e2e/global-setup.ts`.

---

## Deployment

| Part | Platform |
| --- | --- |
| App | [Vercel](https://vercel.com) |
| Database | [Neon](https://neon.tech) (serverless Postgres) |

The app reads a single `DATABASE_URL` in production instead of the local `DB_HOST`/`DB_USER`/etc. pieces — set `DATABASE_URL` (Neon's **pooled** connection string) on Vercel. Leave `AUTH_URL` unset in Vercel — Auth.js reads the real request's protocol/host from Vercel's own proxy headers, which is more reliable than hardcoding it. Gmail polling in production runs on two triggers layered together: a 60s client-side poll while someone has the app open, plus an external scheduled ping (e.g. [cron-job.org](https://cron-job.org)) hitting a bearer-secret-protected route as a backstop for when nobody does.

---

## What I Learned

**Third-Party API Integration**
- Integrating the **Gmail API** for both directions of a real inbox: incremental polling via `history.list` with a persisted watermark, idempotent message processing safe against overlapping polls, and hand-building raw RFC 2822 email so replies thread correctly (`Message-ID`/`References`/`In-Reply-To` all have to agree, or Gmail silently starts a new conversation instead of erroring)
- Integrating **Google Gemini** through the Vercel AI SDK for two different shapes of AI output — structured JSON (`generateObject`) for a confidence decision, and token streaming (`streamText`) piped live into a UI textarea — and designing prompts to fail safely (a flaky/empty AI response degrades to human escalation, never a broken ticket state)

**Next.js Full-Stack Fundamentals**
- Building on **Next.js 16's App Router** from scratch — Server Components, Route Handlers as the one write path (no Server Actions, one consistent pattern everywhere), and its renamed Middleware (**Proxy**)
- Implementing **Auth.js v5** with a **database session strategy** instead of JWT — and specifically *why*: a DB-backed session can be revoked instantly server-side (soft-deleting a user kills their session immediately), which a self-verifying JWT can't do without a denylist
- Modeling a real **Prisma** schema and its query layer for a role-scoped, multi-status domain (ticket lifecycle, assignment, soft deletes) — including Prisma 7's newer driver-adapter setup

**Backend Robustness**
- **Structured logging** with Pino — a request-scoped logger with correlating request IDs, wired through one shared API-handler wrapper so every route gets consistent error handling for free
- **Rate limiting** without Redis — `rate-limiter-flexible` backed by the existing Postgres DB, correctly accounting for why Vercel's ephemeral serverless functions rule out in-memory limiting
- **Defensive input handling**: sanitizing Gmail's HTML-only fallback against stored XSS, stripping CRLF from outbound email headers to close an email-header-injection path, and length-capping AI-bound content to bound cost against a free-tier quota — none of these were "given," all found by asking "what happens with a hostile or malformed input here?"

**Testing & Delivery**
- Splitting coverage deliberately between **Vitest** (pure logic, component behavior — fast, no server) and **Playwright** (auth, session revocation, access control — things that only mean something against a real browser/server/DB), instead of defaulting everything to slow e2e specs
- Setting up **GitHub Actions** CI against a real Postgres service container, and a Dockerized local dev environment that boots Postgres + the app together with one command

---

## Development Process

Built solo, working with **[Claude Code](https://claude.com/claude-code)** as an AI pair-engineer throughout — architecture and stack decisions, feature implementation, debugging production issues and code review. Every design decision and trade-off in this README and the project's internal docs reflects a call I made and understood, not something generated blind — the value of the tool here was moving faster with a second set of eyes, not skipping the thinking.

---

## License

MIT — see [LICENSE](./LICENSE).
