import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  assertSubcontractParents,
  assertSubcontractCertificationParents,
  type SubcontractRecord,
  type SubcontractCertificationRecord,
} from "./subcontract-scope";
const decimal = (value: string) => new Prisma.Decimal(value);
function parent(): SubcontractRecord {
  return {
    id: "sub",
    tenantId: "tenant",
    companyId: "company",
    projectId: "project",
    subcontractorContactId: "contact",
    company: { id: "company", tenantId: "tenant" },
    project: { id: "project", tenantId: "tenant", companyId: null },
    subcontractorContact: {
      id: "contact",
      tenantId: "tenant",
      legalName: "Synthetic",
      fantasyName: null,
    },
    lines: [
      {
        id: "line",
        subcontractId: "sub",
        wbsNodeId: "wbs",
        certifiedQuantity: decimal("0"),
        quantity: decimal("10"),
        unitPrice: decimal("1"),
        lineTotal: decimal("10"),
        wbsNode: {
          id: "wbs",
          type: "ITEM",
          budgetId: "budget",
          budget: { tenantId: "tenant", companyId: null, projectId: "project", status: "APPROVED" },
          costItem: { budgetId: "budget", unit: "m2" },
        },
      },
    ],
    certifications: [],
  } as unknown as SubcontractRecord;
}
function certificate(): SubcontractCertificationRecord {
  const sub = parent();
  return {
    id: "cert",
    tenantId: "tenant",
    companyId: "company",
    projectId: "project",
    subcontractId: "sub",
    subcontractorContactId: "contact",
    status: "DRAFT",
    subcontract: sub,
    supplierInvoice: null,
    replacedBy: [],
    lines: [
      {
        id: "cert-line",
        subcontractCertificationId: "cert",
        subcontractLineId: "line",
        subcontractLine: sub.lines[0],
      },
    ],
  } as unknown as SubcontractCertificationRecord;
}
describe("AG08 subcontract parent graph integrity", () => {
  it("retains a shared project and shared baseline while validating the own-company contract", () => {
    const row = parent();
    assert.doesNotThrow(() => assertSubcontractParents(row, row.lines));
    assert.doesNotThrow(() => assertSubcontractCertificationParents(certificate()));
  });
  it("rejects foreign parent tenant/company identities before serializing their names", () => {
    for (const change of [
      (row: SubcontractRecord) => {
        row.company.tenantId = "foreign";
      },
      (row: SubcontractRecord) => {
        row.project.tenantId = "foreign";
      },
      (row: SubcontractRecord) => {
        row.project.companyId = "foreign";
      },
      (row: SubcontractRecord) => {
        row.subcontractorContact.tenantId = "foreign";
      },
    ]) {
      const row = parent();
      change(row);
      assert.throws(() => assertSubcontractParents(row, row.lines), /inconsistentes/);
    }
  });
  it("rejects a WBS baseline of another company or a contradictory cost item", () => {
    const row = parent();
    row.lines[0]!.wbsNode!.budget.companyId = "foreign";
    assert.throws(() => assertSubcontractParents(row, row.lines), /inconsistentes/);
    const other = parent();
    other.lines[0]!.wbsNode!.costItem!.budgetId = "foreign";
    assert.throws(() => assertSubcontractParents(other, other.lines), /inconsistentes/);
  });
  it("checks certification roots and line ownership against the actual subcontract", () => {
    const row = certificate();
    row.companyId = "foreign";
    assert.throws(() => assertSubcontractCertificationParents(row), /inconsistentes/);
    const other = certificate();
    other.lines[0]!.subcontractLine.subcontractId = "foreign";
    assert.throws(() => assertSubcontractCertificationParents(other), /inconsistentes/);
  });
  it("does not treat an unrelated or dual-origin invoice as the subcontract's own document", () => {
    const row = certificate();
    row.status = "APPROVED";
    row.supplierInvoice = {
      id: "invoice",
      number: 1,
      tenantId: "tenant",
      companyId: "company",
      projectId: "project",
      supplierContactId: "contact",
      subcontractCertificationId: "cert",
      purchaseOrderId: null,
      status: "DRAFT",
      documentKind: "INVOICE",
    };
    assert.doesNotThrow(() => assertSubcontractCertificationParents(row));
    row.supplierInvoice.purchaseOrderId = "foreign-order";
    assert.throws(() => assertSubcontractCertificationParents(row), /inconsistentes/);
  });
  it("reconciles the mutable certified quantity against approved source documents without repairing history", () => {
    const row = parent();
    row.certifications.push({
      id: "cert",
      tenantId: "tenant",
      companyId: "company",
      projectId: "project",
      subcontractId: "sub",
      subcontractorContactId: "contact",
      status: "APPROVED",
      lines: [{ subcontractLineId: "line", currentQty: decimal("2"), lineTotal: decimal("2") }],
    });
    assert.throws(() => assertSubcontractParents(row, row.lines), /cantidades/);
    row.lines[0]!.certifiedQuantity = decimal("2");
    assert.doesNotThrow(() => assertSubcontractParents(row, row.lines));
    assert.equal(row.certifications[0]!.lines[0]!.currentQty.toString(), "2");
  });
  it("validates successor ownership and rejects multiple non-cancelled successors", () => {
    const row = certificate();
    row.status = "REJECTED";
    row.replacedBy.push({
      id: "next",
      number: 2,
      tenantId: "tenant",
      companyId: "company",
      projectId: "project",
      subcontractId: "sub",
      subcontractorContactId: "contact",
      replacesCertificationId: "cert",
    });
    assert.doesNotThrow(() => assertSubcontractCertificationParents(row));
    row.replacedBy[0]!.companyId = "foreign";
    assert.throws(() => assertSubcontractCertificationParents(row), /inconsistentes/);
  });
});
