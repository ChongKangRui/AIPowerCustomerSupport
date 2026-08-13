import "dotenv/config";

import { bootstrapHistoryId, pollGmailAndCreateTickets } from "../lib/gmail";
import { prisma } from "../lib/prisma";

// Manual test entrypoint for lib/gmail.ts while the real cron route
// (app/api/cron/poll-gmail/route.ts) isn't built yet — see
// implementation-plan.md Phase 2. Run with: npm run gmail:poll
async function main() {
  await bootstrapHistoryId();
  const stats = await pollGmailAndCreateTickets();
  console.log("Poll result:", stats);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
