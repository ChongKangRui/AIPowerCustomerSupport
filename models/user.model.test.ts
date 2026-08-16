import { describe, it, expect } from "vitest";

import { createUserSchema, updateUserSchema } from "@/models/user.model";

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

  // .trim() runs before .min(3). So surrounding whitespace cannot let a
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

describe("updateUserSchema", () => {
  it("accepts a valid name/email and a new password, normalizing them", () => {
    const result = updateUserSchema.safeParse({
      name: "  Ada Lovelace  ",
      email: "A@B.COM",
      password: "newpassword123",
    });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Ada Lovelace");
    expect(result.data?.email).toBe("a@b.com");
    expect(result.data?.password).toBe("newpassword123");
  });

  it("accepts an empty password, meaning 'leave it unchanged'", () => {
    const result = updateUserSchema.safeParse({
      name: "Ada Lovelace",
      email: "user@example.com",
      password: "",
    });

    expect(result.success).toBe(true);
    expect(result.data?.password).toBe("");
  });

  it("rejects a non-empty password shorter than 8 characters", () => {
    const result = updateUserSchema.safeParse({
      name: "Ada Lovelace",
      email: "user@example.com",
      password: "short1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a name shorter than 3 characters", () => {
    const result = updateUserSchema.safeParse({
      name: "Al",
      email: "user@example.com",
      password: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "too_small",
      path: ["name"],
    });
  });

  it("rejects a malformed email", () => {
    const result = updateUserSchema.safeParse({
      name: "Ada Lovelace",
      email: "not-an-email",
      password: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "invalid_format",
      path: ["email"],
    });
  });

  it("rejects a missing password field entirely (must be a string, even empty)", () => {
    const result = updateUserSchema.safeParse({
      name: "Ada Lovelace",
      email: "user@example.com",
    });

    expect(result.success).toBe(false);
  });
});
