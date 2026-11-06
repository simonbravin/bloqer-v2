import assert from "node:assert/strict";
import test from "node:test";
import { resolveVercelMigrationTarget } from "./vercel-migration-target.mjs";

const portal = "ep-cold-mouse-appkpn84";
const preview = "ep-curly-math-aptjniho";

function vercelEnv(environment, compute, database = "neondb") {
  const hostSuffix = "c-7.us-east-1.aws.neon.tech";
  return {
    VERCEL: "1",
    VERCEL_ENV: environment,
    DATABASE_URL: `postgresql://test@${compute}-pooler.${hostSuffix}/${database}?sslmode=require`,
    DIRECT_URL: `postgresql://test@${compute}.${hostSuffix}/${database}?sslmode=require`,
  };
}

test("local and CI commands do not start a migration", () => {
  assert.equal(resolveVercelMigrationTarget({}), null);
});

test("accepts the portal and an isolated preview with their matching pooled and direct URLs", () => {
  assert.equal(resolveVercelMigrationTarget(vercelEnv("production", portal)), "production");
  assert.equal(resolveVercelMigrationTarget(vercelEnv("preview", preview, "preview_ag14")), "preview");
});

test("rejects production on the development compute or an unexpected database", () => {
  assert.throws(() => resolveVercelMigrationTarget(vercelEnv("production", preview)), /Bloqer portal/);
  assert.throws(() => resolveVercelMigrationTarget(vercelEnv("production", portal, "other")), /Bloqer portal/);
});

test("previews and Vercel development cannot migrate any database on the portal compute", () => {
  for (const stage of ["preview", "development"]) {
    assert.throws(() => resolveVercelMigrationTarget(vercelEnv(stage, portal, "preview_ag14")), /outside the portal/);
  }
});

test("rejects disagreement in host, database or schema and a pooled migration connection", () => {
  const env = vercelEnv("preview", preview, "preview_ag14");
  for (const runtimeUrl of [
    env.DATABASE_URL.replace(preview, portal),
    env.DATABASE_URL.replace("preview_ag14", "other"),
    env.DATABASE_URL + "&schema=other",
  ]) {
    assert.throws(() => resolveVercelMigrationTarget({ ...env, DATABASE_URL: runtimeUrl }), /same database and schema/);
  }
  assert.throws(() => resolveVercelMigrationTarget({ ...env, DIRECT_URL: env.DATABASE_URL }), /direct PostgreSQL/);
});

test("rejects unknown environments and malformed URLs without printing their values", () => {
  const env = vercelEnv("preview", preview);
  assert.throws(() => resolveVercelMigrationTarget({ ...env, VERCEL_ENV: "" }), /VERCEL_ENV/);
  assert.throws(() => resolveVercelMigrationTarget({ ...env, DIRECT_URL: "malformed-private-value" }), {
    message: "DIRECT_URL must be a valid PostgreSQL URL",
  });
});

test("rejects ambiguous URL parameters before resolving the target", () => {
  const env = vercelEnv("production", portal);
  for (const query of ["&schema=", "&schema=public&schema=other", "&host=other.test", "&dbname=other"]) {
    assert.throws(() => resolveVercelMigrationTarget({ ...env, DIRECT_URL: env.DIRECT_URL + query }), /unambiguous/);
  }
});
