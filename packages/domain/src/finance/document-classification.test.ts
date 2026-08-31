import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyAccountMovement,
  classifySalesInvoice,
  classifySupplierInvoice,
  FINANCIAL_DOCUMENT_CLASS_LABEL_ES,
  isFinancialDocumentClassCode,
} from "./document-classification";

describe("classifySalesInvoice [D-102]", () => {
  it("corporate AR → INCOME_CORPORATE", () => {
    const c = classifySalesInvoice({ projectId: null });
    assert.equal(c.classCode, "INCOME_CORPORATE");
    assert.equal(c.classLabel, FINANCIAL_DOCUMENT_CLASS_LABEL_ES.INCOME_CORPORATE);
    assert.equal(c.family, "income");
  });

  it("project sale without cert → SALE_PROJECT", () => {
    const c = classifySalesInvoice({ projectId: "p1", certificationId: null });
    assert.equal(c.classCode, "SALE_PROJECT");
    assert.equal(c.family, "sale");
  });

  it("project sale from certification → SALE_CERT", () => {
    const c = classifySalesInvoice({ projectId: "p1", certificationId: "c1" });
    assert.equal(c.classCode, "SALE_CERT");
    assert.equal(c.classLabel, "Venta — certificación");
  });

  it("advance has no persisted signal → SALE_PROJECT fallback", () => {
    const c = classifySalesInvoice({ projectId: "p1" });
    assert.equal(c.classCode, "SALE_PROJECT");
  });
});

describe("classifySupplierInvoice [D-102]", () => {
  it("subcontract wins over PO", () => {
    const c = classifySupplierInvoice({
      projectId: "p1",
      purchaseOrderId: "po1",
      hasPoLineLink: true,
      subcontractCertificationId: "sc1",
    });
    assert.equal(c.classCode, "SUBCONTRACT");
    assert.equal(c.family, "purchase");
  });

  it("header PO → PURCHASE_COMMITTED", () => {
    const c = classifySupplierInvoice({
      projectId: "p1",
      purchaseOrderId: "po1",
    });
    assert.equal(c.classCode, "PURCHASE_COMMITTED");
  });

  it("line PO link without header still → PURCHASE_COMMITTED", () => {
    const c = classifySupplierInvoice({
      projectId: "p1",
      purchaseOrderId: null,
      hasPoLineLink: true,
    });
    assert.equal(c.classCode, "PURCHASE_COMMITTED");
  });

  it("project without commitment → DIRECT_PROJECT", () => {
    const c = classifySupplierInvoice({ projectId: "p1" });
    assert.equal(c.classCode, "DIRECT_PROJECT");
    assert.equal(c.family, "direct");
  });

  it("corporate without commitment → OVERHEAD", () => {
    const c = classifySupplierInvoice({ projectId: null });
    assert.equal(c.classCode, "OVERHEAD");
    assert.equal(c.family, "overhead");
  });
});

describe("classifyAccountMovement [D-102]", () => {
  it("COLLECTION source → COLLECTION (income family)", () => {
    const c = classifyAccountMovement({ type: "INFLOW", sourceType: "COLLECTION" });
    assert.equal(c.classCode, "COLLECTION");
    assert.equal(c.family, "income");
  });

  it("PAYMENT source → PAYMENT (payment family)", () => {
    const c = classifyAccountMovement({ type: "OUTFLOW", sourceType: "PAYMENT" });
    assert.equal(c.classCode, "PAYMENT");
    assert.equal(c.family, "payment");
  });

  it("internal transfer → TRANSFER", () => {
    assert.equal(
      classifyAccountMovement({
        type: "TRANSFER_OUT",
        sourceType: "INTERNAL_TRANSFER",
      }).classCode,
      "TRANSFER",
    );
  });

  it("manual inflow → INCOME_CASH (income family)", () => {
    const c = classifyAccountMovement({
      type: "INFLOW",
      sourceType: "MANUAL_ADJUSTMENT",
    });
    assert.equal(c.classCode, "INCOME_CASH");
    assert.equal(c.family, "income");
  });

  it("manual outflow → OVERHEAD", () => {
    assert.equal(
      classifyAccountMovement({
        type: "OUTFLOW",
        sourceType: "MANUAL_ADJUSTMENT",
      }).classCode,
      "OVERHEAD",
    );
  });

  it("ADJUSTMENT type → OVERHEAD (not TRANSFER)", () => {
    assert.equal(
      classifyAccountMovement({
        type: "ADJUSTMENT",
        sourceType: "MANUAL_ADJUSTMENT",
      }).classCode,
      "OVERHEAD",
    );
  });
});

describe("isFinancialDocumentClassCode", () => {
  it("accepts known codes", () => {
    assert.equal(isFinancialDocumentClassCode("DIRECT_PROJECT"), true);
  });
  it("rejects unknown", () => {
    assert.equal(isFinancialDocumentClassCode("EXPENSE"), false);
    assert.equal(isFinancialDocumentClassCode(null), false);
  });
});
