import { expect, test } from "@playwright/test";

import { AGENT } from "./seeded-users";

// lib/rate-limiter.ts gates `RATE_LIMITING_ENABLED` to `NODE_ENV ===
// "production"` only, and app/api/login/route.ts skips every limiter
// get()/consume()/delete() call entirely when that flag is off (see the
// `RATE_LIMITING_ENABLED ? ... : [null, null]` branch and the `if
// (RATE_LIMITING_ENABLED)` guards around consume()). This suite's webServer
// runs `next dev`, i.e. NODE_ENV "development" — so the limiter is fully
// inert here: no email+IP or per-IP counter is read or written on any
// failure. That also means this test is safe to run in parallel with every
// other spec that logs in (successfully or not) as this same seeded email —
// there's no shared counter for two workers to race on.
//
// This test exists to document that current behavior and catch a regression
// (e.g. someone flipping the NODE_ENV gate, or wiring rate limiting into a
// dev/test environment) — it should start failing loudly with a 429 if that
// ever happens.
test("repeated failed logins for the same email keep returning a plain 401, never a 429, outside production", async ({
  request,
}) => {
  const attempts = 8;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await request.post("/api/login", {
      data: { email: AGENT.email, password: `wrong-password-${attempt}` },
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid email or password" });
  }
});
