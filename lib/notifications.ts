import { NotificationType } from "@/lib/generated/prisma/enums";

// Plain data builders, not functions that call Prisma themselves.
// Every call site (lib/gmail.ts, the assign routes) needs its
// notification create to live inside its own existing transaction
// array, alongside the ticket update it's reporting on. A helper that
// ran prisma.notification.create() internally couldn't join that
// transaction, so this just returns the `data` object for the caller to
// pass to its own prisma.notification.create({ data: ... }).

/** A ticket was assigned to `userId` — round-robin escalation or a manual admin assign. */
export function assignmentNotificationData(userId: string, ticketId: string, subject: string) {
  return {
    userId,
    ticketId,
    type: NotificationType.TICKET_ASSIGNED,
    message: `New ticket assigned to you: ${subject}`,
  };
}

/** A customer reply reopened a RESOLVED ticket back to OPEN. */
export function reopenNotificationData(userId: string, ticketId: string, subject: string) {
  return {
    userId,
    ticketId,
    type: NotificationType.TICKET_REOPENED,
    message: `Ticket reopened: ${subject}`,
  };
}

/** A customer replied on a ticket that's already OPEN and already assigned to `userId`. */
export function newMessageNotificationData(userId: string, ticketId: string, subject: string) {
  return {
    userId,
    ticketId,
    type: NotificationType.TICKET_NEW_MESSAGE,
    message: `New customer reply: ${subject}`,
  };
}
