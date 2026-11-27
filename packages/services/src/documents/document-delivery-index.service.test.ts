import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { ServiceError } from "../types";
import * as deliveryPure from "./document-delivery-index-pure";

function fixture(count = 27) {
  const ctx = { tenantId: "tenant", companyId: "company", actorUserId: "author", roles: ["OWNER"] };
  const state = { allowed: true, projectAllowed: true, reads: 0, lookups: 0 };
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `file-${i}`, tenantId: "tenant", companyId: "company", projectId: "project", folderId: null,
    originalFileName: `Plano ${i}.pdf`, category: "PLAN", status: "ACTIVE", storageProvider: "PLACEHOLDER",
    sizeBytes: 0, uploadedBy: "author", createdAt: new Date("2026-11-27T12:00:00.000Z"),
    linkedEntityType: "PROJECT", linkedEntityId: "project", replacesAttachmentId: null,
  }));
  const dependencies: Record<string, unknown> = {
    "zod": { z },
    "@bloqer/database": { prisma: {
      documentAttachment: { findMany: async (query: { take: number; where: { AND: [{ tenantId: string; projectId: string }] } }) => {
        assert.equal(query.where.AND[0].tenantId, ctx.tenantId);
        assert.equal(query.where.AND[0].projectId, "project");
        state.reads++;
        return query.take === 10_001 ? rows : [];
      } },
      project: { findFirstOrThrow: async () => ({ code: "OBR-1", name: "Obra" }) },
    } },
    "@bloqer/domain": { can: () => state.allowed },
    "@bloqer/validators": { listProjectDocumentsSchema: z.object({ category: z.enum(["PLAN", "OTHER"]).optional() }) },
    "../company-scope": { companyScopeFilter: () => ({ companyId: "company" }), isCrossCompany: (companyId: string) => companyId !== "company" },
    "../security/access": { requireProjectAccess: async () => { if (!state.projectAllowed) throw new ServiceError("FORBIDDEN", "Sin acceso"); return { id: "project", tenantId: "tenant", companyId: "company" }; } },
    "../types": { ServiceError },
    "../user/resolve-user-display-names": { resolveUserDisplayNames: async () => { state.lookups++; return new Map([["author", "Responsable"]]); } },
    "./document-link-scope": {
      canViewDocumentByLink: () => true,
      resolveDocumentLinkScopes: async (input: typeof rows) => input.map((doc) => ({ doc, scope: { companyId: doc.companyId } })),
    },
    "./document-delivery-index-pure": deliveryPure,
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./document-delivery-index.service.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (projectId: string, params: Record<string, unknown>, context: unknown) => Promise<{ rows: unknown[]; total: number; page: number; pages: number; table: { rows: unknown[] } }>> = {};
  runInNewContext(compiled, { exports, require: (name: string) => dependencies[name] ?? {}, Date, Map, Buffer });
  return { state, ctx, get: (params = {}) => exports.getProjectDocumentDeliveryIndex!("project", params, ctx), exportAll: () => exports.buildProjectDocumentDeliveryExport!("project", { page: 2 }, ctx) };
}

test("delivery index pages only the view and exports all authorized rows", async () => {
  const f = fixture();
  const second = await f.get({ page: 2 });
  assert.equal(second.rows.length, 2);
  assert.equal(second.total, 27);
  assert.equal(second.pages, 2);
  assert.equal((await f.exportAll()).table.rows.length, 27);
  assert.equal((await f.get({ page: 99 })).page, 2);
});

test("delivery index rejects permissions and invalid inputs before any document lookup", async () => {
  for (const mode of ["role", "project", "input"]) {
    const f = fixture();
    if (mode === "role") f.state.allowed = false;
    if (mode === "project") f.state.projectAllowed = false;
    await assert.rejects(f.get(mode === "input" ? { status: "DELETED" } : {}), ServiceError);
    assert.equal(f.state.reads, 0);
  }
});

test("delivery index refuses oversized output instead of returning an incomplete page or export", async () => {
  for (const method of ["get", "exportAll"] as const) {
    const f = fixture(10_001);
    await assert.rejects(f[method](), { code: "CONFLICT" });
    assert.equal(f.state.reads, 1);
    assert.equal(f.state.lookups, 0);
  }
});
