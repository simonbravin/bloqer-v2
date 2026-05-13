import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe auth options (no Prisma / Node-only imports).
 * Used by middleware; keep in sync with {@link "./auth"} which adds the DB adapter.
 */
export const authConfig = {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env["AUTH_GOOGLE_ID"] ?? "",
      clientSecret: process.env["AUTH_GOOGLE_SECRET"] ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
