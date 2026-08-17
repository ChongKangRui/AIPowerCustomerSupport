import { describe, expect, it } from "vitest";

import {
  assignmentNotificationData,
  newMessageNotificationData,
  reopenNotificationData,
} from "@/lib/notifications";
import { NotificationType } from "@/lib/generated/prisma/enums";

// Plain data builders (lib/notifications.ts), pure input-in/object-out
// — no mocking needed. Worth locking in each one's `type`: a copy-paste
// mistake between the three wouldn't be caught by TypeScript, since all
// three return the same shape.
describe("assignmentNotificationData", () => {
  it("builds a TICKET_ASSIGNED notification for the given user/ticket/subject", () => {
    expect(assignmentNotificationData("agent-1", "ticket-1", "Refund request")).toEqual({
      userId: "agent-1",
      ticketId: "ticket-1",
      type: NotificationType.TICKET_ASSIGNED,
      message: "New ticket assigned to you: Refund request",
    });
  });
});

describe("reopenNotificationData", () => {
  it("builds a TICKET_REOPENED notification for the given user/ticket/subject", () => {
    expect(reopenNotificationData("agent-1", "ticket-1", "Refund request")).toEqual({
      userId: "agent-1",
      ticketId: "ticket-1",
      type: NotificationType.TICKET_REOPENED,
      message: "Ticket reopened: Refund request",
    });
  });
});

describe("newMessageNotificationData", () => {
  it("builds a TICKET_NEW_MESSAGE notification for the given user/ticket/subject", () => {
    expect(newMessageNotificationData("agent-1", "ticket-1", "Refund request")).toEqual({
      userId: "agent-1",
      ticketId: "ticket-1",
      type: NotificationType.TICKET_NEW_MESSAGE,
      message: "New customer reply: Refund request",
    });
  });
});
