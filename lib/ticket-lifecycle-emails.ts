// Plain-text bodies for the two automated, SYSTEM-authored emails.
// app/api/tickets/[id]/route.ts's PATCH handler sends these when an
// agent marks a ticket Resolved or Closed.
//
// Each body is a small named builder function, not an inline string at
// the call site. That keeps the copy in one place and reusable from
// tests later.
//
// Both go out through the same lib/gmail.ts sendGmailReply() that the
// agent-authored reply route already uses. See that route's comment for
// the threading (`inReplyTo`) pattern these follow.

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
