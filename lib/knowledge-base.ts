import { prisma } from "@/lib/prisma";

// Formats every seeded KnowledgeBaseEntry into one prompt-ready block for
// Path A (lib/ai-auto-resolve.ts). The whole table is small by design
// (project-scope.md: ~10-20 manually curated entries), so this just
// stuffs everything into context rather than doing any retrieval/ranking.
export async function getKnowledgeBaseContext(): Promise<string> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    orderBy: { title: "asc" },
    select: { title: true, content: true, category: true },
  });

  return entries
    .map((entry) => `# ${entry.title}${entry.category ? ` (${entry.category})` : ""}\n${entry.content}`)
    .join("\n\n");
}
