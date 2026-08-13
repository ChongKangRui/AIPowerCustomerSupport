import { describe, it, expect } from "vitest";

import { createUserSchema } from "@/models/user.model";

describe("createUserSchema", () => {
  it("accepts a valid name/email/password and normalizes them", () => {
    const result = createUserSchema.safeParse({
      name: "  Ada Lovelace  ",
      email: "A@B.COM",
      password: "password123",
    });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Ada Lovelace");
    expect(result.data?.email).toBe("a@b.com");
  });

  it("rejects a name shorter than 3 characters", () => {
    const result = createUserSchema.safeParse({
      name: "Al",
      email: "user@example.com",
      password: "password123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "too_small",
      path: ["name"],
    });
  });

  // .trim() runs before .min(3), so surrounding whitespace doesn't let a
  // too-short name sneak past validation.
  it("rejects a name that is too short after trimming", () => {
    const result = createUserSchema.safeParse({
      name: "  Al  ",
      email: "user@example.com",
      password: "password123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "too_small",
      path: ["name"],
    });
  });

  it("rejects a malformed email", () => {
    const result = createUserSchema.safeParse({
      name: "Ada Lovelace",
      email: "not-an-email",
      password: "password123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "invalid_format",
      path: ["email"],
    });
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = createUserSchema.safeParse({
      name: "Ada Lovelace",
      email: "user@example.com",
      password: "short1",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "too_small",
      path: ["password"],
    });
  });

  it("rejects a missing field", () => {
    const result = createUserSchema.safeParse({
      email: "user@example.com",
      password: "password123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "invalid_type",
      path: ["name"],
    });
  });
});
