import { createGoogleGenerativeAI } from "@ai-sdk/google";

// This builds the Google provider lazily, the first time a caller actually
// asks for a model, and caches it after that.
//
// lib/gmail.ts's `gmail` client is a plain module-level singleton, built
// eagerly at import time — that's fine there because it just wraps an HTTP
// client with no required config check. This one is different: it reads
// GEMINI_API_KEY and throws if it's missing. Vitest doesn't load .env
// before importing modules (see tech-stack.md's Testing gotchas), so
// building this eagerly would throw in any test that merely imports a
// file that imports this one — even a test that never calls a model.
let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | undefined;

function getGoogleProvider() {
  if (!googleProvider) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    googleProvider = createGoogleGenerativeAI({ apiKey });
  }
  return googleProvider;
}

// Model split. The axis that actually matters here is "does a human
// review this before it ships," not "does a customer eventually see it"
// — an earlier version of this file split on the latter, which picked
// the wrong tier for rephrasing (see geminiFlashLite's comment below).
// Quality goes to anything that ships unsupervised, straight from the
// model to the customer. Lite goes to anything a human reviews before it
// goes anywhere, or that's a narrow, mechanical transformation rather
// than open-ended synthesis.
//
// These use Google's "-latest" alias ids, not a dated snapshot like
// "gemini-2.5-flash". A pinned snapshot can get cut off from new API keys
// once Google moves on — that's exactly what happened here: a freshly
// created key hit a 404 whose body said "gemini-2.5-flash is no longer
// available to new users." The alias keeps pointing at whatever Google
// currently considers the standard flash/flash-lite model, so this stays
// correct without needing another manual bump later.

// Used by app/api/tickets/[id]/rephrase/route.ts. Rephrasing an agent's
// draft is a narrow, mechanical restyle — it doesn't decide what to say,
// the agent already did — and the agent reads the result and can edit or
// reject it before Send. Genuinely lighter task, genuinely supervised.
// Also unused by anything else, so it draws from a separate quota pool
// than geminiFlash() below — see HOW-IT-WORKS.md §8.4.
export function geminiFlashLite() {
  return getGoogleProvider()("gemini-flash-lite-latest");
}

// Path A's confidence check (lib/ai-auto-resolve.ts) uses this one, not
// the Lite model above — and, as of this comment, it's the only caller
// left. Its `response` field goes straight to sendGmailReply() with zero
// human review when confident; nobody reads it before the customer does.
// That's real justification for the stronger model, unlike rephrasing.
export function geminiFlash() {
  return getGoogleProvider()("gemini-flash-latest");
}
