import { PrismaPg } from "@prisma/adapter-pg";

import { resolveDatabaseUrl } from "@/lib/database-url";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Reuses the client across hot reloads in dev. This stops the app from exhausting Neon connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
