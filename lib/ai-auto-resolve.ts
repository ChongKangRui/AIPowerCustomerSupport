import { generateText, Output } from "ai";
import { z } from "zod";

import { geminiFlashLite } from "@/lib/gemini";
import { getKnowledgeBaseContext } from "@/lib/knowledge-base";
import { logger } from "@/lib/logger";

// Path A (project-scope.md): a new ticket gets checked against the
// knowledge base. Confident → the `response` text below is sent to the
// customer as-is and the ticket auto-resolves. Not confident → Path B
// (lib/ticket-assignment.ts's round robin) takes over instead.
//
// `ai`'s generateObject is deprecated in this SDK version in favor of
// generateText's `output` option (see node_modules/ai/dist/index.d.ts) —
// AGENTS.md's warning about this not being the Next.js/AI SDK version in
// training data applies here too. Output.object still gets the same
// schema-checked structured result, just through the current API.
const autoResolveSchema = z
  .object({
    confident: z.boolean(),
    // Only meaningful when confident is true. The model still has to
    // produce a string either way, so this isn't nullable — an empty
    // string is what "not confident" looks like.
    response: z.string(),
  })
  // A refusal doesn't always come back as a thrown error. Gemini could
  // return something that's shape-valid — confident: true, response: ""
  // — from a safety filter trimming the text, a flaky generation, or the
  // model just not following instructions. That would sail through a
  // plain shape check and send an empty email while marking the ticket
  // RESOLVED. This closes that gap: `generateText`'s Output.object
  // re-validates against this whole schema, refinement included (see
  // node_modules/ai/dist/index.js's object()'s parseCompleteOutput,
  // confirmed by reading it directly), and throws NoObjectGeneratedError
  // on failure — which the catch below already treats as "not
  // confident." No new branching needed, just closing the schema.
  .refine((data) => !data.confident || data.response.trim().length > 0, {
    message: "response must be non-empty when confident is true",
  });

export type AutoResolveResult = z.infer<typeof autoResolveSchema>;

// There's no numeric confidence threshold documented anywhere in
// project-scope.md — this is left to the model's own judgment, per the
// instructions below, not a score this code thresholds itself.
const SYSTEM_PROMPT_PREFIX = `You are a customer support assistant. Decide whether you can fully answer the customer's email using ONLY the knowledge base below.

Set confident to true only if the knowledge base clearly and directly answers the question, with nothing further needed from the customer. Set confident to false if the question needs account-specific lookups, judgment calls, isn't covered by the knowledge base — OR if answering it well would require asking the customer for more details first (their device, OS, order number, account info, error message, etc.). A reply that asks a question back is not a resolution — a human agent handles those instead.

When confident is true, write "response" as the actual reply to send the customer: a complete, professional, ready-to-send email body that fully resolves their question. No subject line, no greeting placeholders, and no follow-up questions back to the customer. When confident is false, leave "response" as an empty string.

Knowledge base:
`;

/**
 * The Path A confidence check. Fails open: any error from the model call
 * (quota, network, malformed output) is caught here and reported as
 * "not confident," so one bad AI call routes a ticket to a human instead
 * of blocking the rest of a Gmail poll batch. See lib/gmail.ts's
 * processMessage() for the caller.
 */
export async function checkAutoResolve(ticket: {
  subject: string;
  body: string;
}): Promise<AutoResolveResult> {
  try {
    const kbContext = await getKnowledgeBaseContext();

    const { output } = await generateText({
      model: geminiFlashLite(),
      output: Output.object({ schema: autoResolveSchema }),
      system: SYSTEM_PROMPT_PREFIX + kbContext,
      prompt: `Subject: ${ticket.subject}\n\n${ticket.body}`,
    });

    return output;
  } catch (error) {
    // `err`, not `error` — see the matching comment in lib/gmail.ts's
    // routeNewTicket() catch block. Without this, every failure here
    // (bad API key, quota, network) logged as an empty `{}`, making a
    // genuine error indistinguishable from Gemini just returning
    // { confident: false } on its own.
    logger.warn({ err: error }, "Path A confidence check failed, falling back to Path B");
    return { confident: false, response: "" };
  }
}
