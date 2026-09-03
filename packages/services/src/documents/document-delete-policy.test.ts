import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSoftDeleteDocumentByLink,
  isStandaloneProjectDocument,
} from "./document-delete-policy";

describe("isStandaloneProjectDocument", () => {
  it("treats PROJECT and legacy null as library docs", () => {
    assert.equal(isStandaloneProjectDocument("PROJECT"), true);
    assert.equal(isStandaloneProjectDocument(null), true);
    assert.equal(isStandaloneProjectDocument(undefined), true);
  });

  it("rejects operational attachments", () => {
    for (const t of [
      "JOBSITE_LOG",
      "CERTIFICATION",
      "SUPPLIER_INVOICE",
      "SALES_INVOICE",
      "PURCHASE_ORDER",
      "PURCHASE_RECEIPT",
      "PURCHASE_REQUEST",
      "PROCUREMENT_QUOTE",
      "SUBCONTRACT",
      "SUBCONTRACT_CERTIFICATION",
      "BUDGET",
      "WAREHOUSE_TRANSFER",
      "SCHEDULED_REPORT",
      "OTHER",
    ]) {
      assert.equal(isStandaloneProjectDocument(t), false, t);
    }
  });
});

describe("canSoftDeleteDocumentByLink", () => {
  it("allows ACTIVE/ARCHIVED library docs and any UPLOADING cancel", () => {
    assert.equal(canSoftDeleteDocumentByLink({ status: "ACTIVE", linkedEntityType: "PROJECT" }), true);
    assert.equal(canSoftDeleteDocumentByLink({ status: "ARCHIVED", linkedEntityType: null }), true);
    assert.equal(
      canSoftDeleteDocumentByLink({ status: "UPLOADING", linkedEntityType: "SUPPLIER_INVOICE" }),
      true,
    );
  });

  it("blocks delete of linked evidence and already-deleted rows", () => {
    assert.equal(
      canSoftDeleteDocumentByLink({ status: "ACTIVE", linkedEntityType: "PROCUREMENT_QUOTE" }),
      false,
    );
    assert.equal(
      canSoftDeleteDocumentByLink({ status: "ARCHIVED", linkedEntityType: "JOBSITE_LOG" }),
      false,
    );
    assert.equal(canSoftDeleteDocumentByLink({ status: "DELETED", linkedEntityType: "PROJECT" }), false);
  });
});
