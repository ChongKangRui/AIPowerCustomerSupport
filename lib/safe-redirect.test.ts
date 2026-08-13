import { describe, it, expect } from "vitest";

import { safeRedirectTarget } from "@/lib/safe-redirect";

describe("safeRedirectTarget", () => {
  it("defaults to / for undefined", () => {
    expect(safeRedirectTarget(undefined)).toBe("/");
  });

  it("defaults to / for null", () => {
    expect(safeRedirectTarget(null)).toBe("/");
  });

  it("defaults to / for an empty string", () => {
    expect(safeRedirectTarget("")).toBe("/");
  });

  it("defaults to / for a relative path with no leading slash", () => {
    expect(safeRedirectTarget("dashboard")).toBe("/");
  });

  it("defaults to / for an absolute external URL", () => {
    expect(safeRedirectTarget("https://evil.example")).toBe("/");
  });

  it("defaults to / for a protocol-relative URL", () => {
    expect(safeRedirectTarget("//evil.example")).toBe("/");
  });

  it("defaults to / when given an array (not a string)", () => {
    expect(safeRedirectTarget(["/dashboard"])).toBe("/");
  });

  it("passes through the root path", () => {
    expect(safeRedirectTarget("/")).toBe("/");
  });

  it("passes through a same-origin path unchanged", () => {
    expect(safeRedirectTarget("/dashboard")).toBe("/dashboard");
  });

  it("preserves a query string on a same-origin path", () => {
    expect(safeRedirectTarget("/dashboard?tab=billing")).toBe("/dashboard?tab=billing");
  });
});
