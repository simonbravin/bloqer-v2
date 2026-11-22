import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Prisma, PrismaClient } from "@bloqer/database";
import { withSyntheticStorageObjects } from "../testing/storage-signing-fixture";
import type { ServiceContext } from "../types";

const sourceDatabase = "bloqer_audit_recovery_source_ci";
const targetDatabase = "bloqer_audit_recovery_target_ci";
const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// This rehearsal deliberately cannot be redirected to Neon, production or a developer DB.
function assertRecoveryEnvironment(env: NodeJS.ProcessEnv): string {
  assert.equal(env.CI, "true", "Recovery rehearsal requires disposable CI");
  assert.equal(env.BLOQER_RECOVERY_TEST, "1", "Recovery rehearsal requires explicit opt-in");
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    assert.ok(env[name], "Both disposable database URLs must be explicit");
    const url = new URL(env[name]);
    assert.equal(url.protocol, "postgresql:");
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "5432");
    assert.equal(url.username, "bloqer_ci");
    assert.equal(url.pathname, `/${targetDatabase}`);
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
  }
  assert.equal(env.DATABASE_URL, env.DIRECT_URL, "Both URLs must select the same disposable target");
  const source = new URL(env.DATABASE_URL!);
  source.pathname = `/${sourceDatabase}`;
  return source.toString();
}

describe("recovery rehearsal destination guards", () => {
  const url = `postgresql://bloqer_ci:synthetic@127.0.0.1:5432/${targetDatabase}`;
  const env = { CI: "true", BLOQER_RECOVERY_TEST: "1", DATABASE_URL: url, DIRECT_URL: url };
  it("accepts only the dedicated CI target and derives a separate source", () => {
    assert.equal(new URL(assertRecoveryEnvironment(env)).pathname, `/${sourceDatabase}`);
  });
  it("refuses missing opt-in, non-CI, remote hosts, arbitrary databases and connection overrides", () => {
    for (const change of [{ CI: "false" }, { BLOQER_RECOVERY_TEST: "0" }, { DIRECT_URL: undefined }]) {
      assert.throws(() => assertRecoveryEnvironment({ ...env, ...change }));
    }
    for (const invalid of [
      url.replace("127.0.0.1", "production.example.invalid"),
      url.replace(targetDatabase, "neondb"), url.replace(targetDatabase, sourceDatabase),
      url.replace("5432", "5433"), url.replace("bloqer_ci:", "postgres:"),
      `${url}?host=production.example.invalid`, `${url}#override`,
    ]) assert.throws(() => assertRecoveryEnvironment({ ...env, DATABASE_URL: invalid, DIRECT_URL: invalid }));
  });
});

it("restores SQL, original files, revisions, provenance and access boundaries from isolated copies", {
  skip: process.env.BLOQER_RECOVERY_TEST !== "1",
  timeout: 180_000,
}, async () => {
  const sourceUrl = assertRecoveryEnvironment(process.env);
  const { PrismaClient: Client } = createRequire(new URL("../../../database/package.json", import.meta.url))("@prisma/client") as {
    PrismaClient: new (options: Prisma.PrismaClientOptions) => PrismaClient;
  };
  const source = new Client({ datasourceUrl: sourceUrl });
  const { prisma: target } = await import("@bloqer/database");
  const { buildStorageKey } = await import("@bloqer/storage");
  const { getDocumentById, getDocumentFileBytes, verifyStoredDocument } = await import("./document.service");
  const { getDocumentVersionLinks } = await import("./document-versions.service");
  const { getDocumentHistory } = await import("./document-history.service");
  const { clearProjectAccessModeCache } = await import("../security/access");
  const directory = await mkdtemp(join(tmpdir(), "bloqer-recovery-"));
  const tenantId = randomUUID();
  const companyId = randomUUID();
  const siblingCompany = randomUUID();
  const projectId = randomUUID();
  const contactId = randomUUID();
  const actorUserId = randomUUID();
  const viewerId = randomUUID();
  const originalId = randomUUID();
  const revisionId = randomUUID();
  const owner: ServiceContext = { tenantId, companyId, actorUserId, roles: ["OWNER"] };
  const recordedAt = new Date("2026-11-21T12:34:56.789Z");
  function postgres(args: string[], input?: Buffer): Buffer {
    return execFileSync("docker", ["exec", "-i", "bloqer-ci-postgres", ...args], {
      input, timeout: 60_000, maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
    });
  }
  try {
    for (const [db, expected] of [[source, sourceDatabase], [target, targetDatabase]] as const) {
      const rows = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
      assert.equal(rows[0]?.name, expected, "Effective database must match the disposable destination");
    }
    const tables = await target.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'`;
    assert.equal(Number(tables[0]?.count), 0, "Restore destination must be empty; never overwrite existing data");
    assert.equal(await source.tenant.count(), 0, "Rehearsal source must contain no tenants");
    clearProjectAccessModeCache();
    await withSyntheticStorageObjects(async (objects) => {
      await source.$transaction(async (tx) => {
        await tx.tenant.create({ data: { id: tenantId, name: "Recovery fixture", slug: `recovery-${tenantId}`, projectAccessMode: "MEMBERSHIP_SCOPED" } });
        await tx.company.createMany({ data: [companyId, siblingCompany].map((id) => ({ id, tenantId, name: "Recovery company", status: "ACTIVE" })) });
        await tx.user.createMany({ data: [actorUserId, viewerId].map((id) => ({ id, name: "Recovery author", email: `${id}@example.invalid`, status: "ACTIVE" })) });
        await tx.userMembership.createMany({ data: [
          { tenantId, companyId, userId: actorUserId, roles: ["OWNER"], status: "ACTIVE" },
          { tenantId, companyId, userId: viewerId, roles: ["PROJECT_VIEWER"], status: "ACTIVE" },
        ] });
        await tx.contact.create({ data: { id: contactId, tenantId, legalName: "Recovery contact", country: "AR" } });
        await tx.project.create({ data: { id: projectId, tenantId, companyId, name: "Recovery project", code: "RECOVERY", status: "ACTIVE", clientContactId: contactId, country: "AR" } });
        const files = [
          { id: originalId, name: "original.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7\noriginal fixture\n%%EOF"), status: "ARCHIVED" as const, replacesAttachmentId: null },
          { id: revisionId, name: "revision.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7\nrevised fixture\n%%EOF"), status: "ACTIVE" as const, replacesAttachmentId: originalId },
          { id: randomUUID(), name: "photo.png", mimeType: "image/png", bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=", "base64"), status: "ACTIVE" as const, replacesAttachmentId: null },
        ];
        for (const file of files) {
          const storageKey = buildStorageKey(tenantId, projectId, file.id, file.name);
          objects.set(storageKey, file.bytes);
          await tx.documentAttachment.create({ data: {
            id: file.id, tenantId, companyId, projectId, linkedEntityType: "PROJECT", linkedEntityId: projectId,
            originalFileName: file.name, fileName: file.name, mimeType: file.mimeType,
            sizeBytes: file.bytes.length, storageKey, storageBucket: process.env.R2_BUCKET_NAME,
            storageProvider: "R2", status: file.status, contentSha256: checksum(file.bytes),
            replacesAttachmentId: file.replacesAttachmentId, uploadedBy: actorUserId,
            createdAt: recordedAt, updatedAt: recordedAt,
          } });
          await tx.auditLog.create({ data: {
            tenantId, companyId, projectId, actorUserId, entityType: "DocumentAttachment", entityId: file.id,
            action: "document.upload_confirmed", createdAt: recordedAt,
          } });
        }
      }, { timeout: 30_000 });
      const before = await source.documentAttachment.findMany({ orderBy: { id: "asc" } });
      const auditBefore = await source.auditLog.findMany({ orderBy: { id: "asc" } });
      const manifest = [];
      for (const [index, row] of before.entries()) {
        const bytes = objects.get(row.storageKey)!;
        const file = `${index}.bin`;
        await writeFile(join(directory, file), bytes);
        manifest.push({ file, key: row.storageKey, sha256: checksum(bytes), size: bytes.length });
      }
      await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
      const dump = postgres(["pg_dump", "-U", "bloqer_ci", "-d", sourceDatabase, "--format=custom", "--no-owner", "--no-acl"]);
      assert.equal(dump.subarray(0, 5).toString(), "PGDMP");
      await writeFile(join(directory, "database.dump"), dump);
      objects.clear();
      assert.equal(objects.size, 0);
      const recoveredDump = await readFile(join(directory, "database.dump"));
      assert.equal(checksum(recoveredDump), checksum(dump));
      postgres(["pg_restore", "-U", "bloqer_ci", "-d", targetDatabase, "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction"], recoveredDump);
      const recoveredManifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as typeof manifest;
      assert.deepEqual(recoveredManifest, manifest);
      for (const entry of recoveredManifest) {
        const bytes = await readFile(join(directory, entry.file));
        assert.equal(bytes.length, entry.size);
        assert.equal(checksum(bytes), entry.sha256);
        objects.set(entry.key, bytes);
      }
      assert.deepEqual(await target.documentAttachment.findMany({ orderBy: { id: "asc" } }), before);
      assert.deepEqual(await target.auditLog.findMany({ orderBy: { id: "asc" } }), auditBefore);
      for (const row of before) {
        const document = await getDocumentById(row.id, owner);
        assert.equal(document.uploadedBy, actorUserId);
        assert.equal(document.uploadedByName, "Recovery author");
        assert.equal(document.createdAt, recordedAt.toISOString());
        const bytes = await getDocumentFileBytes(row.id, owner);
        assert.equal(checksum(bytes.body), row.contentSha256);
        assert.equal(bytes.mimeType, row.mimeType);
        assert.equal((await verifyStoredDocument(row.id, owner)).checksumVerified, true);
        const history = await getDocumentHistory(row.id, owner);
        assert.equal(history.entries[0]?.actorName, "Recovery author");
        assert.equal(history.entries[0]?.createdAt, recordedAt.toISOString());
        for (const [ctx, code] of [
          [{ ...owner, tenantId: randomUUID() }, "NOT_FOUND"],
          [{ ...owner, companyId: siblingCompany }, "FORBIDDEN"],
          [{ ...owner, actorUserId: viewerId, roles: ["PROJECT_VIEWER"] }, "FORBIDDEN"],
        ] as Array<[ServiceContext, string]>) {
          await assert.rejects(getDocumentById(row.id, ctx), { code });
          await assert.rejects(getDocumentFileBytes(row.id, ctx), { code });
          await assert.rejects(getDocumentHistory(row.id, ctx), { code });
        }
      }
      assert.equal((await getDocumentVersionLinks(revisionId, owner)).previous?.id, originalId);
      assert.equal((await getDocumentVersionLinks(originalId, owner)).next?.id, revisionId);
      const original = before.find((row) => row.id === originalId)!;
      const intact = objects.get(original.storageKey)!;
      objects.set(original.storageKey, Buffer.alloc(intact.length));
      await assert.rejects(verifyStoredDocument(originalId, owner), { code: "CONFLICT" });
      objects.set(original.storageKey, intact);
      assert.equal((await verifyStoredDocument(originalId, owner)).checksumVerified, true);
      assert.deepEqual(await source.documentAttachment.findMany({ orderBy: { id: "asc" } }), before, "Restoration must not mutate the source");
    });
  } finally {
    clearProjectAccessModeCache();
    await Promise.allSettled([source.$disconnect(), target.$disconnect()]);
    // Only the unique directory created above; fixtures live until CI destroys its container.
    await rm(directory, { recursive: true, force: true });
  }
});
