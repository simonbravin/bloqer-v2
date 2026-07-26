import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@bloqer/database";
import {
  authenticateWithPassword,
  getUserPasswordUpdatedAt,
  takeoverUnverifiedCredentialsStub,
} from "@bloqer/services";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import type { BloqerJwtToken } from "./types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
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
      }
      return true;
    },
    async jwt(params) {
      const base = authConfig.callbacks?.jwt;
      const token = (typeof base === "function" ? await base(params) : params.token) as
        | (typeof params.token & BloqerJwtToken)
        | undefined;
      if (!token) return params.token;

      // Always refresh from DB on sign-in so claim matches User.passwordUpdatedAt
      // (Credentials may set a stale/null pwdAt before this runs).
      if ((params.trigger === "signIn" || params.trigger === "signUp") && params.user?.id) {
        const at = await getUserPasswordUpdatedAt(params.user.id);
        token.pwdAt = at?.toISOString() ?? null;
      }
      return token;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { status: "ACTIVE" },
        });
      }
    },
  },
});
