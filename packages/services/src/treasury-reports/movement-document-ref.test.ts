import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  displayMovementDescription,
  salesInvoiceDocumentRef,
  supplierInvoiceDocumentRef,
} from "./movement-document-ref";

describe("displayMovementDescription", () => {
  it("rewrites legacy payment UUID descriptions to invoice codes", () => {
    assert.equal(
      displayMovementDescription(
        "Pago factura proveedor ca1d559d-902d-4e5e-bd7a-d0adec96ad90",
        "PAYMENT",
        "FP-00048",
      ),
      "Pago factura proveedor FP-00048",
    );
  });

  it("rewrites legacy collection UUID descriptions to invoice codes", () => {
    assert.equal(
      displayMovementDescription(
        "Cobranza factura a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "COLLECTION",
        "FAC-00012",
      ),
      "Cobranza factura FAC-00012",
    );
  });

  it("leaves already-coded payment descriptions unchanged", () => {
    assert.equal(
      displayMovementDescription(
        "Pago factura proveedor FP-00048",
        "PAYMENT",
        "FP-00048",
      ),
      "Pago factura proveedor FP-00048",
    );
  });

  it("leaves custom descriptions unchanged", () => {
    assert.equal(
      displayMovementDescription("Transferencia proveedor", "PAYMENT", "FP-00048"),
      "Transferencia proveedor",
    );
  });

  it("leaves description unchanged when documentRef is missing", () => {
    assert.equal(
      displayMovementDescription(
        "Pago factura proveedor ca1d559d-902d-4e5e-bd7a-d0adec96ad90",
        "PAYMENT",
        null,
      ),
      "Pago factura proveedor ca1d559d-902d-4e5e-bd7a-d0adec96ad90",
    );
  });

  it("ignores documentRef when sourceType does not match", () => {
    assert.equal(
      displayMovementDescription(
        "Pago factura proveedor ca1d559d-902d-4e5e-bd7a-d0adec96ad90",
        "MANUAL_ADJUSTMENT",
        "FP-00048",
      ),
      "Pago factura proveedor ca1d559d-902d-4e5e-bd7a-d0adec96ad90",
    );
  });
});

describe("invoice document refs", () => {
  it("formats supplier and sales codes", () => {
    assert.equal(supplierInvoiceDocumentRef(48), "FP-00048");
    assert.equal(salesInvoiceDocumentRef(12), "FAC-00012");
    assert.equal(supplierInvoiceDocumentRef(null), null);
    assert.equal(salesInvoiceDocumentRef(undefined), null);
  });
});
