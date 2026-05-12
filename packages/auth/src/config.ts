import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@bloqer/database";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      // Empty string fallback lets the app boot locally without real Google creds.
      clientId: process.env["AUTH_GOOGLE_ID"] ?? "",
      clientSecret: process.env["AUTH_GOOGLE_SECRET"] ?? "",
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
      }
    },
  },
  pages: {
    signIn: "/login",
  },
});
