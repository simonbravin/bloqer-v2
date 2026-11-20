/**
 * On Vercel builds, apply pending Prisma migrations before generate/next build.
 * Uses the deployment's DATABASE_URL / DIRECT_URL (production or preview Neon branch).
 * Local builds skip this (VERCEL is unset).
 *
 * Portal (portal.bloqer.app) = Neon branch `production` / ep-cold-mouse-appkpn84.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareVercelMigrationEnvironment } from "./vercel-migration-target.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let migration;
try {
  migration = prepareVercelMigrationEnvironment(process.env);
} catch (error) {
  console.error(`[vercel-migrate] ${error.message}`);
  process.exit(1);
}
if (migration === null) process.exit(0);

console.log(
  `[vercel-migrate] prisma migrate deploy (VERCEL_ENV=${migration.target})`,
);
if (migration.env.DIRECT_URL !== process.env.DIRECT_URL) {
  console.log("[vercel-migrate] Neon migration connect_timeout raised to 15 seconds");
}

const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  cwd: packageRoot,
  env: migration.env,
  stdio: "inherit",
  shell: true,
});

if (result.error) {
  console.error("[vercel-migrate] failed to spawn prisma:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
