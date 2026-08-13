import { cache } from "react";

import { auth } from "@/auth";

// Server Component-side session dedup: app/(main)/layout.tsx and any nested
// page (e.g. app/(main)/users/page.tsx) that needs its own extra check
// (role, etc.) both need the session — without this, each would call
// auth() itself, and auth() has no built-in memoization of its own (it's a
// real DB lookup every time, confirmed straight from NextAuth's source —
// see lib/api-handler.ts's equivalent comment for the API-route side of
// this same problem). cache() memoizes per request (Next.js's App Router
// scopes it to the same request-scoped context used everywhere else for
// isolating concurrent requests), so every getSession() call within one
// request's render — however many components call it, wherever they sit in
// the tree — shares the single underlying auth() call instead of repeating
// it. This is the Server Component equivalent of the session-as-4th-arg
// dedup withApiHandler already does for API routes.
//
// Wrapping a plain, single-signature function (not auth itself) in cache()
// sidesteps auth()'s own overload ambiguity the same way lib/api-handler.ts
// works around it for typing purposes.
function fetchSession() {
  return auth();
}

export const getSession = cache(fetchSession);
