import { createTextStreamResponse, streamText, toTextStream } from "ai";

import { ConflictError, NotFoundError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { geminiFlashLite } from "@/lib/gemini";
import { findScopedTicket } from "@/lib/ticket-access";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import { rephraseTicketReplySchema } from "@/models/ticket.model";

// The model's job is just the body paragraph(s), not the greeting or
// sign-off — those are added deterministically below (prependGreeting),
// not left to the model. That's also why the draft's own greeting/
// sign-off, if the agent already typed one, gets stripped here: without
// this, re-clicking Rephrase on an already-formatted reply would stack a
// second "Dear ..."/"Sincerely," from the model on top of the one this
// route adds, or leave the agent's original one buried in the middle.
//
// This still doesn't fetch full ticket context beyond the customer's
// name (see the select below) — the agent already decided what to say,
// the model's job is tone/grammar polish and formatting, not fact-finding.
const REPHRASE_SYSTEM_PROMPT = `You are a customer support writing assistant. Rewrite the agent's draft reply into clear, professional, standard support-email tone.

Keep the same meaning and every specific fact or detail already in the draft — do not invent new information. If the draft already starts with a greeting (like "Hi", "Hello", "Dear ...") or ends with a sign-off (like "Thanks", "Best", "Regards", "Sincerely"), remove it — a greeting and sign-off are added separately, after your response, so don't include your own. Return only the rewritten body text, nothing else.`;

// Matches the greeting-name convention prisma/seed-tickets.ts already
// uses for synthetic agent replies: first name only, falling back to
// "there" rather than the raw email address — "Dear anon@example.com,"
// reads oddly in a real greeting line the way it's fine as a compact
// table label (see components/tickets/ticket-conversation.tsx's
// authorLabel, which uses customerName ?? customerEmail instead — a
// different context with a different right answer).
// Exported for route.test.ts, since it's pure string-in/string-out logic
// with no Gmail/DB/AI call involved — same reasoning lib/gmail.ts exports
// stripQuotedReply() for its own test file.
export function greetingName(customerName: string | null): string {
  return customerName?.split(" ")[0] ?? "there";
}

// Wraps the model's body-only stream with a static "Dear <name>," prefix
// and "Sincerely," suffix, so the finished reply reads like an official
// support email. Done here in code, not left to the model to generate —
// this is trivial string interpolation once greetingName() has already
// picked the name, and doing it deterministically guarantees the format
// every time instead of depending on the model reliably following a
// formatting instruction.
// Exported for route.test.ts too — takes a plain ReadableStream<string>
// in, so a test can feed it fake chunks without any real model/network
// call, same idea as greetingName() above.
export function withGreetingAndSignoff(body: ReadableStream<string>, customerName: string | null): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      controller.enqueue(`Dear ${greetingName(customerName)},\n\n`);

      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
      }

      controller.enqueue("\n\nSincerely, \nCustomer Support Agent");
      controller.close();
    },
  });
}

// POST /api/tickets/[id]/rephrase streams a rewritten version of an
// agent's draft back into the reply box (project-scope.md's Path B:
// "AI rephrases the draft into a standard, professional tone").
//
// Same auth/scoping shape as the sibling reply route: Agent-if-assigned
// or Admin-any, CLOSED tickets rejected. Unlike that route, there's no
// duplicate-submission guard here — rephrasing has no side effect to
// dedupe, it's pure generation.
//
// Uses geminiFlashLite() — see lib/gemini.ts's model-split comment.
//
// This returns a streaming Response instead of NextResponse.json(). The two real
// quirks that come with streaming through it anyway: the wrapper's own
// "Request completed" duration log fires when the stream *starts*, not
// finishes, and a failure after streaming has begun can't become a JSON
// error anymore — headers/status are already committed. That's why
// streamText's onError below only logs; it can't change the response.
export const POST = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await context.params;
    const { draft } = rephraseTicketReplySchema.parse(await request.json());

    const existing = await findScopedTicket(id, session, {
      id: true,
      status: true,
      customerName: true,
      assignedTo: { select: { id: true } },
    });
    if (!existing) throw new NotFoundError("Ticket not found");
    if (existing.status === TicketStatus.CLOSED) {
      throw new ConflictError("Cannot rephrase a reply on a closed ticket");
    }

    log.info({ ticketId: id }, "streaming AI rephrase of agent draft");

    const result = streamText({
      model: geminiFlashLite(),
      system: REPHRASE_SYSTEM_PROMPT,
      prompt: draft,
      onError: ({ error }) => {
        // `err`, not `error` — see lib/ai-auto-resolve.ts's matching
        // comment. Without this key, Pino logs an empty `{}` for any
        // Error object here.
        log.error({ err: error, ticketId: id }, "rephrase stream failed mid-generation");
      },
    });

    const bodyStream = withGreetingAndSignoff(toTextStream({ stream: result.stream }), existing.customerName);
    return createTextStreamResponse({ stream: bodyStream });
  }
);
