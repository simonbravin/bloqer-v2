import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { assertNonProductionDatabase } from "./assert-non-production-db";
import { DOCS_GUIDE_IDS, seedDocsGuideDataset } from "./seed-docs-guide";

/**
 * Demo seed: one user + tenant + company + membership.
 *
 * Role permission ceilings (OWNER, PROJECT_MANAGER, FINANCE, etc.) are defined in
 * `packages/domain/src/permissions/matrix.ts` and product docs
 * `docs/bloqer2.0/00-product/PERMISSIONS_MATRIX.md`. This file does not encode
 * per-module grants — only the Prisma `UserRole` array on `UserMembership.roles`.
 */

const prisma = new PrismaClient();

async function main() {
  assertNonProductionDatabase();
  const email = process.env["SEED_USER_EMAIL"];
  if (!email) throw new Error("SEED_USER_EMAIL env var is required");

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Seed User", status: "ACTIVE" },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Tenant",
      slug: "demo",
      timezone: "America/Argentina/Buenos_Aires",
      baseCurrency: "ARS",
    },
  });

  const company = await prisma.company.upsert({
    where: { id: DOCS_GUIDE_IDS.companyId },
    update: {},
    create: {
      id: DOCS_GUIDE_IDS.companyId,
      tenantId: tenant.id,
      name: "Demo Company",
      status: "ACTIVE",
    },
  });

  await prisma.userMembership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: {},
    create: {
      userId: user.id,
      tenantId: tenant.id,
      companyId: company.id,
      roles: ["OWNER"],
      status: "ACTIVE",
    },
  });

  const seedPassword = process.env["SEED_USER_PASSWORD"]?.trim();
  if (seedPassword) {
    const passwordHash = await hash(seedPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        emailVerified: new Date(),
        status: "ACTIVE",
      },
    });
    console.log("Seeded credentials password for seed user (from SEED_USER_PASSWORD)");
  }

  console.log(`Seeded: user=${email}, tenant=demo, membership=OWNER`);

  if (process.env["DOCS_DEMO_SEED"] === "1") {
    await seedDocsGuideDataset(prisma);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
