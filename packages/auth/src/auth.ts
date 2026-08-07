import { prisma } from "@bloqer/database";
import {
  authenticateWithPassword,
  getUserPasswordUpdatedAt,
  takeoverUnverifiedCredentialsStub,
} from "@bloqer/services";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { BloqerPrismaAdapter } from "./bloqer-prisma-adapter";
import type { BloqerJwtToken } from "./types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: BloqerPrismaAdapter(),
  providers: [
    ...authConfig.providers,
    Credentials({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const result = await authenticateWithPassword({
          email: typeof credentials?.email === "string" ? credentials.email : "",
          password: typeof credentials?.password === "string" ? credentials.password : "",
        });
        if (!result.ok) return null;
        return {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          image: result.user.image,
          passwordUpdatedAt: result.user.passwordUpdatedAt,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const email = user.email?.trim();
        if (!email) return false;
        const emailVerified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
        if (emailVerified === false) return false;

        await takeoverUnverifiedCredentialsStub({
          email,
          name: user.name,
          image: user.image,
        });

        // Auth.js runs this callback BEFORE adapter createUser for net-new Google users.
        // Only block when a DB row already exists and is disabled; allow null → createUser.
        const emailNorm = normalizeEmail(email);
        const row = await prisma.user.findFirst({
          where: { email: { equals: emailNorm, mode: "insensitive" } },
          select: { id: true, status: true, email: true, emailVerified: true },
        });
        if (row && (row.status === "SUSPENDED" || row.status === "INACTIVE")) {
          return false;
        }

        // Existing stub / INVITED row: Google proved ownership — activate + canonicalize email.
        if (row && (row.status === "INVITED" || !row.emailVerified || row.email !== emailNorm)) {
          try {
            await prisma.user.update({
              where: { id: row.id },
              data: {
                status: row.status === "INVITED" ? "ACTIVE" : row.status,
                emailVerified: row.emailVerified ?? new Date(),
                ...(row.email !== emailNorm ? { email: emailNorm } : {}),
              },
            });
          } catch {
            // Unique heal race — ignore; account link already established.
          }
        }
      }
      return true;
    },
    async jwt(params) {
      const base = authConfig.callbacks?.jwt;
      const baseResult = typeof base === "function" ? await base(params) : params.token;
      // Propagate null: absolute maxAge / explicit invalidation must not restore the old token.
      if (baseResult == null) return null;

      const token = baseResult as typeof params.token & BloqerJwtToken;

      // Always refresh from DB on sign-in so claim matches User.passwordUpdatedAt
      // (Credentials may set a stale/null pwdAt before this runs).
      if ((params.trigger === "signIn" || params.trigger === "signUp") && params.user?.id) {
        try {
          const at = await getUserPasswordUpdatedAt(params.user.id);
          token.pwdAt = at?.toISOString() ?? null;
        } catch {
          // Soft-fail: prefer completing login over blocking auth on a transient DB error.
          if (token.pwdAt === undefined) token.pwdAt = null;
        }
      }
      return token;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      const emailNorm = user.email ? normalizeEmail(user.email) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          status: "ACTIVE",
          ...(emailNorm && emailNorm !== user.email ? { email: emailNorm } : {}),
        },
      });
    },
  },
});
