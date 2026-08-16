import { describe, it, expect } from "vitest";

import { loginSchema } from "@/models/auth.model";

describe("loginSchema", () => {
  it("accepts a valid email/password and lowercases the email", () => {
    const result = loginSchema.safeParse({ email: "A@B.COM", password: "x" });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("a@b.com");
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "secret" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "invalid_format",
      path: ["email"],
    });
  });

  // .email() checks the raw value's format before .trim() ever runs. So
  // the later .trim() call does not rescue surrounding whitespace. This
  // test locks in that current, non-obvious behavior instead of assuming
  // it.
  it("rejects an email with surrounding whitespace", () => {
    const result = loginSchema.safeParse({ email: "  a@b.co  ", password: "secret" });

    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "too_small",
      path: ["password"],
    });
  });

  it("rejects a missing password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "invalid_type",
      path: ["password"],
    });
  });

  it("rejects a missing email", () => {
    const result = loginSchema.safeParse({ password: "secret" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "invalid_type",
      path: ["email"],
    });
  });

  it("rejects a non-string password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: 123 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "invalid_type",
      path: ["password"],
    });
  });
});
