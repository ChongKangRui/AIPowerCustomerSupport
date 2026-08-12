import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

import { resolveTestDatabaseUrl } from "./lib/database-url";

// Separate port from `npm run dev`'s default 3000, so e2e runs don't collide
// with a dev server you already have open.
const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  // Points a dedicated test database at the current migrations + seed data
  // before any test runs — see e2e/global-setup.ts and lib/database-url.ts.
  globalSetup: require.resolve("./e2e/global-setup.ts"),

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Boots the app itself against the test database (not dev/production) by
  // overriding DATABASE_URL for this one spawned process only — resolveDatabaseUrl()
  // in lib/database-url.ts checks process.env.DATABASE_URL first, so this wins
  // regardless of whether your local .env uses a full URL or DB_HOST/etc. pieces.
  webServer: {
    command: "npx next dev",
    url: baseURL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_URL: resolveTestDatabaseUrl(),
      PORT,
      AUTH_URL: baseURL,
    },
  },
});
