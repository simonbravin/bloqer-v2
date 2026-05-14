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
    jwt({ token, user, trigger, session }) {
      if (user?.id) {
        token.id = user.id;
        if (user.name !== undefined) token.name = user.name;
        if (user.image !== undefined) token.picture = user.image;
      }
      if (trigger === "update" && session && typeof session === "object") {
        const s = session as { name?: unknown; image?: unknown };
        if (typeof s.name === "string" || s.name === null) token.name = s.name as string | null;
        if (typeof s.image === "string" || s.image === null) token.picture = s.image as string | null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      if (session.user) {
        if (token.name !== undefined) session.user.name = token.name as string | null | undefined;
        if (token.picture !== undefined) session.user.image = token.picture as string | null | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
