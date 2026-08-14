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
export async function seedTicketFixtures(): Promise<TicketFixtures> {
  const client = new Client({ connectionString: resolveTestDatabaseUrl() });
  await client.connect();

  try {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    const agentId = agentResult.rows[0].id;

    const otherAgentId = crypto.randomUUID();
    await client.query(
      `INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'AGENT'::"Role", now(), now())`,
      [otherAgentId, `e2e-tickets-other-agent-${runId}@example.com`, "Other Agent"]
    );

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

async function insertTicket(
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

export type TicketFixture = { id: string; subject: string };

export type TicketFixtures = {
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
