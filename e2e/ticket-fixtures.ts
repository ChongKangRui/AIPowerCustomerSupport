import "dotenv/config";

import crypto from "node:crypto";

import { Client } from "pg";

import { resolveTestDatabaseUrl } from "@/lib/database-url";

import { AGENT } from "./seeded-users";

// There's no ticket-creation UI or API (tickets are Gmail-inbound only —
// see app/api/tickets/route.ts's closing comment), and prisma/seed.ts only
// seeds the two demo users, so e2e/tickets.spec.ts's own beforeAll uses this
// module to write ticket rows directly, the same way a real inbound email
// would have created them.
//
// This talks to Postgres with the plain `pg` driver (same import
// e2e/global-setup.ts already uses to create the test database itself)
// rather than the generated Prisma client: the generated client
// (lib/generated/prisma/client.ts) is ESM-only — it reads `import.meta.url`
// at module scope to resolve its own `__dirname` — which works fine under
// Next.js's bundler (how lib/prisma.ts uses it) and under `tsx`
// (prisma/seed.ts), but not under Playwright's own TypeScript transform,
// which compiles e2e/*.ts to CommonJS; loading it from here throws
// "Cannot use 'import.meta' outside a module". Raw SQL avoids the generated
// client entirely. Column/table names below are quoted verbatim
// (Postgres lowercases unquoted identifiers) because nothing in
// prisma/schema.prisma uses @@map/@map — the table and column names are
// exactly the Prisma model/field names.

// Opens a fresh `pg` connection to the test database, hands it to `fn`, and
// always closes it afterward — the same connect/try/finally/end shape every
// exported seeding function below repeats. e2e/ticket-detail.spec.ts uses
// this directly (rather than duplicating that boilerplate) since, unlike
// e2e/tickets.spec.ts's single shared-fixture-set beforeAll, that spec needs
// a fresh, uniquely-identified ticket per mutating test (see this file's and
// that spec's shared-DB-parallelism notes) — many short-lived connections,
// one per test, instead of one long-lived one.
export async function withTestDbClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: resolveTestDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function seedTicketFixtures(): Promise<TicketFixtures> {
  const client = new Client({ connectionString: resolveTestDatabaseUrl() });
  await client.connect();

  try {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const agentId = await getSeededAgentId(client);
    const otherAgentId = await createThrowawayAgent(client, {
      email: `e2e-tickets-other-agent-${runId}@example.com`,
      name: "Other Agent",
    });

    const now = Date.now();

    const oldest = await insertTicket(client, {
      subject: `E2E Ticket Oldest ${runId}`,
      customerEmail: `oldest-${runId}@customer.example`,
      customerName: null,
      gmailThreadId: `e2e-thread-oldest-${runId}`,
      status: "OPEN",
      assignedToId: agentId,
      createdAt: new Date(now - 3 * 60_000),
    });

    const middle = await insertTicket(client, {
      subject: `E2E Ticket Middle ${runId}`,
      customerEmail: `middle-${runId}@customer.example`,
      customerName: "Middle Customer",
      gmailThreadId: `e2e-thread-middle-${runId}`,
      status: "RESOLVED",
      assignedToId: null,
      createdAt: new Date(now - 2 * 60_000),
    });

    const newest = await insertTicket(client, {
      subject: `E2E Ticket Newest ${runId}`,
      customerEmail: `newest-${runId}@customer.example`,
      customerName: null,
      gmailThreadId: `e2e-thread-newest-${runId}`,
      status: "CLOSED",
      assignedToId: otherAgentId,
      createdAt: new Date(now - 1 * 60_000),
    });

    return {
      runId,
      agentId,
      otherAgentId,
      oldest,
      middle,
      newest,
    };
  } finally {
    await client.end();
  }
}

// Looks up the seeded Agent's real User.id by email (e2e/seeded-users.ts's
// AGENT) — shared by seedTicketFixtures above and e2e/ticket-detail.spec.ts,
// which needs the real id to build tickets "assigned to the logged-in
// agent" without hardcoding/guessing it.
export async function getSeededAgentId(client: Client): Promise<string> {
  const agentResult = await client.query<{ id: string }>(
    `SELECT id FROM "User" WHERE email = $1`,
    [AGENT.email]
  );
  if (agentResult.rows.length === 0) {
    throw new Error(
      `Seeded agent (${AGENT.email}) not found — did global setup's ` +
        `"prisma migrate reset" + "prisma db seed" run before this spec?`
    );
  }
  return agentResult.rows[0].id;
}

// Inserts a throwaway second AGENT user — used wherever a fixture needs a
// ticket assigned to "some agent other than the real seeded one" (proving
// role-scoping actually excludes another agent's ticket, not just any
// unassigned one). Caller supplies a run-scoped unique email.
export async function createThrowawayAgent(
  client: Client,
  agent: { email: string; name: string }
): Promise<string> {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'AGENT'::"Role", now(), now())`,
    [id, agent.email, agent.name]
  );
  return id;
}

export async function insertTicket(
  client: Client,
  ticket: {
    subject: string;
    customerEmail: string;
    customerName: string | null;
    gmailThreadId: string;
    status: "OPEN" | "RESOLVED" | "CLOSED";
    assignedToId: string | null;
    createdAt: Date;
  }
): Promise<TicketFixture> {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO "Ticket" (
       id, subject, status, "customerEmail", "customerName", "gmailThreadId",
       "assignedToId", "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3::"TicketStatus", $4, $5, $6, $7, $8, $8)`,
    [
      id,
      ticket.subject,
      ticket.status,
      ticket.customerEmail,
      ticket.customerName,
      ticket.gmailThreadId,
      ticket.assignedToId,
      ticket.createdAt,
    ]
  );
  return { id, subject: ticket.subject };
}

// Seeds `count` additional, distinctly-subjected tickets for the pagination/
// sort e2e coverage in e2e/tickets.spec.ts (the 3-row set above is too few to
// prove a 20-row page cap or a real multi-page split). Left unassigned so
// they're visible under ADMIN_STORAGE_STATE (admin's `where` is unscoped)
// without needing another throwaway agent, and so they never show up under
// AGENT_STORAGE_STATE — keeping this set's cross-talk with the 3-row fixture
// set and with the agent-scoping tests at zero.
//
// createdAt is deliberately anchored a full day in the past (minus a small
// per-row stagger), not "now minus a few minutes" like the 3-row set above:
// GET /api/tickets's *default* sort is createdAt desc, and the existing
// "sorts newest-first" tests (both the UI row-order test and the API
// id-order test) assert against the 3-row set assuming it's within page 1's
// top 3 rows. Anchoring this set further into the past than the 3-row set,
// regardless of which fixture function happens to run first in a given
// beforeAll, keeps those pre-existing tests passing unmodified while still
// giving each of the `count` rows its own distinct, orderable timestamp for
// the pagination assertions that do target this set specifically.
export async function seedManyTicketFixtures(count: number): Promise<TicketFixture[]> {
  const client = new Client({ connectionString: resolveTestDatabaseUrl() });
  await client.connect();

  try {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const width = String(count).length;

    const tickets: TicketFixture[] = [];
    for (let n = 1; n <= count; n++) {
      // Zero-padded so subject strings sort alphabetically in the same order
      // as `n` numerically (e.g. "01" < "02" < ... < "25", not "1" < "10" <
      // "2") — required for the sortBy=subject&sortDir=asc test to be able
      // to predict the expected id order from `n` alone.
      const label = String(n).padStart(width, "0");
      // n=1 is the oldest of this set (furthest into the past), n=count is
      // the newest — staggered a minute apart so every row has a distinct
      // createdAt, all still well before the 3-row fixture set's timestamps.
      const createdAt = new Date(now - dayMs - (count - n) * 60_000);

      const ticket = await insertTicket(client, {
        subject: `E2E Pagination Ticket ${label} ${runId}`,
        customerEmail: `pagination-${label}-${runId}@customer.example`,
        customerName: null,
        gmailThreadId: `e2e-thread-pagination-${label}-${runId}`,
        status: "OPEN",
        assignedToId: null,
        createdAt,
      });
      tickets.push(ticket);
    }

    return tickets;
  } finally {
    await client.end();
  }
}

// Inserts a single TicketMessage row for e2e/ticket-detail.spec.ts — that
// spec needs to prove GET /api/tickets/[id]'s `messages` array (and the
// detail page's conversation thread) reflect a real DB row, not just an
// empty array. Mirrors insertTicket's raw-`pg` approach and rationale
// (see this file's top comment) rather than the generated Prisma client.
// `gmailMessageId` must be globally unique (schema's @unique) — callers pass
// their own run-scoped value, same convention insertTicket uses for
// gmailThreadId.
export async function insertTicketMessage(
  client: Client,
  message: {
    ticketId: string;
    direction: "INBOUND" | "OUTBOUND";
    authorType: "CUSTOMER" | "AGENT" | "AI" | "SYSTEM";
    authorId?: string | null;
    body: string;
    gmailMessageId: string;
  }
): Promise<{ id: string; body: string }> {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO "TicketMessage" (
       id, "ticketId", direction, "authorType", "authorId", body, "gmailMessageId", "createdAt"
     ) VALUES ($1, $2, $3::"MessageDirection", $4::"MessageAuthorType", $5, $6, $7, now())`,
    [
      id,
      message.ticketId,
      message.direction,
      message.authorType,
      message.authorId ?? null,
      message.body,
      message.gmailMessageId,
    ]
  );
  return { id, body: message.body };
}

export type TicketFixture = { id: string; subject: string };

export type TicketFixtures = {
  /** Unique per seedTicketFixtures() call, embedded in oldest/middle/newest's
   *  subjects (and only those three) — scopes a `q=` filter to exactly this
   *  file's 3-row set, immune to seedManyTicketFixtures's own runId and to
   *  ticket rows other spec files create concurrently. */
  runId: string;
  /** The seeded Agent's real User.id (e2e/seeded-users.ts's AGENT, by email). */
  agentId: string;
  /** A second, throwaway agent — proves "admin sees all" isn't accidentally
   *  "admin sees own", and that the real seeded Agent doesn't see this one. */
  otherAgentId: string;
  /** assignedToId: agentId. Oldest of the three (createdAt furthest in the past). */
  oldest: TicketFixture;
  /** assignedToId: null — renders "Unassigned". Created between oldest and newest. */
  middle: TicketFixture;
  /** assignedToId: otherAgentId. Newest of the three (createdAt closest to now). */
  newest: TicketFixture;
};
