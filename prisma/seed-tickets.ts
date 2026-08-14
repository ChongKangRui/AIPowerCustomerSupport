import "dotenv/config";

import { prisma } from "../lib/prisma";
import { TicketStatus } from "../lib/generated/prisma/enums";

// Dev-only convenience seed — NOT part of `db:seed` / e2e's `prisma migrate
// reset` flow (that's prisma/seed.ts, which only creates the two demo
// users). This script adds 40 realistic-looking tickets on top of whatever
// users already exist, so app/(main)/tickets/page.tsx has enough rows to
// exercise search/filter/sort/pagination (TICKET_PAGE_SIZE = 20, so this
// spans exactly two pages) by hand in the browser.
//
// Run with: npm run db:seed:tickets
// Safe to run more than once — each run uses its own runId so
// gmailThreadId (unique) never collides with a previous run's rows.
async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const agentEmail = process.env.SEED_AGENT_EMAIL ?? "agent@example.com";

  const [admin, agent] = await Promise.all([
    prisma.user.findUnique({ where: { email: adminEmail } }),
    prisma.user.findUnique({ where: { email: agentEmail } }),
  ]);

  if (!agent) {
    throw new Error(
      `Seeded agent (${agentEmail}) not found — run "npm run db:seed" first.`
    );
  }
  const agentId = agent.id; // narrowed once here — TS can't see through the closure below

  const subjects = [
    "Can't log into my account",
    "Refund request for order #10432",
    "Password reset link expired",
    "Invoice shows wrong amount",
    "How do I change my billing address?",
    "App crashes on checkout",
    "Missing item from my order",
    "Subscription renewed but I cancelled",
    "Two-factor authentication not working",
    "Where is my tracking number?",
    "Charged twice for the same order",
    "Feature request: dark mode",
    "Unable to upload profile picture",
    "Export data isn't downloading",
    "Question about enterprise pricing",
    "Account locked after failed logins",
    "Email notifications not arriving",
    "How to delete my account",
    "Coupon code not applying at checkout",
    "API returning 500 errors",
    "Mobile app won't sync with desktop",
    "Need an invoice for my accountant",
    "Shipping address can't be edited",
    "Trial ended but still being billed",
    "Login page stuck loading",
    "Requesting a demo of the product",
    "Wrong item delivered",
    "Cancel my subscription please",
    "Broken link in confirmation email",
    "Can I merge two accounts?",
    "Payment declined but card is valid",
    "Dashboard showing stale data",
    "How do I add a team member?",
    "Report a bug in the search feature",
    "Order stuck in 'processing' for a week",
    "Change plan from monthly to annual",
    "Dark pattern in cancellation flow — please fix",
    "Support for SSO login",
    "Website is down for me",
    "Thank you for the quick help!",
  ];

  const statusCycle: TicketStatus[] = [
    TicketStatus.OPEN,
    TicketStatus.OPEN,
    TicketStatus.RESOLVED,
    TicketStatus.OPEN,
    TicketStatus.CLOSED,
  ];

  const firstNames = [
    "Alex", "Jamie", "Taylor", "Jordan", "Casey", "Morgan", "Riley", "Sam",
    "Drew", "Cameron", "Avery", "Quinn", "Reese", "Skyler", "Rowan", "Elliot",
  ];
  const lastNames = [
    "Chen", "Patel", "Garcia", "Kim", "Nguyen", "Smith", "Johnson", "Brown",
    "Lee", "Martinez", "Davis", "Wilson", "Clark", "Lewis", "Walker", "Young",
  ];

  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();

  // Rough assignment split across the 40 rows: enough go to `agent` that
  // logging in as the seeded Agent (whose ticket list is scoped to
  // assignedToId === self, per app/api/tickets/route.ts) actually has
  // something to see, plus some to admin and some left unassigned.
  function assigneeFor(n: number): string | null {
    const bucket = n % 5;
    if (bucket === 0 || bucket === 1) return agentId; // 16/40
    if (bucket === 2 && admin) return admin.id; // ~8/40
    return null; // rest unassigned
  }

  const rows = Array.from({ length: 40 }, (_, i) => {
    const n = i + 1;
    const subject = subjects[i % subjects.length];
    const status = statusCycle[i % statusCycle.length];
    const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
    const createdAt = new Date(now - (40 - n) * 3 * 60 * 60 * 1000); // staggered 3h apart

    return {
      subject,
      status,
      customerEmail: `customer${n}-${runId}@example.com`,
      customerName: n % 7 === 0 ? null : name, // a few with no name on file
      gmailThreadId: `dev-thread-${runId}-${n}`,
      assignedToId: assigneeFor(n),
      resolvedByAi: status === TicketStatus.RESOLVED && n % 3 === 0,
      createdAt,
      resolvedAt: status !== TicketStatus.OPEN ? new Date(createdAt.getTime() + 60 * 60 * 1000) : null,
      closedAt: status === TicketStatus.CLOSED ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000) : null,
    };
  });

  await prisma.ticket.createMany({ data: rows });

  console.log(`Seeded ${rows.length} tickets (runId ${runId}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
