import { NextResponse } from "next/server";

import { ConflictError, NotFoundError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { sendGmailReply } from "@/lib/gmail";
import { findScopedTicket } from "@/lib/ticket-access";
import { TicketStatus, MessageDirection, MessageAuthorType } from "@/lib/generated/prisma/enums";
import { sendTicketReplySchema, ticketDetailSelect } from "@/models/ticket.model";

// POST /api/tickets/[id]/reply is an agent's outbound reply.
// It sends a real threaded email through lib/gmail.ts's sendGmailReply(), then stores the result as an OUTBOUND/AGENT TicketMessage.
//
// This mirrors the ticket-detail-view.tsx reply box's own `ticket.status !== CLOSED` gate.
// A closed ticket cannot be replied to. That is terminal, the same as ALLOWED_TRANSITIONS in the sibling route.
//
// This also guards against duplicate sends of the same text in quick succession: a double-click across tabs, or a reload-and-resend.
// See the comment further down, at the recentDuplicate check, for why that is a lightweight content-and-time-window check, not a real idempotency key.
export const POST = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await context.params;
    const { body } = sendTicketReplySchema.parse(await request.json());

    // This selects ticketDetailSelect plus gmailThreadId.
    // The sibling GET/PATCH route does not need gmailThreadId in its response, but sendGmailReply() below does, to thread the outbound send into the right Gmail conversation.
    const existing = await findScopedTicket(id, session, {
      ...ticketDetailSelect,
      gmailThreadId: true,
    });
    if (!existing) throw new NotFoundError("Ticket not found");
    if (existing.status === TicketStatus.CLOSED) {
      throw new ConflictError("Cannot reply to a closed ticket");
    }

    // This is the duplicate-submission guard.
    // If this exact text was already sent as the most recent OUTBOUND message on this ticket within the last 30 seconds, this treats it as a retry of the same send.
    // A double-click across two tabs, or a reload-and-resend after an ambiguous "did that go through", counts as a retry, not a genuinely new reply.
    // This returns the current ticket state instead of calling Gmail again.
    //
    // This is deliberately a lightweight content-and-time-window check, not a hard-guaranteed idempotency key.
    // It has a narrow check-then-act race window: two truly simultaneous requests could both pass this check before either commits.
    // But the worst case there is one extra duplicate email, not corrupted state. That is not worth a schema migration or an idempotency-key column.
    //
    // Unlike the inbound Gmail poller — processMessage() in lib/gmail.ts — there is no pre-existing id to key a real unique constraint off of here.
    // A gmailMessageId only exists after the possibly duplicate send has already happened.
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

    // This is the most recent message in the thread with a real rfcMessageId.
    // It builds In-Reply-To and References, so mail clients — and Gmail itself — thread this reply visually, on top of the threadId grouping Gmail already does server-side.
    const lastMessage = await prisma.ticketMessage.findFirst({
      where: { ticketId: id, rfcMessageId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { rfcMessageId: true },
    });

    const subject = /^re:/i.test(existing.subject) ? existing.subject : `Re: ${existing.subject}`;

    // This logs at info level, not just on failure.
    // Gmail threading is an all-or-nothing, silent-failure kind of thing on Gmail's side.
    // If a reply ever lands as a new conversation instead of threading, this is the first place to check: was inReplyTo actually populated, and does the subject look right.
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
