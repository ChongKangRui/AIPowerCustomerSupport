import { prisma } from "@/lib/prisma";
import { Role, TicketStatus } from "@/lib/generated/prisma/enums";

/**
 * Path B's auto-assignment (project-scope.md: "escalated tickets are
 * assigned via auto round robin"). Picks the eligible agent with the
 * fewest currently-assigned OPEN tickets, not a fixed rotation.
 *
 * A strict turn-taking cursor (like lib/gmail.ts's EmailSyncState
 * watermark) would need its own persisted state, and that state can
 * drift out of sync with reality: an admin manually reassigning tickets
 * by hand in between auto-assignments (see app/api/tickets/[id]/assign)
 * wouldn't move the cursor, so the next auto-pick could still land on
 * someone already overloaded. Recomputing "who has the least work right
 * now" from the real data every time sidesteps that entirely, at the
 * cost of not being a literal rotation.
 *
 * Only Role.AGENT counts as eligible — Admins can still be assigned
 * manually (see assign-menu.tsx), but the auto-picker shouldn't put
 * escalated tickets on an Admin's plate.
 *
 * Returns null if no eligible agent exists (none seeded, or all
 * soft-deleted). Callers should leave the ticket unassigned in that
 * case, same as today's default — not treat it as an error.
 */
export async function assignNextAgent(): Promise<string | null> {
  const agents = await prisma.user.findMany({
    where: { role: Role.AGENT, deletedAt: null },
    select: {
      id: true,
      _count: { select: { assignedTickets: { where: { status: TicketStatus.OPEN } } } },
    },
    orderBy: { id: "asc" }, // deterministic tie-break below
  });

  if (agents.length === 0) return null;

  const leastLoaded = agents.reduce((least, agent) =>
    agent._count.assignedTickets < least._count.assignedTickets ? agent : least
  );

  return leastLoaded.id;
}
