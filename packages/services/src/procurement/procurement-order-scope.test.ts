import assert from "node:assert/strict";
import { test } from "node:test";

import { ServiceError } from "../types";
import { assertPurchaseOrderRelations } from "./procurement-wbs";

function order() {
  return { tenantId: "tenant", companyId: "company", projectId: "project", supplierContactId: "supplier",
    supplierContact: { tenantId: "tenant" }, purchaseRequest: { tenantId: "tenant", companyId: "company", projectId: "project" },
    lines: [{ wbsNodeId: "wbs", productId: "product", costAnalysisLineId: "apu",
      wbsNode: { id: "wbs", budgetId: "budget", budget: { tenantId: "tenant", companyId: "company" as string | null, projectId: "project" } },
      product: { tenantId: "tenant", companyId: "company" as string | null },
      costAnalysisLine: { budgetId: "budget", costItem: { budgetId: "budget", wbsNodeId: "wbs" } },
    }],
  };
}

test("OC joined scope allows own and explicitly shared budget/product parents", () => {
  const own = order(); assert.doesNotThrow(() => assertPurchaseOrderRelations(own));
  own.lines[0]!.product.companyId = null; own.lines[0]!.wbsNode.budget.companyId = null;
  assert.doesNotThrow(() => assertPurchaseOrderRelations(own));
});

const corruptions: Array<[string, (value: ReturnType<typeof order>) => void]> = [
  ["supplier tenant", (value) => { value.supplierContact.tenantId = "foreign"; }],
  ["request company", (value) => { value.purchaseRequest.companyId = "foreign"; }],
  ["WBS tenant", (value) => { value.lines[0]!.wbsNode.budget.tenantId = "foreign"; }],
  ["WBS company", (value) => { value.lines[0]!.wbsNode.budget.companyId = "foreign"; }],
  ["WBS project", (value) => { value.lines[0]!.wbsNode.budget.projectId = "foreign"; }],
  ["product tenant", (value) => { value.lines[0]!.product.tenantId = "foreign"; }],
  ["product company", (value) => { value.lines[0]!.product.companyId = "foreign"; }],
  ["APU own budget", (value) => { value.lines[0]!.costAnalysisLine.budgetId = "foreign"; }],
  ["APU parent budget", (value) => { value.lines[0]!.costAnalysisLine.costItem.budgetId = "foreign"; }],
  ["APU WBS", (value) => { value.lines[0]!.costAnalysisLine.costItem.wbsNodeId = "foreign"; }],
];
for (const [label, corrupt] of corruptions) test(`OC joined scope rejects inconsistent ${label} before exposing joined data`, () => {
  const value = order(); corrupt(value);
  assert.throws(() => assertPurchaseOrderRelations(value), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT" && !error.message.includes("foreign"));
});

function awardedOrder() {
  const base = order();
  const request = { tenantId: "tenant", companyId: "company", projectId: "project" };
  const quote = { tenantId: "tenant", purchaseRequestId: "request", supplierContactId: "supplier", purchaseRequest: { ...request } };
  return { ...base, purchaseRequestId: "request" as string | null, selectedProcurementQuoteId: "quote" as string | null,
    selectedProcurementQuote: { ...quote, purchaseRequest: { ...request } },
    lines: base.lines.map((line) => ({ ...line,
      purchaseRequestLineId: "request-line" as string | null,
      purchaseRequestLine: { purchaseRequestId: "request", purchaseRequest: { ...request } },
      procurementQuoteLineId: "quote-line" as string | null,
      procurementQuoteLine: { procurementQuoteId: "quote", purchaseRequestLineId: "request-line", procurementQuote: quote,
        purchaseRequestLine: { purchaseRequestId: "request", purchaseRequest: { ...request } } },
    })),
  };
}

test("OC joined scope preserves legitimate awards and missing line links in historical documents", () => {
  const value = awardedOrder(); assert.doesNotThrow(() => assertPurchaseOrderRelations(value));
  value.lines[0]!.purchaseRequestLineId = null; value.lines[0]!.procurementQuoteLineId = null;
  assert.doesNotThrow(() => assertPurchaseOrderRelations(value));
});

const awardCorruptions: Array<[string, (value: ReturnType<typeof awardedOrder>) => void]> = [
  ["direct OC request-line injection", (value) => { value.purchaseRequestId = null; value.selectedProcurementQuoteId = null; }],
  ["request-line parent", (value) => { value.lines[0]!.purchaseRequestLine.purchaseRequestId = "foreign"; }],
  ["request-line tenant", (value) => { value.lines[0]!.purchaseRequestLine.purchaseRequest.tenantId = "foreign"; }],
  ["request-line company", (value) => { value.lines[0]!.purchaseRequestLine.purchaseRequest.companyId = "foreign"; }],
  ["request-line project", (value) => { value.lines[0]!.purchaseRequestLine.purchaseRequest.projectId = "foreign"; }],
  ["selected quote tenant", (value) => { value.selectedProcurementQuote.tenantId = "foreign"; }],
  ["selected quote request", (value) => { value.selectedProcurementQuote.purchaseRequestId = "foreign"; }],
  ["selected quote supplier", (value) => { value.selectedProcurementQuote.supplierContactId = "foreign"; }],
  ["selected quote company", (value) => { value.selectedProcurementQuote.purchaseRequest.companyId = "foreign"; }],
  ["quote-line quote", (value) => { value.lines[0]!.procurementQuoteLine.procurementQuoteId = "foreign"; }],
  ["quote-line request-line", (value) => { value.lines[0]!.procurementQuoteLine.purchaseRequestLineId = "foreign"; }],
  ["quote-line quote tenant", (value) => { value.lines[0]!.procurementQuoteLine.procurementQuote.tenantId = "foreign"; }],
  ["quote-line request parent", (value) => { value.lines[0]!.procurementQuoteLine.purchaseRequestLine.purchaseRequestId = "foreign"; }],
  ["quote-line request company", (value) => { value.lines[0]!.procurementQuoteLine.purchaseRequestLine.purchaseRequest.companyId = "foreign"; }],
];
for (const [label, corrupt] of awardCorruptions) test(`OC joined scope rejects inconsistent ${label}`, () => {
  const value = awardedOrder(); corrupt(value);
  assert.throws(() => assertPurchaseOrderRelations(value), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT" && !error.message.includes("foreign"));
});
