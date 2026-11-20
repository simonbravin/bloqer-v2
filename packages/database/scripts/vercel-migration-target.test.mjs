import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prepareVercelMigrationEnvironment, resolveVercelMigrationTarget } from "./vercel-migration-target.mjs";

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

test("migration connection allows Neon startup without changing runtime URL, credentials or target", () => {
  const env = vercelEnv("preview", "ep-young-forest-ap86bxcg", "bloqer_preview");
  const syntheticPassword = encodeURIComponent(`${randomUUID()}:@`);
  env.DIRECT_URL = env.DIRECT_URL.replace("test@", `demo:${syntheticPassword}@`) + "&schema=public&channel_binding=require";
  const before = { ...env };
  const migration = prepareVercelMigrationEnvironment(env);
  const original = new URL(env.DIRECT_URL);
  const effective = new URL(migration.env.DIRECT_URL);
  assert.equal(migration.target, "preview");
  assert.equal(effective.searchParams.get("connect_timeout"), "15");
  for (const key of ["username", "password", "hostname", "port", "pathname"]) {
    assert.equal(effective[key], original[key]);
  }
  for (const key of ["sslmode", "schema", "channel_binding"]) {
    assert.equal(effective.searchParams.get(key), original.searchParams.get(key));
  }
  assert.equal(migration.env.DATABASE_URL, env.DATABASE_URL);
  assert.deepEqual(env, before);
});

test("migration timeout raises short limits and preserves explicit longer or unlimited limits", () => {
  for (const seconds of [1, 5, 14, 15, 30, 0]) {
    const env = vercelEnv("production", portal);
    env.DIRECT_URL += `&connect_timeout=${seconds}`;
    const migration = prepareVercelMigrationEnvironment(env);
    assert.equal(new URL(migration.env.DIRECT_URL).searchParams.get("connect_timeout"),
      String(seconds > 0 && seconds < 15 ? 15 : seconds));
    if (seconds === 0 || seconds >= 15) assert.equal(migration.env.DIRECT_URL, env.DIRECT_URL);
  }
});

test("migration timeout rejects ambiguous or invalid values without revealing secrets", () => {
  for (const value of ["", "-1", "1.5", "invalid-private-value", "9007199254740992", "5&connect_timeout=30"]) {
    const env = vercelEnv("preview", preview);
    env.DIRECT_URL += `&connect_timeout=${value}`;
    assert.throws(() => prepareVercelMigrationEnvironment(env), {
      message: "DIRECT_URL connect_timeout must be one non-negative integer",
    });
  }
});

test("migration preparation retains portal isolation checks before changing any connection", () => {
  assert.throws(() => prepareVercelMigrationEnvironment(vercelEnv("preview", portal)), /outside the portal/);
  assert.throws(() => prepareVercelMigrationEnvironment(vercelEnv("production", preview)), /Bloqer portal/);
  const env = vercelEnv("preview", preview);
  env.DIRECT_URL = env.DATABASE_URL;
  assert.throws(() => prepareVercelMigrationEnvironment(env), /direct PostgreSQL/);
});

test("local builds stay skipped and non-Neon preview configuration remains unchanged", () => {
  assert.equal(prepareVercelMigrationEnvironment({}), null);
  const env = {
    VERCEL: "1", VERCEL_ENV: "preview",
    DATABASE_URL: "postgresql://demo@localhost/isolated?sslmode=require",
    DIRECT_URL: "postgresql://demo@localhost/isolated?sslmode=require",
  };
  assert.deepEqual(prepareVercelMigrationEnvironment(env), { target: "preview", env });
});
