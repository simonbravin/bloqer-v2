import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@bloqer/database";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  events: {
    async createUser({ user }) {
      if (user.id) {
        await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
      }
    },
  },
});
