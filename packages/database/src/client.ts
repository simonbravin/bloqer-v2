import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  if (process.env["NODE_ENV"] === "development") {
    return new PrismaClient({ log: ["error", "warn"] });
  }

  const client = new PrismaClient({ log: [{ level: "error", emit: "event" }] });
  client.$on("error", ({ timestamp }) => {
    // Prisma's raw error can include the invocation and field values from a failed write.
    console.error(JSON.stringify({ ts: timestamp.toISOString(), level: "error", message: "prisma_query_failed" }));
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}
