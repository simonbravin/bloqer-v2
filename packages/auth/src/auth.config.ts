import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { BloqerJwtToken } from "./types";

/**
 * Edge-safe auth options (no Prisma / Node-only imports).
 * Used by middleware; keep in sync with {@link "./auth"} which adds Credentials + DB adapter.
 */
export const authConfig = {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env["AUTH_GOOGLE_ID"] ?? "",
      clientSecret: process.env["AUTH_GOOGLE_SECRET"] ?? "",
      // Needed so Google can attach to an existing User row (e.g. unverified credentials stub).
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8h — shorter window after password reset without edge DB checks
  },
  callbacks: {
    jwt({ token, user, trigger, session }) {
      const t = token as typeof token & BloqerJwtToken;
      if (user?.id) {
        t.id = user.id;
        if (user.name !== undefined) t.name = user.name;
        if (user.image !== undefined) t.picture = user.image;
        const withPwd = user as { passwordUpdatedAt?: Date | null };
        if ("passwordUpdatedAt" in withPwd) {
          t.pwdAt = withPwd.passwordUpdatedAt
            ? withPwd.passwordUpdatedAt.toISOString()
            : null;
        }
      }
      if (trigger === "update" && session && typeof session === "object") {
        const s = session as { name?: unknown; image?: unknown };
        if (typeof s.name === "string" || s.name === null) t.name = s.name as string | null;
        if (typeof s.image === "string" || s.image === null) t.picture = s.image as string | null;
      }
      return t;
    },
    session({ session, token }) {
      const t = token as typeof token & BloqerJwtToken;
      if (session.user && t.id) {
        session.user.id = t.id;
      }
      if (session.user) {
        if (t.name !== undefined) session.user.name = t.name;
        if (t.picture !== undefined) session.user.image = t.picture;
        session.user.pwdAt = t.pwdAt ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
