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
import { hasVerifiedGoogleEmail } from "./google-email-verification";
import { resolveSignInPasswordEpoch } from "./session-password-epoch";
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
        if (!hasVerifiedGoogleEmail(profile)) return false;

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
            const updated = await prisma.user.updateMany({
              where: {
                id: row.id,
                status: row.status,
                email: row.email,
                emailVerified: row.emailVerified,
              },
              data: {
                status: row.status === "INVITED" ? "ACTIVE" : row.status,
                emailVerified: row.emailVerified ?? new Date(),
                ...(row.email !== emailNorm ? { email: emailNorm } : {}),
              },
            });
            // A concurrent suspension/reset must not be overwritten by stale login data.
            if (updated.count !== 1) return false;
          } catch {
            // Fail closed; a subsequent login can retry a benign canonicalization race.
            return false;
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

      if ((params.trigger === "signIn" || params.trigger === "signUp") && params.user?.id) {
        try {
          token.pwdAt = await resolveSignInPasswordEpoch(
            params.account?.provider,
            { id: params.user.id, passwordUpdatedAt: params.user.passwordUpdatedAt },
            getUserPasswordUpdatedAt,
          );
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
      await prisma.user.updateMany({
        where: { id: user.id, status: { in: ["ACTIVE", "INVITED"] } },
        data: {
          status: "ACTIVE",
          ...(emailNorm && emailNorm !== user.email ? { email: emailNorm } : {}),
        },
      });
    },
  },
});
