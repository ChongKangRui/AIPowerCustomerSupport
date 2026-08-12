import "dotenv/config";

import bcrypt from "bcryptjs";

import { prisma } from "../lib/prisma";

// Run with: npm run db:seed
async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: {
      email: adminEmail,
      name: "Admin",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });

  console.log(`Seeded admin: ${admin.email}`);

  const agentEmail = process.env.SEED_AGENT_EMAIL ?? "agent@example.com";
  const agentPassword = process.env.SEED_AGENT_PASSWORD ?? "agent1234";

  const agent = await prisma.user.upsert({
    where: { email: agentEmail },
    update: { role: "AGENT" },
    create: {
      email: agentEmail,
      name: "Agent",
      role: "AGENT",
      passwordHash: await bcrypt.hash(agentPassword, 10),
    },
  });

  console.log(`Seeded agent: ${agent.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
