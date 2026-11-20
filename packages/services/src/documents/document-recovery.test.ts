import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { verifyDocumentBytes } from "./document-integrity";
import { ServiceError } from "../types";

function fixture() {
  const ctx = { tenantId: "tenant", companyId: "company", actorUserId: "user", roles: ["OWNER"] };
  const bytes = Buffer.from("%PDF-1.7 original");
  const doc = { tenantId: "tenant", projectId: "project", storageKey: "tenant/project/document/file.pdf", linkedEntityType: "PROJECT", status: "ARCHIVED", storageProvider: "R2", sizeBytes: bytes.length, contentSha256: createHash("sha256").update(bytes).digest("hex") as string | null, originalFileName: "file.pdf", mimeType: "application/pdf" };
  const state = { permitted: true, parentAccess: true, reads: 0, body: bytes };
  const dependencies: Record<string, unknown> = {
    "@bloqer/database": { prisma: { documentAttachment: { findUnique: async () => doc } } },
    "@bloqer/storage": { getObjectBytes: async (key: string) => { assert.equal(key, doc.storageKey); state.reads++; return { body: state.body }; } },
    "../types": { ServiceError },
    "./document-integrity": { verifyDocumentBytes },
    "./document-link-scope": {
      canViewDocumentByLink: () => state.permitted,
      requireDocumentLinkAccess: async (_doc: unknown, context: unknown) => {
        assert.equal(context, ctx);
        if (!state.parentAccess) throw new ServiceError("FORBIDDEN", "Parent inaccessible");
      },
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("./document.service.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (id: string, context: unknown) => Promise<Record<string, unknown>>> = {};
  runInNewContext(code, { exports, require: (name: string) => dependencies[name] ?? {}, Buffer });
  return { doc, state, ctx, verify: () => exports.verifyStoredDocument!("document", ctx), read: () => exports.getDocumentFileBytes!("document", ctx) };
}

test("archive recovery check verifies bytes without mutating and returns no storage locator or file contents", async () => {
  const f = fixture();
  const result = await f.verify();
  assert.deepEqual(Object.keys(result).sort(), ["checkedAt", "checksumVerified", "sizeBytes"]);
  assert.equal(result.checksumVerified, true);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt as string)));
  assert.equal(f.doc.status, "ARCHIVED");
  assert.equal(f.state.reads, 1);
});
test("tenant, module, parent and storage-key authorization precede any recovery read", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.doc.tenantId = "foreign"; },
    (f: ReturnType<typeof fixture>) => { f.state.permitted = false; },
    (f: ReturnType<typeof fixture>) => { f.state.parentAccess = false; },
    (f: ReturnType<typeof fixture>) => { f.doc.storageKey = "foreign/project/document/file.pdf"; },
    (f: ReturnType<typeof fixture>) => { f.doc.status = "UPLOADING"; },
    (f: ReturnType<typeof fixture>) => { f.doc.status = "DELETED"; },
    (f: ReturnType<typeof fixture>) => { f.doc.storageProvider = "PLACEHOLDER"; },
    (f: ReturnType<typeof fixture>) => { f.doc.sizeBytes = 50 * 1024 * 1024 + 1; },
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(f.verify(), ServiceError);
    assert.equal(f.state.reads, 0);
  }
});
test("server-side PDF reads also reject same-size corruption; historical hashes remain explicitly unverified", async () => {
  const f = fixture();
  f.state.body = Buffer.alloc(f.doc.sizeBytes);
  await assert.rejects(f.read(), { code: "CONFLICT" });
  f.doc.contentSha256 = null;
  assert.equal((await f.verify()).checksumVerified, false);
  assert.ok(!("checksumVerified" in await f.read()), "Existing byte-reader DTO remains stable");
});
