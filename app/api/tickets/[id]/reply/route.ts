import { NextResponse } from "next/server";

import { ConflictError, NotFoundError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { sendGmailReply } from "@/lib/gmail";
import { findScopedTicket } from "@/lib/ticket-access";
import { TicketStatus, MessageDirection, MessageAuthorType } from "@/lib/generated/prisma/enums";
import { sendTicketReplySchema, ticketDetailSelect } from "@/models/ticket.model";

// POST /api/tickets/[id]/reply — an agent's outbound reply. Sends a real
// threaded email via lib/gmail.ts's sendGmailReply(), then stores the result
// as an OUTBOUND/AGENT TicketMessage. Mirrors the ticket-detail-view.tsx
// reply box's own `ticket.status !== CLOSED` gate: a closed ticket can't be
// replied to (terminal, same as ALLOWED_TRANSITIONS in the sibling route).
// Also guards against duplicate sends of the same text in quick succession
// (double-click across tabs, reload-and-resend) — see the comment further
// down at the recentDuplicate check for why that's a lightweight
// content+time-window check rather than a real idempotency key.
export const POST = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await context.params;
    const { body } = sendTicketReplySchema.parse(await request.json());

    // ticketDetailSelect plus gmailThreadId — the sibling GET/PATCH route
    // doesn't need gmailThreadId in its response, but sendGmailReply() below
    // does, to thread the outbound send into the right Gmail conversation.
    const existing = await findScopedTicket(id, session, {
      ...ticketDetailSelect,
      gmailThreadId: true,
    });
    if (!existing) throw new NotFoundError("Ticket not found");
    if (existing.status === TicketStatus.CLOSED) {
      throw new ConflictError("Cannot reply to a closed ticket");
    }

    // Duplicate-submission guard: if this exact text was already sent as the
    // most recent OUTBOUND message on this ticket within the last 30s,
    // treat this as a retry of the same send (double-click across two tabs,
    // a reload-and-resend after an ambiguous "did that go through") rather
    // than a genuinely new reply — return the current ticket state instead
    // of calling Gmail again. Deliberately a lightweight content+time-window
    // check, not a hard-guaranteed idempotency key: it has a narrow
    // check-then-act race window (two truly simultaneous requests could
    // both pass this check before either commits), but the worst case there
    // is one extra duplicate email, not corrupted state — not worth a
    // schema migration/idempotency-key column for that. Unlike the inbound
    // Gmail poller (processMessage() in lib/gmail.ts), there's no
    // pre-existing id to key a real unique constraint off of here: a
    // gmailMessageId only exists *after* the (possibly duplicate) send has
    // already happened.
    const DUPLICATE_WINDOW_MS = 30_000;
    const recentDuplicate = await prisma.ticketMessage.findFirst({
      where: {
        ticketId: id,
        direction: MessageDirection.OUTBOUND,
        body,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
    });
    if (recentDuplicate) {
      log.warn({ ticketId: id }, "duplicate reply submission suppressed, no email sent");
      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id },
        select: ticketDetailSelect,
      });
      return NextResponse.json(ticket);
    }

    // Most recent message in the thread with a real rfcMessageId, used to
    // build In-Reply-To/References so mail clients (and Gmail itself) thread
    // this reply visually, on top of the threadId grouping Gmail already
    // does server-side.
    const lastMessage = await prisma.ticketMessage.findFirst({
      where: { ticketId: id, rfcMessageId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { rfcMessageId: true },
    });

    const subject = /^re:/i.test(existing.subject) ? existing.subject : `Re: ${existing.subject}`;

    // Logged at info level (not just on failure) since Gmail threading is
    // an all-or-nothing, silent-failure kind of thing on Gmail's side — if
    // a reply ever lands as a new conversation instead of threading, this
    // is the first place to check: was inReplyTo actually populated, and
    // does the subject look right.
    log.info({ ticketId: id, threadId: existing.gmailThreadId, subject, inReplyTo: lastMessage?.rfcMessageId ?? null }, "sending ticket reply via Gmail");

    const { gmailMessageId, rfcMessageId } = await sendGmailReply({
      threadId: existing.gmailThreadId,
      to: existing.customerEmail,
      subject,
      bodyText: body,
      inReplyTo: lastMessage?.rfcMessageId ?? null,
    });

    await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        direction: MessageDirection.OUTBOUND,
        authorType: MessageAuthorType.AGENT,
        authorId: session.user.id,
        body,
        gmailMessageId,
        rfcMessageId,
        inReplyTo: lastMessage?.rfcMessageId ?? null,
      },
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id },
      select: ticketDetailSelect,
    });

    log.info({ ticketId: id, gmailMessageId }, "sent ticket reply");
    return NextResponse.json(ticket);
  }
);
