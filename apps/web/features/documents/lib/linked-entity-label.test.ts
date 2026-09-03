import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  linkedDocumentDeleteBlockedReason,
  linkedEntityTypeLabelEs,
} from "./linked-entity-label";

describe("linkedEntityTypeLabelEs", () => {
  it("hides PROJECT and empty links", () => {
    assert.equal(linkedEntityTypeLabelEs("PROJECT"), null);
    assert.equal(linkedEntityTypeLabelEs(null), null);
  });

  it("names operational parents", () => {
    assert.equal(linkedEntityTypeLabelEs("SUPPLIER_INVOICE"), "una factura de proveedor");
    assert.equal(linkedEntityTypeLabelEs("PROCUREMENT_QUOTE"), "una cotización");
    assert.equal(linkedEntityTypeLabelEs("JOBSITE_LOG"), "un parte de libro de obra");
  });
});

describe("linkedDocumentDeleteBlockedReason", () => {
  it("explains why a linked file cannot be deleted", () => {
    const reason = linkedDocumentDeleteBlockedReason("SALES_INVOICE");
    assert.ok(reason?.includes("factura de venta"));
    assert.equal(linkedDocumentDeleteBlockedReason("PROJECT"), undefined);
  });
});
