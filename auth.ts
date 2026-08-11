import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";

// Database session strategy (tech-stack.md). Note there is deliberately *no*
// Credentials provider here: Auth.js throws `UnsupportedStrategy` if one is
// present without `strategy: "jwt"`. Password login is handled by a Server
// Action that verifies the hash and creates the Session row through the adapter
// directly — see lib/auth-actions.ts.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  providers: [],
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // With the database strategy the full user row is passed in, so role and id
    // can be surfaced on the session without an extra query at every call site.
    session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role;
      return session;
    },
  },
});
