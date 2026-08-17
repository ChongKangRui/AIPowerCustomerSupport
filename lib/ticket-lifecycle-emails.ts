// Plain-text bodies for the automated emails this app sends outside of a
// human agent typing one into the Reply box.
//
// Each body is a small named builder function, not an inline string at
// the call site. That keeps the copy in one place and reusable from
// tests later.
//
// All of these go out through the same lib/gmail.ts sendGmailReply() that
// the agent-authored reply route already uses. See that route's comment
// for the threading (`inReplyTo`) pattern these follow.

// Sent once, at Close time.
//
// This deliberately does not resend on a later reply to the same closed
// thread. lib/gmail.ts's processMessage() silently ignores inbound mail
// on a CLOSED ticket. It does not bounce this same notice on every
// follow-up reply.
export function buildClosedEmailBody(): string {
  return [
    "This ticket has been closed.",
    "",
    "This is an automated message — replies to this email will not be monitored or added to your ticket. If you need further help, please submit a new request.",
  ].join("\n");
}

// Sent once, at Resolve time.
//
// The "replying reopens this" line is a real promise, not just copy.
// lib/gmail.ts's processMessage() does reopen a RESOLVED ticket back to
// OPEN on the next inbound reply.
export function buildResolvedEmailBody(): string {
  return [
    "This ticket has been marked resolved.",
    "",
    "If you're satisfied, no action is needed. If you reply to this email, your ticket will automatically reopen and your reply will be treated as a signal that the resolution didn't fully address your issue.",
  ].join("\n");
}

// Sent once, when Path A (AI auto-resolve, lib/ai-auto-resolve.ts) is
// confident enough to answer a new ticket on its own — see
// lib/gmail.ts's processMessage().
//
// This is one email, not two: the AI's own answer, then the same
// reopens-on-reply promise buildResolvedEmailBody() makes above. A human
// Resolve is a separate action from the agent's reply, so it gets its own
// notice email — Path A does both in the same reply, since there's no
// separate "answer" step to have already happened.
export function buildAiResolvedEmailBody(aiResponse: string): string {
  return [
    aiResponse,
    "",
    "---",
    "",
    "This ticket has been marked resolved by AI. If you're satisfied, no action is needed. If you reply to this email, your ticket will automatically reopen and be routed to a human agent.",
  ].join("\n");
}
