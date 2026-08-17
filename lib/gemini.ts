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

// Model split: geminiFlashLite() for the current callers, geminiFlash()
// kept in reserve for a task that needs the stronger tier.
//
// These use Google's "-latest" alias ids, not a dated snapshot like
// "gemini-2.5-flash". A pinned snapshot can get cut off from new API keys
// once Google moves on — that's exactly what happened here: a freshly
// created key hit a 404 whose body said "gemini-2.5-flash is no longer
// available to new users." The alias keeps pointing at whatever Google
// currently considers the standard flash/flash-lite model, so this stays
// correct without needing another manual bump later.

// Used by app/api/tickets/[id]/rephrase/route.ts and
// lib/ai-auto-resolve.ts's Path A confidence check.
export function geminiFlashLite() {
  return getGoogleProvider()("gemini-flash-lite-latest");
}

// No callers left as of this comment — kept for the stronger tier if a
// future unsupervised task needs it.
export function geminiFlash() {
  return getGoogleProvider()("gemini-flash-latest");
}
