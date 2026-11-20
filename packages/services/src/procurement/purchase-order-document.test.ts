import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { formatDbDate, formatGroupedDecimal, serializeMoney } from "@bloqer/utils";
import { isCrossCompany } from "../company-scope";
import { ServiceError, type ServiceContext } from "../types";
import type * as ExportService from "./purchase-order-document.service";

const ctx: ServiceContext = { actorUserId: "user", tenantId: "tenant", companyId: "company", roles: ["OWNER"] };
const fixture = () => ({
  id: "po", tenantId: "tenant", companyId: "company", projectId: "project", supplierContactId: "supplier",
  code: "OC-048", status: "CONFIRMED", issueDate: new Date("2026-11-19T00:00:00Z"), expectedDeliveryDate: null,
  currency: "USD", subtotal: "1234567890123.45", taxAmount: "4.20", iibbPerceptionRate: "3.0000",
  iibbPerceptionAmount: "0.60", totalAmount: "1234567890128.25", internalNotes: "PRIVATE_INTERNAL_NOTE",
  notes: "AMBIGUOUS_LEGACY_NOTE", fxRate: "1400.123456", approvedByName: "PRIVATE_APPROVER",
  lines: [{
    description: "Panel con especificación completa y sin abreviar", quantity: "0.0001", unit: "m3",
    unitPrice: "200000.1234", discountPct: "1.2345", taxRate: "21.0000", lineTotal: "24.20",
    wbsNodeCode: "PRIVATE_WBS", varianceJustification: "PRIVATE_VARIANCE", budgetUnitCostSnapshot: "PRIVATE_BASELINE",
  }],
});
const parties = {
  company: { name: "Marca", legalName: "Empresa emisora S.A.", fiscalId: "30-00000000-0", address: "Calle 10", city: "Mendoza", country: "AR" },
  supplierContact: { legalName: "Proveedor legal S.A.", taxId: "30-11111111-1", address: null, city: null, province: null, country: "AR" },
  project: { code: "PR-20", name: "Obra compartida", address: "Acceso 20", city: "Mendoza", province: "Mendoza", country: "AR" },
};

function load(order = fixture(), options: { denied?: boolean; missingParties?: boolean } = {}) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const dependencies: Record<string, unknown> = {
    "@bloqer/database": { readPurchaseOrderDocumentParties: async (...args: unknown[]) => {
      calls.push({ name: "parties", args }); return options.missingParties ? null : parties;
    } },
    "@bloqer/utils": { formatDbDate, formatGroupedDecimal, serializeMoney },
    "../company-scope": { isCrossCompany },
    "../types": { ServiceError },
    "./purchase-order.service": { getPurchaseOrderById: async (...args: unknown[]) => {
      calls.push({ name: "order", args });
      if (options.denied) throw new ServiceError("FORBIDDEN", "Acceso restringido por módulo, rol o membresía de obra");
      return order;
    } },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("./purchase-order-document.service.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, require(name: string) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return { service: exports as typeof ExportService, calls };
}

test("supplier copy preserves commercial decimal values and excludes internal information", async () => {
  const loaded = load();
  const { companyId, document } = await loaded.service.buildPurchaseOrderDocument("po", "project", ctx);
  assert.equal(companyId, "company");
  assert.equal(document.company.name, "Empresa emisora S.A.");
  assert.equal(document.supplier.name, "Proveedor legal S.A.");
  assert.equal(document.totalAmount, "1.234.567.890.128,25");
  assert.equal(document.lines[0]?.quantity, "0,0001");
  assert.equal(document.lines[0]?.unitPrice, "200.000,1234");
  assert.equal(document.lines[0]?.discountPct, "1,2345");
  assert.equal(document.expectedDeliveryDate, null);
  assert.equal(document.notice, null);
  assert.doesNotMatch(JSON.stringify(document), /PRIVATE_|AMBIGUOUS_|tenantId|companyId|projectId|supplierContactId|fxRate|notes/i);
  assert.equal(loaded.calls[0]?.args[1], ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls[1]?.args[0])), {
    id: "po", tenantId: "tenant", companyId: "company", projectId: "project", supplierContactId: "supplier",
  });
});

test("authorization failures cannot read commercial identities", async () => {
  const loaded = load(fixture(), { denied: true });
  await assert.rejects(loaded.service.buildPurchaseOrderDocument("po", "project", ctx), { code: "FORBIDDEN" });
  assert.deepEqual(loaded.calls.map((call) => call.name), ["order"]);
});

test("cross-tenant, cross-company and mismatched project exports fail before identity reads", async () => {
  for (const [patch, code] of [
    [{ tenantId: "another-tenant" }, "FORBIDDEN"],
    [{ companyId: "another-company" }, "FORBIDDEN"],
    [{ projectId: "another-project" }, "NOT_FOUND"],
  ] as const) {
    const loaded = load({ ...fixture(), ...patch });
    await assert.rejects(loaded.service.buildPurchaseOrderDocument("po", "project", ctx), { code });
    assert.deepEqual(loaded.calls.map((call) => call.name), ["order"]);
  }
});

test("an inconsistent commercial parent graph fails closed", async () => {
  const loaded = load(fixture(), { missingParties: true });
  await assert.rejects(loaded.service.buildPurchaseOrderDocument("po", "project", ctx), { code: "CONFLICT" });
});

test("every non-confirmed or cancelled state is visibly identified and no line is truncated", async () => {
  for (const [status, notice] of [
    ["DRAFT", "BORRADOR"], ["SUBMITTED", "PENDIENTE DE APROBACIÓN"],
    ["APPROVED", "Pendiente de confirmación"], ["CANCELLED", "ANULADA"],
  ]) {
    const order = fixture();
    order.status = status!;
    order.lines = Array.from({ length: 125 }, (_, index) => ({ ...order.lines[0]!, description: `${index} ${"Especificación larga completa. ".repeat(80)} FIN-${index}` }));
    const { document } = await load(order).service.buildPurchaseOrderDocument("po", "project", ctx);
    assert.ok(document.notice?.includes(notice!));
    assert.equal(document.lines.length, 125);
    assert.equal(document.lines[124]?.description, order.lines[124]?.description);
  }
});
