import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { assertObligationReadIntegrity } from "./obligation-read-integrity";

const row = { tenantId: "tenant-a", companyId: "company-a", projectId: "project-a", currency: "ARS", originalAmount: new Prisma.Decimal("100") };
function parents() {
  return {
    company: { id: "company-a", tenantId: "tenant-a" },
    contact: { id: "contact-a", tenantId: "tenant-a" }, contactId: "contact-a",
    project: { id: "project-a", tenantId: "tenant-a", companyId: "company-a" } as { id: string; tenantId: string; companyId: string | null } | null,
    invoice: { ...row, id: "invoice-a", contactId: "contact-a", totalAmount: new Prisma.Decimal("100"), documentKind: "INVOICE", status: "ISSUED" },
    invoiceId: "invoice-a",
  };
}

describe("obligation read graph integrity", () => {
  it("preserves own, shared-project and corporate obligations", () => {
    assert.doesNotThrow(() => assertObligationReadIntegrity(row, parents()));
    const shared = parents(); shared.project!.companyId = null;
    assert.doesNotThrow(() => assertObligationReadIntegrity(row, shared));
    const corporate = parents(); corporate.project = null;
    const corporateInvoice = { ...corporate.invoice, projectId: null };
    assert.doesNotThrow(() => assertObligationReadIntegrity({ ...row, projectId: null }, { ...corporate, invoice: corporateInvoice }));
  });

  const corruptions: Array<[string, (p: ReturnType<typeof parents>) => void]> = [
    ["company tenant", (p) => { p.company.tenantId = "tenant-b"; }],
    ["contact tenant", (p) => { p.contact.tenantId = "tenant-b"; }],
    ["contact identity", (p) => { p.contact.id = "contact-b"; }],
    ["project tenant", (p) => { p.project!.tenantId = "tenant-b"; }],
    ["project company", (p) => { p.project!.companyId = "company-b"; }],
    ["missing project", (p) => { p.project = null; }],
    ["invoice tenant", (p) => { p.invoice.tenantId = "tenant-b"; }],
    ["invoice company", (p) => { p.invoice.companyId = "company-b"; }],
    ["invoice project", (p) => { p.invoice.projectId = "project-b"; }],
    ["invoice contact", (p) => { p.invoice.contactId = "contact-b"; }],
    ["invoice currency", (p) => { p.invoice.currency = "USD"; }],
    ["invoice amount", (p) => { p.invoice.totalAmount = new Prisma.Decimal("101"); }],
    ["credit note as debt", (p) => { p.invoice.documentKind = "CREDIT_NOTE"; }],
    ["draft invoice as debt", (p) => { p.invoice.status = "DRAFT"; }],
    ["cancelled invoice as debt", (p) => { p.invoice.status = "CANCELLED"; }],
  ];
  for (const [name, corrupt] of corruptions) {
    it(`rejects ${name} before exposing related labels`, () => {
      const p = parents(); corrupt(p);
      assert.throws(() => assertObligationReadIntegrity(row, p), { code: "FORBIDDEN" });
    });
  }
});
