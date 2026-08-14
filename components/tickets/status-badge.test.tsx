import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StatusBadge } from "@/components/tickets/status-badge";
import { TicketStatus } from "@/lib/generated/prisma/enums";

afterEach(cleanup);

// StatusBadge's only logic is the status→Badge-variant mapping — Badge
// itself (components/ui/badge.tsx) sets data-variant from whatever variant
// it's given, so that attribute is the observable proxy for "which variant
// did this status resolve to" without reaching into Tailwind class names.
describe("StatusBadge", () => {
  it.each([
    [TicketStatus.OPEN, "destructive"],
    [TicketStatus.RESOLVED, "secondary"],
    [TicketStatus.CLOSED, "outline"],
  ] as const)("renders %s with the %s badge variant", (status, variant) => {
    render(<StatusBadge status={status} />);

    const badge = screen.getByText(status);
    expect(badge.getAttribute("data-variant")).toBe(variant);
  });
});
