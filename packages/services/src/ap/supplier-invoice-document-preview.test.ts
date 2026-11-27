import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeAiProvider, type SupplierInvoiceDocumentExtraction } from "@bloqer/ai";
import { ServiceError, type ServiceContext } from "../types";
import { buildSupplierInvoiceDocumentPreview, previewSupplierInvoiceDocument } from "./supplier-invoice-document-preview.service";

// Entirely synthetic evidence. No database connection, provider network or real document.
const document: SupplierInvoiceDocumentExtraction = {
  documentKind: "INVOICE", supplierName: "Proveedor de prueba", supplierTaxId: null,
  fiscalReference: "FIXTURE-001", invoiceLetter: "A", issueDate: "2026-11-19", dueDate: null,
  currency: "ARS", pricesIncludeTax: false, iibbPerceptionRate: "0", iibbPerceptionAmount: "0.00",
  subtotal: "100.00", taxTotal: "21.00", total: "121.00", hasUnsupportedTaxes: false,
  lines: [{ description: "Material sintético", quantity: "1", unitPrice: "100", taxRate: "21", discountPercent: "0" }],
};
const ctx: ServiceContext = {
  actorUserId: "00000000-0000-0000-0000-000000000001", tenantId: "00000000-0000-0000-0000-000000000002",
  companyId: "00000000-0000-0000-0000-000000000003", roles: ["OWNER"],
};
const projectId = "00000000-0000-0000-0000-000000000004";
const input = { projectId: null, mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4\nSYNTHETIC FIXTURE ONLY\n%%EOF") };

function fakeDependencies() {
  const calls: string[] = [];
  const provider = createFakeAiProvider({ turns: [{ kind: "text", text: JSON.stringify(document) }] });
  provider.capabilities.supportsVision = true;
  provider.capabilities.supportsStructuredOutput = true;
  const generate = provider.generateResponse;
  provider.generateResponse = async (request) => { calls.push("generate"); return generate(request); };
  return {
    calls,
    enabled: () => true,
    assertModule: async (context: ServiceContext) => { assert.equal(context, ctx); calls.push("module"); },
    assertProject: async (id: string, context: ServiceContext) => {
      assert.equal(id, projectId); assert.equal(context, ctx); calls.push("project");
      return { id, tenantId: ctx.tenantId, companyId: ctx.companyId, country: "AR", status: "ACTIVE" as const };
    },
    resolveCompany: async () => { calls.push("company"); return ctx.companyId!; },
    provider: () => { calls.push("provider"); return provider; },
    config: () => ({ enabled: true, providerId: "fake", model: "fake", timeoutMs: 1_000, maxToolCalls: 1, maxAgentTurns: 1, maxOutputTokens: 1_000 }),
  };
}

describe("ephemeral invoice preview verdict", () => {
  it("accepts complete supported evidence, warns about manual payee, due date and fiscal dedupe", () => {
    const preview = buildSupplierInvoiceDocumentPreview(document);
    assert.equal(preview.canApply, true);
    assert.equal(preview.dueDate, null);
    assert.equal(preview.iibbPerceptionRate, "0");
    assert.ok(preview.warnings.some((message) => message.includes("duplicados")));
    assert.ok(preview.reviewReasons.some((message) => message.includes("vencimiento")));
    assert.equal("hasUnsupportedTaxes" in preview, false);
    assert.equal("supplierContactId" in preview, false);
  });

  it("never replaces unknown tax, price basis or discount with defaults", () => {
    const preview = buildSupplierInvoiceDocumentPreview({ ...document, pricesIncludeTax: null,
      iibbPerceptionRate: null, iibbPerceptionAmount: null,
      lines: [{ ...document.lines[0]!, taxRate: null, discountPercent: null }],
    });
    assert.equal(preview.canApply, true);
    assert.equal(preview.iibbPerceptionRate, null);
    assert.equal(preview.lines[0]?.taxRate, null);
    assert.equal(preview.lines[0]?.discountPercent, null);
    assert.equal(preview.blockingReasons.length, 0);
    assert.ok(preview.reviewReasons.length >= 5);
  });

  it("blocks unsupported documents, currency, identified unsupported taxes and empty lines", () => {
    for (const patch of [
      { documentKind: "CREDIT_NOTE" }, { documentKind: "DEBIT_NOTE" }, { documentKind: "OTHER" },
      { currency: "USD" }, { currency: null }, { hasUnsupportedTaxes: true }, { lines: [] },
    ] as Partial<SupplierInvoiceDocumentExtraction>[]) {
      assert.equal(buildSupplierInvoiceDocumentPreview({ ...document, ...patch }).canApply, false);
    }
  });

  it("allows human completion of missing headers and unknown tax presence without inventing them", () => {
    const preview = buildSupplierInvoiceDocumentPreview({ ...document, issueDate: null, invoiceLetter: null, hasUnsupportedTaxes: null });
    assert.equal(preview.canApply, true);
    assert.equal(preview.issueDate, null);
    assert.equal(preview.invoiceLetter, null);
    assert.ok(preview.reviewReasons.some((reason) => reason.includes("otros impuestos")));
  });

  it("missing dates/descriptions/printed amounts cannot hide a verifiable mismatch", () => {
    for (const patch of [
      { issueDate: null, total: "122.00" },
      { invoiceLetter: null, subtotal: "99.00" },
      { total: null, taxTotal: "20.00" },
      { iibbPerceptionRate: null, iibbPerceptionAmount: null, subtotal: "99.00" },
      { lines: [{ ...document.lines[0]!, description: null }], total: "122.00" },
      { lines: [{ ...document.lines[0]!, quantity: null, taxRate: null }], total: "122.00" },
    ] as Partial<SupplierInvoiceDocumentExtraction>[]) {
      assert.equal(buildSupplierInvoiceDocumentPreview({ ...document, ...patch }).canApply, false);
    }
  });

  it("missing printed totals stay missing and require comparison by the user", () => {
    const preview = buildSupplierInvoiceDocumentPreview({ ...document, subtotal: null, taxTotal: null, total: null });
    assert.equal(preview.canApply, true);
    assert.equal(preview.total, null);
    assert.ok(preview.reviewReasons.some((reason) => reason.includes("cotejar el total")));
  });

  it("compares with the AP decimal kernel, allowing one cent only and never balancing", () => {
    const withinTolerance = buildSupplierInvoiceDocumentPreview({ ...document, total: "121.01" });
    assert.equal(withinTolerance.canApply, true);
    assert.ok(withinTolerance.warnings.some((warning) => warning.includes("centavo")));
    const mismatch = buildSupplierInvoiceDocumentPreview({ ...document, total: "121.02" });
    assert.equal(mismatch.canApply, false);
    assert.equal(mismatch.total, "121.02");
    assert.equal(mismatch.lines.length, 1);
    assert.match(mismatch.blockingReasons.join(" "), /total/);
    assert.equal(buildSupplierInvoiceDocumentPreview({ ...document, subtotal: "100.02" }).canApply, false);
    assert.equal(buildSupplierInvoiceDocumentPreview({ ...document, taxTotal: "21.02" }).canApply, false);
    assert.equal(buildSupplierInvoiceDocumentPreview({ ...document, iibbPerceptionAmount: "0.02" }).canApply, false);
  });

  it("uses gross prices and IIBB math when explicitly evidenced", () => {
    const preview = buildSupplierInvoiceDocumentPreview({ ...document, pricesIncludeTax: true,
      iibbPerceptionRate: "3", iibbPerceptionAmount: "3.00", total: "124.00",
      lines: [{ ...document.lines[0]!, unitPrice: "121" }],
    });
    assert.equal(preview.canApply, true);
  });

  it("blocks C/E IVA discrepancies, zero quantity and out-of-range discounts", () => {
    for (const patch of [
      { invoiceLetter: "C" }, { invoiceLetter: "E" },
      { lines: [{ ...document.lines[0]!, quantity: "0" }] },
      { lines: [{ ...document.lines[0]!, discountPercent: "100.01" }] },
    ] as Partial<SupplierInvoiceDocumentExtraction>[]) assert.equal(buildSupplierInvoiceDocumentPreview({ ...document, ...patch }).canApply, false);
  });
});

describe("invoice preview authorization and file boundary (fake only)", () => {
  it("authorizes project and company before calling provider, returns no persistent id", async () => {
    const dependencies = fakeDependencies();
    const preview = await previewSupplierInvoiceDocument({ ...input, projectId }, ctx, dependencies);
    assert.deepEqual(dependencies.calls, ["module", "project", "company", "provider", "generate"]);
    assert.equal(preview.canApply, true);
    assert.equal("id" in preview, false);
  });

  it("stops before authorization/provider if disabled or scope is malformed", async () => {
    const dependencies = fakeDependencies();
    await assert.rejects(previewSupplierInvoiceDocument(input, ctx, { ...dependencies, enabled: () => false }), /no está habilitada/);
    await assert.rejects(previewSupplierInvoiceDocument({ ...input, projectId: "not-an-id" }, ctx, dependencies), /Proyecto inválido/);
    assert.deepEqual(dependencies.calls, []);
  });

  it("denies missing session, AP permissions and corporate scope for project-only role before provider", async () => {
    for (const context of [{ ...ctx, actorUserId: "" }, { ...ctx, roles: ["VIEWER"] as ServiceContext["roles"] },
      { ...ctx, roles: ["PROCUREMENT"] as ServiceContext["roles"] }]) {
      const dependencies = fakeDependencies();
      dependencies.assertModule = async () => { dependencies.calls.push("module"); };
      await assert.rejects(previewSupplierInvoiceDocument(input, context, dependencies), (error: unknown) => error instanceof ServiceError && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.code));
      assert.equal(dependencies.calls.includes("provider"), false);
    }
  });

  it("never calls provider after module, cross-tenant/company, ACL or inactive-project denial", async () => {
    for (const boundary of ["module", "project", "company"] as const) {
      const dependencies = fakeDependencies();
      const deny = async (): Promise<never> => { throw new ServiceError("FORBIDDEN", `Denied ${boundary}`); };
      if (boundary === "module") dependencies.assertModule = deny;
      if (boundary === "project") dependencies.assertProject = deny;
      if (boundary === "company") dependencies.resolveCompany = deny;
      await assert.rejects(previewSupplierInvoiceDocument({ ...input, projectId }, ctx, dependencies), /Denied/);
      assert.equal(dependencies.calls.includes("provider"), false);
    }
  });

  it("rejects MIME spoofing, oversized/empty files and unsupported formats before provider", async () => {
    for (const patch of [
      { bytes: Buffer.from("<html>not a PDF</html>") }, { bytes: Buffer.alloc(0) },
      { bytes: Buffer.alloc(3 * 1024 * 1024 + 1) }, { mimeType: "image/svg+xml" },
      { mimeType: "image/png" },
    ]) {
      const dependencies = fakeDependencies();
      await assert.rejects(previewSupplierInvoiceDocument({ ...input, ...patch }, ctx, dependencies), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
      assert.equal(dependencies.calls.includes("provider"), false);
    }
  });
});
