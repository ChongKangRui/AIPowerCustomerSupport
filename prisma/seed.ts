import "dotenv/config";

import bcrypt from "bcryptjs";

import { prisma } from "../lib/prisma";
import { Role } from "../lib/generated/prisma/enums";
import { kbEntries } from "./kb-entries";

// Run with: npm run db:seed
async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN },
    create: {
      email: adminEmail,
      name: "Admin",
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });

  console.log(`Seeded admin: ${admin.email}`);

  const agentEmail = process.env.SEED_AGENT_EMAIL ?? "agent@example.com";
  const agentPassword = process.env.SEED_AGENT_PASSWORD ?? "agent1234";

  const agent = await prisma.user.upsert({
    where: { email: agentEmail },
    update: { role: Role.AGENT },
    create: {
      email: agentEmail,
      name: "Agent",
      role: Role.AGENT,
      passwordHash: await bcrypt.hash(agentPassword, 10),
    },
  });

  console.log(`Seeded agent: ${agent.email}`);

  // Path A (AI auto-resolve) reads this table at runtime — see
  // lib/knowledge-base.ts. title is @unique, so this upserts by title
  // and is safe to re-run after editing prisma/kb-entries.ts.
  for (const entry of kbEntries) {
    await prisma.knowledgeBaseEntry.upsert({
      where: { title: entry.title },
      update: { content: entry.content, category: entry.category },
      create: entry,
    });
  }

  console.log(`Seeded ${kbEntries.length} knowledge base entries`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
