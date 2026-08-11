import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Postgres driver out of the bundler — Prisma's pg driver adapter
  // needs the real Node module at runtime.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
