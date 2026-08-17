import { afterEach, describe, expect, it, vi } from "vitest";

// prisma is mocked, not hit for real — this tests assignNextAgent()'s own
// picking logic (least-loaded, tie-break, no-eligible-agent), not Prisma
// itself. vi.hoisted is required here: Vitest hoists vi.mock() calls
// above imports, so the mock factory can't close over a plain outer
// variable, only one wrapped in vi.hoisted().
const prismaMocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: prismaMocks.findMany } } }));

import { assignNextAgent } from "@/lib/ticket-assignment";
import { Role, TicketStatus } from "@/lib/generated/prisma/enums";

afterEach(() => vi.clearAllMocks());

describe("assignNextAgent", () => {
  it("returns null when no eligible agents exist", async () => {
    prismaMocks.findMany.mockResolvedValue([]);

    expect(await assignNextAgent()).toBeNull();
  });

  it("picks the agent with the fewest currently-assigned OPEN tickets", async () => {
    prismaMocks.findMany.mockResolvedValue([
      { id: "agent-a", _count: { assignedTickets: 3 } },
      { id: "agent-b", _count: { assignedTickets: 1 } },
      { id: "agent-c", _count: { assignedTickets: 2 } },
    ]);

    expect(await assignNextAgent()).toBe("agent-b");
  });

  it("breaks a tie by keeping the first agent in id order", async () => {
    // The query itself orders by id asc (see lib/ticket-assignment.ts),
    // and reduce() keeps the first minimum it finds — so among tied
    // agents, whichever sorts first by id wins. This locks that
    // tie-break in, since it's what makes the pick deterministic.
    prismaMocks.findMany.mockResolvedValue([
      { id: "agent-a", _count: { assignedTickets: 1 } },
      { id: "agent-b", _count: { assignedTickets: 1 } },
    ]);

    expect(await assignNextAgent()).toBe("agent-a");
  });

  it("queries only Role.AGENT with deletedAt: null, never Admins or soft-deleted users", async () => {
    prismaMocks.findMany.mockResolvedValue([]);

    await assignNextAgent();

    expect(prismaMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: Role.AGENT, deletedAt: null },
      })
    );
  });

  it("counts only OPEN tickets toward an agent's load, not RESOLVED/CLOSED ones", async () => {
    prismaMocks.findMany.mockResolvedValue([]);

    await assignNextAgent();

    expect(prismaMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { assignedTickets: { where: { status: TicketStatus.OPEN } } } },
        }),
      })
    );
  });
});
