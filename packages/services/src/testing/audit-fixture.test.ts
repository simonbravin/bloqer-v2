import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { assertAuditDatabaseIdentity, assertAuditFixtureDatabase } from "./audit-fixture";
import type { PrismaClient } from "@bloqer/database";

const name = "bloqer_audit_guard_test";
const validUrl = `postgresql://test:synthetic@ep-curly-math-aptjniho.c-7.us-east-1.aws.neon.tech/${name}`;
function withEnv(t: TestContext) {
  const keys = ["DATABASE_URL", "DIRECT_URL", "BLOQER_AUDIT_TEST_DATABASE"] as const;
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  });
  process.env.DATABASE_URL = validUrl;
  process.env.DIRECT_URL = validUrl;
  process.env.BLOQER_AUDIT_TEST_DATABASE = name;
}

test("audit fixtures require an explicit isolated name and both exact development URLs", (t) => {
  withEnv(t);
  assert.equal(assertAuditFixtureDatabase(), name);
  for (const badUrl of [
    validUrl.replace(name, "neondb"),
    validUrl.replace("ep-curly-math-aptjniho", "ep-cold-mouse-appkpn84"),
    validUrl.replace(".aws.neon.tech", ".aws.neon.tech.attacker.test"),
  ]) {
    process.env.DIRECT_URL = badUrl;
    assert.throws(() => assertAuditFixtureDatabase());
  }
  process.env.DIRECT_URL = validUrl;
  delete process.env.DATABASE_URL;
  assert.throws(() => assertAuditFixtureDatabase());
});

test("fixture guard verifies the effective SQL database before writes", async (t) => {
  withEnv(t);
  const db = { $queryRaw: async () => [{ database: "neondb" }] } as unknown as PrismaClient;
  await assert.rejects(() => assertAuditDatabaseIdentity(db));
});
