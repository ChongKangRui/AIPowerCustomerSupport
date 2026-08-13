// dotenv/config must load before any test file is collected — lib/api-handler.ts
// imports @/auth -> @/lib/prisma, which constructs a PrismaClient at import
// time via resolveDatabaseUrl() and throws without DATABASE_URL/DB_PASSWORD.
// playwright.config.ts already does this for the same reason; Vitest doesn't
// auto-load .env the way `next dev` does.
import "dotenv/config";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    // Only this repo's *.test.ts convention — explicitly excludes e2e/'s
    // *.spec.ts files, which Vitest's default include pattern
    // (**/*.{test,spec}.*) would otherwise also match and try to run
    // (and fail on, since they use Playwright's test/expect, not Vitest's).
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", ".next-test/**", "e2e/**"],
  },
});
