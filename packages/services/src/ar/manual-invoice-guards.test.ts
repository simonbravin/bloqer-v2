import assert from "node:assert/strict";
import { test } from "node:test";
import { assertManualInvoiceHasNoCertificationLinks } from "./manual-invoice-guards";

test("manual invoices reject both header and line certification links", () => {
  assert.throws(
    () => assertManualInvoiceHasNoCertificationLinks({ certificationId: "cert", lines: [{}] }),
    /flujo de factura desde certificación/,
  );
  assert.throws(
    () => assertManualInvoiceHasNoCertificationLinks({ lines: [{ certificationLineId: "line" }] }),
    /flujo de factura desde certificación/,
  );
  assert.doesNotThrow(() =>
    assertManualInvoiceHasNoCertificationLinks({
      certificationId: null,
      lines: [{ certificationLineId: null }],
    }),
  );
});
