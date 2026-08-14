import "dotenv/config";

import { prisma } from "../lib/prisma";
import { MessageAuthorType, MessageDirection, TicketStatus } from "../lib/generated/prisma/enums";

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

  // Conversation content — picked round-robin per ticket (not 1:1 with
  // `subjects`, so the same subject doesn't always pair with the same
  // opener) rather than hand-written per subject: 40 fully bespoke threads
  // isn't worth the upkeep, but generic-sounding boilerplate on every row
  // isn't either, so a handful of natural-sounding variants each, mixed by
  // index, gets a conversation thread that reads like a real inbox.
  const openerTemplates = [
    (subject: string) => `Hi, I'm running into the following issue: ${subject}. Could someone take a look?`,
    (subject: string) => `Hello, I wanted to report a problem — ${subject}. Any help would be appreciated.`,
    (subject: string) =>
      `Hey there, quick issue on my end: ${subject}. Let me know what you need from me to sort this out.`,
    (subject: string) => `Hi support team, I've been dealing with this for a couple of days now: ${subject}.`,
    (subject: string) => `Hi, ${subject} — hoping you can help me figure out what's going on.`,
  ];
  const agentAckTemplates = [
    (name: string) => `Hi ${name}, thanks for flagging this — I'm looking into it now and will follow up shortly.`,
    (name: string) => `Hi ${name}, got it, taking a look on my end. Will update you as soon as I know more.`,
  ];
  const agentResolveTemplates = [
    (name: string) => `Hi ${name}, thanks for your patience. This should be fixed now — let me know if you're still running into it.`,
    (name: string) => `Hi ${name}, I made the fix on our end. Please try again and let me know if it works now.`,
    (name: string) => `Hey ${name}, all set — this has been resolved. Reach out again if anything else comes up.`,
  ];
  const aiResolveTemplate = () =>
    "Thanks for reaching out! Based on the details provided, this should now be resolved. If you're still experiencing the issue, just reply to this email and a human agent will step in.";
  const closingTemplates = [
    (name: string) => `Hi ${name}, closing this ticket out now. If you run into anything else, please open a new request — this thread is now closed.`,
    (name: string) => `Hey ${name}, marking this as closed on our end. Feel free to start a new ticket if anything else comes up.`,
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

  // Builds this ticket's conversation thread — one inbound customer message
  // always first, then zero or more outbound replies depending on status:
  // OPEN sometimes gets an early "looking into it" ack (not a resolution),
  // RESOLVED gets an AI or agent reply that closes out the issue, CLOSED
  // gets that plus an explicit closing note. Each message threads onto the
  // previous one via inReplyTo, same field an inbound Gmail reply would
  // arrive with — see lib/gmail.ts's ParsedGmailMessage.
  function buildMessages({
    n,
    subject,
    status,
    resolvedByAi,
    assignedToId,
    customerName,
    ticketCreatedAt,
  }: {
    n: number;
    subject: string;
    status: TicketStatus;
    resolvedByAi: boolean;
    assignedToId: string | null;
    customerName: string | null;
    ticketCreatedAt: Date;
  }) {
    const greetName = customerName?.split(" ")[0] ?? "there";
    const effectiveAgentId = assignedToId ?? agentId;

    type Draft = { direction: MessageDirection; authorType: MessageAuthorType; authorId: string | null; body: string };
    const drafts: Draft[] = [
      {
        direction: MessageDirection.INBOUND,
        authorType: MessageAuthorType.CUSTOMER,
        authorId: null,
        body: openerTemplates[n % openerTemplates.length](subject),
      },
    ];

    if (status === TicketStatus.OPEN) {
      // Only about half of open tickets have an agent ack yet — the rest
      // are sitting untouched, which is realistic for a live queue.
      if (assignedToId && n % 2 === 0) {
        drafts.push({
          direction: MessageDirection.OUTBOUND,
          authorType: MessageAuthorType.AGENT,
          authorId: effectiveAgentId,
          body: agentAckTemplates[n % agentAckTemplates.length](greetName),
        });
      }
    } else {
      drafts.push(
        resolvedByAi
          ? {
              direction: MessageDirection.OUTBOUND,
              authorType: MessageAuthorType.AI,
              authorId: null,
              body: aiResolveTemplate(),
            }
          : {
              direction: MessageDirection.OUTBOUND,
              authorType: MessageAuthorType.AGENT,
              authorId: effectiveAgentId,
              body: agentResolveTemplates[n % agentResolveTemplates.length](greetName),
            }
      );

      if (status === TicketStatus.CLOSED) {
        drafts.push({
          direction: MessageDirection.OUTBOUND,
          authorType: MessageAuthorType.AGENT,
          authorId: effectiveAgentId,
          body: closingTemplates[n % closingTemplates.length](greetName),
        });
      }
    }

    // Staggered a few minutes apart, in order — comfortably inside the
    // ticket's own createdAt→resolvedAt/closedAt window (60min/120min after
    // createdAt, see below) without needing to line up exactly.
    let previousRfcMessageId: string | null = null;
    return drafts.map((draft, idx) => {
      const gmailMessageId = `dev-msg-${runId}-${n}-${idx}`;
      const rfcMessageId = `<${gmailMessageId}@mail.gmail.com>`;
      const message = {
        ...draft,
        gmailMessageId,
        rfcMessageId,
        inReplyTo: previousRfcMessageId,
        createdAt: new Date(ticketCreatedAt.getTime() + idx * 25 * 60 * 1000),
      };
      previousRfcMessageId = rfcMessageId;
      return message;
    });
  }

  const rows = Array.from({ length: 40 }, (_, i) => {
    const n = i + 1;
    const subject = subjects[i % subjects.length];
    const status = statusCycle[i % statusCycle.length];
    const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
    const createdAt = new Date(now - (40 - n) * 3 * 60 * 60 * 1000); // staggered 3h apart
    const assignedToId = assigneeFor(n);
    const customerName = n % 7 === 0 ? null : name; // a few with no name on file
    const resolvedByAi = status === TicketStatus.RESOLVED && n % 3 === 0;

    return {
      subject,
      status,
      customerEmail: `customer${n}-${runId}@example.com`,
      customerName,
      gmailThreadId: `dev-thread-${runId}-${n}`,
      assignedToId,
      resolvedByAi,
      createdAt,
      resolvedAt: status !== TicketStatus.OPEN ? new Date(createdAt.getTime() + 60 * 60 * 1000) : null,
      closedAt: status === TicketStatus.CLOSED ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000) : null,
      messages: buildMessages({
        n,
        subject,
        status,
        resolvedByAi,
        assignedToId,
        customerName,
        ticketCreatedAt: createdAt,
      }),
    };
  });

  // Nested writes (messages: { create: [...] }) instead of createMany, so
  // each ticket's thread is inserted alongside it — createMany has no
  // nested-relation support and Ticket.messages isn't set-able after the
  // fact without knowing the generated Ticket id back. Sequential, not
  // Promise.all: this is a one-off dev script, not perf-sensitive, and
  // sequential keeps failures easy to attribute to a specific row.
  let messageCount = 0;
  for (const { messages, ...ticketData } of rows) {
    await prisma.ticket.create({ data: { ...ticketData, messages: { create: messages } } });
    messageCount += messages.length;
  }

  console.log(`Seeded ${rows.length} tickets with ${messageCount} messages (runId ${runId}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
