import { PrismaClient } from "@prisma/client";

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
    where: { id: "seed-company-id" },
    update: {},
    create: {
      id: "seed-company-id",
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

  console.log(`Seeded: user=${email}, tenant=demo, membership=OWNER`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
