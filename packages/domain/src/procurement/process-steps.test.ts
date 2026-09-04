import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPurchaseOrderProcessSteps,
  buildPurchaseRequestProcessSteps,
  resolvePurchaseOrderCancelledIndex,
  resolvePurchaseRequestCancelledIndex,
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

  it("CANCELLED marks reached step as Anulada and keeps replacedLabel", () => {
    const steps = buildPurchaseRequestProcessSteps({ status: "CANCELLED", cancelledReachedIndex: 2 });
    assert.deepEqual(
      steps.map((s) => `${s.id}:${s.state}:${s.label}:${s.replacedLabel ?? ""}`),
      [
        "draft:done:Borrador:",
        "sent:done:Enviada:",
        "quoting:cancelled:Anulada:Cotizando",
        "selected:upcoming:Elegida:",
        "completed:upcoming:Completada:",
      ],
    );
  });

  it("CANCELLED with NaN index falls back to Borrador", () => {
    const steps = buildPurchaseRequestProcessSteps({
      status: "CANCELLED",
      cancelledReachedIndex: Number.NaN,
    });
    assert.equal(steps[0]?.state, "cancelled");
    assert.equal(steps[0]?.replacedLabel, "Borrador");
  });
});

describe("resolvePurchaseRequestCancelledIndex", () => {
  it("linked PO → Elegida", () => {
    assert.equal(resolvePurchaseRequestCancelledIndex({ hasLinkedPo: true, quoteCount: 0 }), 3);
  });

  it("quotes or submitted → Cotizando", () => {
    assert.equal(
      resolvePurchaseRequestCancelledIndex({ hasLinkedPo: false, quoteCount: 1 }),
      2,
    );
    assert.equal(
      resolvePurchaseRequestCancelledIndex({
        hasLinkedPo: false,
        quoteCount: 0,
        submittedAt: new Date(),
      }),
      2,
    );
  });

  it("draft-only → Borrador", () => {
    assert.equal(resolvePurchaseRequestCancelledIndex({ hasLinkedPo: false, quoteCount: 0 }), 0);
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

  it("RECEIVED + partial invoice still pending → Facturar (not Pagar)", () => {
    const s = buildPurchaseOrderProcessSteps({
      ...base,
      status: "RECEIVED",
      hasReceivedQuantity: true,
      invoiceSettled: false,
      hasIssuedInvoice: true,
      fullyPaid: false,
    });
    assert.equal(s.find((x) => x.id === "invoice")?.state, "current");
    assert.equal(s.find((x) => x.id === "pay")?.state, "upcoming");
  });

  it("RECEIVED + paid partial invoice but still pending to invoice → Facturar (not complete)", () => {
    const s = buildPurchaseOrderProcessSteps({
      ...base,
      status: "RECEIVED",
      hasReceivedQuantity: true,
      invoiceSettled: false,
      hasIssuedInvoice: true,
      fullyPaid: true,
    });
    assert.equal(s.find((x) => x.id === "invoice")?.state, "current");
    assert.ok(!s.every((x) => x.state === "done"));
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
    assert.equal(s.find((x) => x.id === "approve")?.replacedLabel, "Aprobar");
    assert.equal(s.find((x) => x.id === "draft")?.state, "done");
  });
});

describe("resolvePurchaseOrderCancelledIndex", () => {
  it("issued / paid → Facturar", () => {
    assert.equal(
      resolvePurchaseOrderCancelledIndex({
        hasReceivedQuantity: false,
        hasIssuedInvoice: true,
        fullyPaid: false,
      }),
      4,
    );
  });

  it("confirmed or received qty → Recibir", () => {
    assert.equal(
      resolvePurchaseOrderCancelledIndex({
        hasReceivedQuantity: false,
        hasIssuedInvoice: false,
        fullyPaid: false,
        confirmedAt: new Date(),
      }),
      3,
    );
  });

  it("approved → Confirmar", () => {
    assert.equal(
      resolvePurchaseOrderCancelledIndex({
        hasReceivedQuantity: false,
        hasIssuedInvoice: false,
        fullyPaid: false,
        approvedAt: new Date(),
      }),
      2,
    );
  });

  it("leftDraft without approve → Aprobar", () => {
    assert.equal(
      resolvePurchaseOrderCancelledIndex({
        hasReceivedQuantity: false,
        hasIssuedInvoice: false,
        fullyPaid: false,
        leftDraft: true,
      }),
      1,
    );
  });

  it("pure draft → Borrador", () => {
    assert.equal(
      resolvePurchaseOrderCancelledIndex({
        hasReceivedQuantity: false,
        hasIssuedInvoice: false,
        fullyPaid: false,
      }),
      0,
    );
  });
});
