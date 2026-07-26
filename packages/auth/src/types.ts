import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** ISO timestamp of User.passwordUpdatedAt at login; null if never set. */
      pwdAt?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    passwordUpdatedAt?: Date | null;
  }
}

/** JWT claim shape used in auth callbacks (avoid augmenting `next-auth/jwt` for tsc resolution). */
export type BloqerJwtToken = {
  id?: string;
  pwdAt?: string | null;
  name?: string | null;
  picture?: string | null;
};
