#!/usr/bin/env node
/**
 * Read-only check of demo tenant readiness for guide captures.
 * Usage: dotenv -e .env -- node docs/bloqer2.0/guides/capture/check-demo-env.js
 */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const email = process.env.SEED_USER_EMAIL;
  if (!email) {
    console.log(JSON.stringify({ error: "SEED_USER_EMAIL missing" }));
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true },
    });
    const projectCount = await prisma.project.count();
    const scheduleItemCount = await prisma.scheduleItem.count();
    const pos = await prisma.purchaseOrder.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    console.log(
      JSON.stringify(
        {
          userFound: Boolean(user),
          hasPassword: Boolean(user?.passwordHash),
          projectCount,
          scheduleItemCount,
          poByStatus: Object.fromEntries(pos.map((p) => [p.status, p._count._all])),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
