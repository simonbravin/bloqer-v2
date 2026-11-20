import assert from "node:assert/strict";
import type { PrismaClient } from "@bloqer/database";

/** Audit integration suites require an explicitly selected, disposable database. */
export function assertAuditFixtureDatabase(): string {
  const expected = process.env.BLOQER_AUDIT_TEST_DATABASE;
  assert.ok(expected && /^bloqer_audit_[a-z0-9_]+$/.test(expected),
    "An explicitly named isolated audit database is required");
  for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
    assert.ok(value, "Both database URLs must be explicit; no .env fallback");
    const url = new URL(value);
    const isolatedCI = process.env.CI === "true" &&
      expected === "bloqer_audit_documents_ci" && url.hostname === "127.0.0.1" && url.port === "5432" &&
      url.username === "bloqer_ci" && url.search === "";
    assert.ok(isolatedCI || url.hostname === "ep-curly-math-aptjniho.c-7.us-east-1.aws.neon.tech",
      "Audit fixtures require the verified development compute or the disposable CI loopback database");
    assert.ok(url.protocol === "postgresql:" || url.protocol === "postgres:");
    assert.equal(decodeURIComponent(url.pathname.slice(1)), expected,
      "The URL must select the explicitly named isolated audit database");
  }
  return expected;
}

/** Check the effective connection before any fixture writes, not just environment labels. */
export async function assertAuditDatabaseIdentity(db: PrismaClient): Promise<string> {
  const expected = assertAuditFixtureDatabase();
  const rows = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.equal(rows[0]?.database, expected, "Unexpected effective audit database");
  return expected;
}
