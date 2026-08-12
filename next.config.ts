import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Postgres driver out of the bundler — Prisma's pg driver adapter
  // needs the real Node module at runtime.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],

  // Next.js 16 locks its build output directory (`<distDir>/lock`) so only
  // one `next dev`/`next build` can run against it at a time — scoped to the
  // directory, not the port. playwright.config.ts's webServer sets
  // NEXT_DIST_DIR so its `next dev` (already on its own port + test DB)
  // also gets its own build directory, and so its own lock, letting it run
  // alongside a normal `npm run dev` instead of colliding on `.next/lock`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
