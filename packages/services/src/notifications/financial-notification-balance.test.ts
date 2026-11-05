import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { resolveNotificationEmailContext } from "./notification-email-context";

function stub(t: TestContext, target: object, key: string, fn: unknown): void {
  const model = target as Record<string, unknown>, original = model[key];
  model[key] = fn;
  t.after(() => { model[key] = original; });
}

describe("financial notification balances", () => {
  for (const kind of ["SALES_INVOICE", "SUPPLIER_INVOICE"] as const) {
    it(`${kind} explains the remaining debt after cash and credit without sending email`, async (t) => {
      stub(t, prisma.tenant, "findFirst", async () => ({ name: "Synthetic notification" }));
      const obligation = { originalAmount: new Prisma.Decimal("100"), paidAmount: new Prisma.Decimal("20"), creditedAmount: new Prisma.Decimal("30"), dueDate: new Date("2026-12-01") };
      const invoice = { number: 1, invoiceLetter: "A", currency: "ARS", totalAmount: new Prisma.Decimal("100"), dueDate: new Date("2026-12-01"), issueDate: new Date("2026-11-05"), createdBy: null, purchaseOrder: null,
        clientContact: { legalName: "Synthetic client", fantasyName: null }, supplierContact: { legalName: "Synthetic supplier", fantasyName: null }, receivable: obligation, payable: obligation };
      const model = kind === "SALES_INVOICE" ? prisma.salesInvoice : prisma.supplierInvoice;
      const reads: unknown[] = [];
      stub(t, model, "findFirst", async (query: unknown) => { reads.push(query); return invoice; });
      const result = await resolveNotificationEmailContext({ tenantId: "tenant-a", companyId: null, projectId: null, linkedEntityType: kind, linkedEntityId: "invoice-a" });
      const balance = result.contextFields.find(field => field.label === "Saldo");
      assert.equal(balance?.value, "50.00 ARS");
      assert.equal(reads.length, 1);
      const query = reads[0] as { where: { tenantId: string }; select: Record<string, unknown> };
      assert.equal(query.where.tenantId, "tenant-a");
      assert.ok(query.select[kind === "SALES_INVOICE" ? "receivable" : "payable"]);
    });
  }
});
