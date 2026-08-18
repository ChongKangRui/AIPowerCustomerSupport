import { describe, expect, it } from "vitest";

import { buildChartPoints, monthKey, monthsBetween, type TicketForChart } from "@/lib/dashboard-analytics";

describe("monthsBetween", () => {
  it("returns 1 for two dates in the same month", () => {
    expect(monthsBetween(new Date(2026, 2, 3), new Date(2026, 2, 20))).toBe(1);
  });

  it("counts the partial current month, not just full months elapsed", () => {
    // Jan 15 -> Mar 3: Jan->Feb, Feb->Mar are the two full months, plus the partial current one = 3.
    expect(monthsBetween(new Date(2026, 0, 15), new Date(2026, 2, 3))).toBe(3);
  });

  it("crosses a year boundary correctly", () => {
    // Nov 2025 -> Feb 2026: Nov, Dec, Jan, Feb = 4 months.
    expect(monthsBetween(new Date(2025, 10, 1), new Date(2026, 1, 1))).toBe(4);
  });

  it("floors at 1 even if the range is somehow negative", () => {
    expect(monthsBetween(new Date(2026, 5, 1), new Date(2026, 0, 1))).toBe(1);
  });
});

describe("monthKey", () => {
  it("formats as YYYY-MM, zero-padding single-digit months", () => {
    expect(monthKey(new Date(2026, 2, 15))).toBe("2026-03");
  });

  it("does not zero-pad a two-digit month", () => {
    expect(monthKey(new Date(2026, 10, 1))).toBe("2026-11");
  });
});

// rangeStart anchors every test below to Jan 1 2026, 3 months back: Jan,
// Feb, Mar. Keeping the window this small keeps each test's fixture
// tickets easy to eyeball against which bucket they should land in.
const rangeStart = new Date(2026, 0, 1);
const monthsBack = 3;

function ticket(overrides: Partial<TicketForChart>): TicketForChart {
  return {
    createdAt: new Date(2026, 0, 10),
    resolvedAt: null,
    resolvedByAi: false,
    ...overrides,
  };
}

describe("buildChartPoints", () => {
  it("returns one zeroed point per month in the window when there are no tickets", () => {
    const points = buildChartPoints([], rangeStart, monthsBack);

    expect(points.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(points.every((p) => p.ticketsCreated === 0 && p.ticketsResolved === 0)).toBe(true);
  });

  it("counts a ticket toward ticketsCreated in its createdAt month", () => {
    const points = buildChartPoints([ticket({ createdAt: new Date(2026, 1, 5) })], rangeStart, monthsBack);

    const feb = points.find((p) => p.month === "2026-02")!;
    expect(feb.ticketsCreated).toBe(1);
    expect(points.find((p) => p.month === "2026-01")!.ticketsCreated).toBe(0);
  });

  it("counts resolved metrics in resolvedAt's month, separately from ticketsCreated's createdAt month", () => {
    // Created in Jan, resolved in Mar — the two should land in different buckets.
    const points = buildChartPoints(
      [ticket({ createdAt: new Date(2026, 0, 5), resolvedAt: new Date(2026, 2, 5), resolvedByAi: false })],
      rangeStart,
      monthsBack
    );

    const jan = points.find((p) => p.month === "2026-01")!;
    const mar = points.find((p) => p.month === "2026-03")!;
    expect(jan.ticketsCreated).toBe(1);
    expect(jan.ticketsResolved).toBe(0);
    expect(mar.ticketsCreated).toBe(0);
    expect(mar.ticketsResolved).toBe(1);
    expect(mar.agentResolved).toBe(1);
    expect(mar.aiResolved).toBe(0);
  });

  it("splits resolved counts by resolvedByAi", () => {
    const points = buildChartPoints(
      [
        ticket({ resolvedAt: new Date(2026, 0, 20), resolvedByAi: true }),
        ticket({ resolvedAt: new Date(2026, 0, 21), resolvedByAi: false }),
      ],
      rangeStart,
      monthsBack
    );

    const jan = points.find((p) => p.month === "2026-01")!;
    expect(jan.ticketsResolved).toBe(2);
    expect(jan.aiResolved).toBe(1);
    expect(jan.agentResolved).toBe(1);
  });

  it("leaves an unresolved ticket out of every resolved metric", () => {
    const points = buildChartPoints([ticket({ resolvedAt: null })], rangeStart, monthsBack);

    const jan = points.find((p) => p.month === "2026-01")!;
    expect(jan.ticketsCreated).toBe(1);
    expect(jan.ticketsResolved).toBe(0);
    expect(jan.avgResolutionHours).toBe(0);
  });

  it("computes avgResolutionHours as the mean resolution time of tickets resolved that month", () => {
    const points = buildChartPoints(
      [
        // 24 hours to resolve.
        ticket({ createdAt: new Date(2026, 0, 1, 0), resolvedAt: new Date(2026, 0, 2, 0) }),
        // 48 hours to resolve. Mean of 24 and 48 is 36.
        ticket({ createdAt: new Date(2026, 0, 3, 0), resolvedAt: new Date(2026, 0, 5, 0) }),
      ],
      rangeStart,
      monthsBack
    );

    expect(points.find((p) => p.month === "2026-01")!.avgResolutionHours).toBe(36);
  });

  it("silently drops a ticket whose relevant date falls outside the window", () => {
    // Both dates are well before rangeStart — neither should land in any bucket.
    const points = buildChartPoints(
      [ticket({ createdAt: new Date(2025, 5, 1), resolvedAt: new Date(2025, 5, 2) })],
      rangeStart,
      monthsBack
    );

    expect(points.every((p) => p.ticketsCreated === 0 && p.ticketsResolved === 0)).toBe(true);
  });
});
