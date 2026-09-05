/**
 * Seed AI adversarial fixtures on Neon DEV.
 * Usage (repo root):
 *   pnpm --filter @bloqer/database exec tsx ../services/scripts/ai-seed-adversarial.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadRootEnv(): void {
  const candidates = [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")];
  for (const envPath of candidates) {
    try {
      for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!m) continue;
        let v = m[2]!;
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (process.env[m[1]!] === undefined) process.env[m[1]!] = v;
      }
      return;
    } catch {
      /* next */
    }
  }
}

function assertNonProd(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (url.includes("ep-cold-mouse-appkpn84")) {
    console.error("Refusing production Neon host.");
    process.exit(1);
  }
  const host = url.match(/@(ep-[^.]+)/)?.[1] ?? "unknown";
  console.log(`[ai-seed] DATABASE host=${host}`);
}

async function main(): Promise<void> {
  loadRootEnv();
  assertNonProd();
  const { prisma } = await import("@bloqer/database");
  const { seedAiAdversarialFixtures } = await import(
    "../src/ai/fixtures/seed-adversarial-tenants.ts"
  );
  const result = await seedAiAdversarialFixtures(prisma);
  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantAId: result.tenantAId,
        tenantBId: result.tenantBId,
        projectA1Id: result.projectA1Id,
        projectB1Id: result.projectB1Id,
        poAId: result.poAId,
        poBId: result.poBId,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
