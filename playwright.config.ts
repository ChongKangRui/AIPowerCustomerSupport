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

  // Playwright's default expect() timeout (5s) is tuned for a production
  // server. `next dev` compiles each page on-demand the first time it's
  // actually requested, and a cold compile under this suite's parallel
  // workers can take longer than that — a test that's simply first to hit
  // an uncompiled route (or hits one while other workers are also
  // compiling/rendering) can time out waiting for a redirect that's still
  // legitimately in flight, then pass cleanly on a rerun once Next has
  // cached that route. Not a fix for a real bug — just enough headroom for
  // dev-mode compilation latency that a production build wouldn't have.
  expect: {
    timeout: 10 * 1000,
  },

  projects: [
    {
      // Logs in once per role (e2e/auth.setup.ts) and saves storageState to
      // e2e/.auth/*.json, so specs that just need to *start out*
      // authenticated (not test the login flow itself) can load it via
      // `test.use({ storageState })` instead of re-driving the UI login in
      // every test. See e2e/auth.setup.ts for the shared-state caveat.
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
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
      // Own build/lock directory (see next.config.ts) — Next 16 locks
      // `<distDir>/lock` per directory, not per port, so without this a
      // `npm run dev` already running would block this webServer even
      // though it's on a different port.
      NEXT_DIST_DIR: ".next-test",
    },
  },
});
