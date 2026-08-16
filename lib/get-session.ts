import { cache } from "react";

import { auth } from "@/auth";

// auth() has no built-in memoization. It runs a real DB lookup every
// time, confirmed from NextAuth's own source. (See the matching comment
// in lib/api-handler.ts for the API-route side of this same problem.)
//
// This wraps auth() in a plain, single-signature function instead of
// calling `cache(auth)` directly below. That avoids auth()'s own overload
// ambiguity, the same way lib/api-handler.ts works around it for typing.
function fetchSession() {
  return auth();
}

// This is the Server Component session dedup. app/(main)/layout.tsx and
// any nested page (e.g. app/(main)/users/page.tsx) that needs its own
// extra check (role, etc.) both need the session. Without this, each one
// would call fetchSession() itself and repeat the DB lookup.
//
// cache() memoizes per request. Next.js's App Router scopes it to the
// same request-scoped context it uses to isolate concurrent requests.
// Every getSession() call within one request's render shares the single
// underlying auth() call, no matter how many components call it or
// where they sit in the tree.
// This is the Server Component equivalent of the session-as-4th-argument
// dedup that withApiHandler already does for API routes.
export const getSession = cache(fetchSession);
