import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@bloqer/database";
import type { Adapter, AdapterUser } from "next-auth/adapters";

/** Same rule as invitation / credentials services — keep User.email canonical. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Prisma adapter with case-insensitive email lookup and lowercase persistence.
 * Prevents duplicate User rows when Google returns mixed-case emails vs credentials stubs.
 */
export function BloqerPrismaAdapter(): Adapter {
  const base = PrismaAdapter(prisma) as Adapter;

  return {
    ...base,
    async createUser(data) {
      const email = data.email ? normalizeEmail(data.email) : data.email;
      return base.createUser!({ ...data, email });
    },
    async getUserByEmail(email) {
      const emailNorm = normalizeEmail(email);
      const exact = await prisma.user.findUnique({ where: { email: emailNorm } });
      if (exact) return exact as AdapterUser;

      const insensitive = await prisma.user.findFirst({
        where: { email: { equals: emailNorm, mode: "insensitive" } },
      });
      if (!insensitive) return null;

      // Heal legacy mixed-case rows so future lookups hit the unique index.
      if (insensitive.email !== emailNorm) {
        try {
          return (await prisma.user.update({
            where: { id: insensitive.id },
            data: { email: emailNorm },
          })) as AdapterUser;
        } catch {
          return insensitive as AdapterUser;
        }
      }
      return insensitive as AdapterUser;
    },
  };
}
