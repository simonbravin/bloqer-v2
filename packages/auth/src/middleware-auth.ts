import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/** Same JWT/session behavior as {@link "./auth"} without Prisma (Edge / Vercel middleware size). */
export const { auth } = NextAuth(authConfig);
