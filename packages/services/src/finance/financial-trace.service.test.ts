import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFinancialHref } from "./financial-trace.service";

describe("buildFinancialHref", () => {
  it("builds corporate AP paths", () => {
    assert.equal(
      buildFinancialHref("SupplierInvoice", "inv-1"),
      "/finanzas/facturas-proveedor/inv-1",
    );
    assert.equal(
      buildFinancialHref("Payable", "pay-1"),
      "/finanzas/cuentas-por-pagar/pay-1",
    );
    assert.equal(
      buildFinancialHref("Payment", "pmt-1"),
      "/finanzas/pagos-proveedor/pmt-1",
    );
  });

  it("builds corporate AR paths when projectId is omitted (D-051)", () => {
    assert.equal(
      buildFinancialHref("Receivable", "rec-1"),
      "/finanzas/cuentas-por-cobrar/rec-1",
    );
    assert.equal(
      buildFinancialHref("SalesInvoice", "inv-1"),
      "/finanzas/cuentas-por-cobrar",
    );
    assert.equal(
      buildFinancialHref("Collection", "col-1"),
      "/finanzas/cuentas-por-cobrar",
    );
  });

  it("builds project AR paths", () => {
    const projectId = "proj-1";
    assert.equal(
      buildFinancialHref("SalesInvoice", "inv-1", { projectId }),
      "/proyectos/proj-1/facturas/inv-1",
    );
    assert.equal(
      buildFinancialHref("Receivable", "rec-1", { projectId }),
      "/proyectos/proj-1/cuentas-por-cobrar/rec-1",
    );
    assert.equal(
      buildFinancialHref("Collection", "col-1", { projectId }),
      "/proyectos/proj-1/cobranzas/col-1",
    );
  });

  it("includes accountId for treasury movement href", () => {
    assert.equal(
      buildFinancialHref("AccountMovement", "mov-1", { accountId: "acc-1" }),
      "/tesoreria/reportes/movimientos?accountId=acc-1",
    );
  });
});
