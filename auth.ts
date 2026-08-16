import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session";

// Database session strategy (tech-stack.md).
//
// There is deliberately *no* Credentials provider here: Auth.js throws
// `UnsupportedStrategy` if one is present without `strategy: "jwt"`.
// Password login is instead handled by hand-rolled Route Handlers
// (app/api/login, app/api/logout) that verify the password hash and
// create/delete the Session row directly — see lib/session.ts.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  providers: [],
  session: {
    strategy: "database",
    // Kept in sync with lib/session.ts, which is what actually creates these
    // rows — see the comment there for why this needs to be explicit.
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // With the database strategy, `user` here is the *entire raw Prisma
    // User row* — the adapter doesn't know which columns are "public" —
    // including passwordHash.
    //
    // Rebuild session.user as an explicit allowlist rather than just
    // adding fields onto whatever the adapter handed in. Otherwise every
    // extra column we ever add to User leaks into the client-visible
    // session JSON.
    session({ session, user }) {
      return {
        ...session,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        },
      };
    },
  },
});
