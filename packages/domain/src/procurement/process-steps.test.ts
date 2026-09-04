import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPurchaseOrderProcessSteps,
  buildPurchaseRequestProcessSteps,
} from "./process-steps";

function states(steps: ReturnType<typeof buildPurchaseRequestProcessSteps>) {
  return steps.map((s) => `${s.id}:${s.state}`);
}

describe("buildPurchaseRequestProcessSteps", () => {
  it("DRAFT → current on Borrador", () => {
    assert.deepEqual(states(buildPurchaseRequestProcessSteps({ status: "DRAFT" })), [
      "draft:current",
      "sent:upcoming",
      "quoting:upcoming",
      "selected:upcoming",
      "completed:upcoming",
    ]);
  });

  it("SUBMITTED → current on Cotizando", () => {
    assert.deepEqual(states(buildPurchaseRequestProcessSteps({ status: "SUBMITTED" })), [
      "draft:done",
      "sent:done",
      "quoting:current",
      "selected:upcoming",
      "completed:upcoming",
    ]);
  });

  it("QUOTE_SELECTED → current on Elegida", () => {
    assert.deepEqual(states(buildPurchaseRequestProcessSteps({ status: "QUOTE_SELECTED" })), [
      "draft:done",
      "sent:done",
      "quoting:done",
      "selected:current",
      "completed:upcoming",
    ]);
  });

  it("COMPLETED → all done", () => {
    const steps = buildPurchaseRequestProcessSteps({ status: "COMPLETED" });
    assert.ok(steps.every((s) => s.state === "done"));
  });

  it("CANCELLED marks reached step as Anulada", () => {
    const steps = buildPurchaseRequestProcessSteps({ status: "CANCELLED", cancelledReachedIndex: 2 });
    assert.deepEqual(
      steps.map((s) => `${s.id}:${s.state}:${s.label}`),
      [
        "draft:done:Borrador",
        "sent:done:Enviada",
        "quoting:cancelled:Anulada",
        "selected:upcoming:Elegida",
        "completed:upcoming:Completada",
      ],
    );
  });
});

describe("buildPurchaseOrderProcessSteps", () => {
  const base = {
    hasReceivedQuantity: false,
    invoiceSettled: false,
    hasIssuedInvoice: false,
    fullyPaid: false,
  };

  it("DRAFT → Borrador", () => {
    const s = buildPurchaseOrderProcessSteps({ ...base, status: "DRAFT" });
    assert.equal(s[0]?.state, "current");
    assert.equal(s[1]?.state, "upcoming");
  });

  it("SUBMITTED → Aprobar current", () => {
    const s = buildPurchaseOrderProcessSteps({ ...base, status: "SUBMITTED" });
    assert.equal(s.find((x) => x.id === "approve")?.state, "current");
    assert.equal(s.find((x) => x.id === "draft")?.state, "done");
  });

  it("APPROVED → Confirmar current", () => {
    const s = buildPurchaseOrderProcessSteps({ ...base, status: "APPROVED" });
    assert.equal(s.find((x) => x.id === "confirm")?.state, "current");
    assert.equal(s.find((x) => x.id === "approve")?.state, "done");
  });

  it("shortcut to CONFIRMED leaves Aprobar/Confirmar done and Recibir current", () => {
    const s = buildPurchaseOrderProcessSteps({ ...base, status: "CONFIRMED" });
    assert.equal(s.find((x) => x.id === "draft")?.state, "done");
    assert.equal(s.find((x) => x.id === "approve")?.state, "done");
    assert.equal(s.find((x) => x.id === "confirm")?.state, "done");
    assert.equal(s.find((x) => x.id === "receive")?.state, "current");
  });

  it("PARTIALLY_RECEIVED stays on Recibir", () => {
    const s = buildPurchaseOrderProcessSteps({
      ...base,
      status: "PARTIALLY_RECEIVED",
      hasReceivedQuantity: true,
      invoiceSettled: false,
    });
    assert.equal(s.find((x) => x.id === "receive")?.state, "current");
  });

  it("RECEIVED with pending invoice → Facturar", () => {
    const s = buildPurchaseOrderProcessSteps({
      ...base,
      status: "RECEIVED",
      hasReceivedQuantity: true,
      invoiceSettled: false,
    });
    assert.equal(s.find((x) => x.id === "invoice")?.state, "current");
  });

  it("RECEIVED + issued unpaid → Pagar", () => {
    const s = buildPurchaseOrderProcessSteps({
      ...base,
      status: "RECEIVED",
      hasReceivedQuantity: true,
      invoiceSettled: true,
      hasIssuedInvoice: true,
      fullyPaid: false,
    });
    assert.equal(s.find((x) => x.id === "pay")?.state, "current");
  });

  it("RECEIVED + fully paid → all done", () => {
    const s = buildPurchaseOrderProcessSteps({
      ...base,
      status: "RECEIVED",
      hasReceivedQuantity: true,
      invoiceSettled: true,
      hasIssuedInvoice: true,
      fullyPaid: true,
    });
    assert.ok(s.every((x) => x.state === "done"));
  });

  it("CANCELLED on approve step shows Anulada label", () => {
    const s = buildPurchaseOrderProcessSteps({
      ...base,
      status: "CANCELLED",
      cancelledReachedIndex: 1,
    });
    assert.equal(s.find((x) => x.id === "approve")?.state, "cancelled");
    assert.equal(s.find((x) => x.id === "approve")?.label, "Anulada");
    assert.equal(s.find((x) => x.id === "draft")?.state, "done");
  });
});
