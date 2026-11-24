import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertDeploymentSchema, INVITATION_MIGRATION, verifyDeploymentSchema } from "./deployment-schema-verification.mjs";

const sql = readFileSync(new URL(`../prisma/migrations/${INVITATION_MIGRATION}/migration.sql`, import.meta.url), "utf8");
function catalog() {
  return {
    migrations: [{ finished_at: new Date(), rolled_back_at: null }],
    columns: [...sql.matchAll(/^  "(\w+)" ([^\n]+)/gm)].map(([, name, definition]) => ({
      column_name: name, is_nullable: definition.includes("NOT NULL") ? "NO" : "YES",
    })),
    constraints: [...sql.matchAll(/CONSTRAINT "([^"]+)"/g)].map(([, conname]) => ({ conname, convalidated: true })),
    indexes: ["procurement_quote_invitations_pkey", ...[...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map(([, name]) => name)]
      .map(indexname => ({ indexname, indisvalid: true, indisready: true })),
  };
}

test("deployment contract matches the maintained migration", () => {
  assert.deepEqual(assertDeploymentSchema(catalog()), { migration: INVITATION_MIGRATION, columns: 22, constraints: 9, indexes: 6 });
});

test("deployment stops for missing, rolled back or incomplete migrations", () => {
  for (const migrations of [[], [{ finished_at: null, rolled_back_at: null }],
    [{ finished_at: new Date(), rolled_back_at: new Date() }],
    [...catalog().migrations, { finished_at: null, rolled_back_at: null }]]) {
    assert.throws(() => assertDeploymentSchema({ ...catalog(), migrations }), /is not complete/);
  }
});

test("deployment stops for absent columns, nullable scope or missing integrity protections", () => {
  const missing = catalog(); missing.columns = missing.columns.filter(c => c.column_name !== "responseHash");
  assert.throws(() => assertDeploymentSchema(missing), /missing invitation column responseHash/);
  const nullable = catalog(); nullable.columns.find(c => c.column_name === "tenantId").is_nullable = "YES";
  assert.throws(() => assertDeploymentSchema(nullable), /tenantId must be required/);
  const invalid = catalog(); invalid.indexes.find(i => i.indexname === "quote_invitation_one_pending").indisvalid = false;
  assert.throws(() => assertDeploymentSchema(invalid), /invalid index quote_invitation_one_pending/);
  const unchecked = catalog(); unchecked.constraints.find(c => c.conname === "quote_invitation_import_requires_response").convalidated = false;
  assert.throws(() => assertDeploymentSchema(unchecked), /unvalidated constraint/);
});

test("schema verification enters a read-only transaction before reading catalogs", async () => {
  const data = catalog(); const calls = [];
  const db = { $transaction: async (work) => work({
    $executeRawUnsafe: async query => { calls.push(query); },
    $queryRawUnsafe: async query => {
      assert.equal(calls[0], "SET TRANSACTION READ ONLY");
      if (query.includes("_prisma_migrations")) return data.migrations;
      if (query.includes("information_schema.columns")) return data.columns;
      if (query.includes("pg_constraint")) return data.constraints;
      if (query.includes("pg_index")) return data.indexes;
      throw new Error("Unexpected catalog query");
    },
  }) };
  assert.equal((await verifyDeploymentSchema(db)).columns, 22);
});

test("verifies real catalogs after migrations on isolated CI SQL", {
  skip: process.env.BLOQER_DEPLOYMENT_SCHEMA_TEST !== "1",
}, async () => {
  const url = new URL(process.env.DIRECT_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.pathname, "/bloqer_ci_pilot");
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasourceUrl: url.href });
  try { assert.equal((await verifyDeploymentSchema(db)).migration, INVITATION_MIGRATION); }
  finally { await db.$disconnect(); }
});
