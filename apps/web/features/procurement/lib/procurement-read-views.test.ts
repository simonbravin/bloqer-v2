import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { compareDecimal } from "@bloqer/utils";
import * as orderProcess from "./purchase-order-process-steps";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((entry) => elements(entry, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((entry) => elements(entry, type))];
}
function text(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" && "props" in tree ? text((tree as Element).props.children) : "";
}
const components = new Proxy({}, { get: (_, key) => String(key) });
class ServiceError extends Error { constructor(public code: string, message: string) { super(message); } }
function load<T>(file: string, services: Record<string, unknown>, dependencies: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "react") return { Suspense: "Suspense" };
    if (name === "next/link") return { default: "Link" };
    if (name === "next/navigation") return { notFound() { throw new Error("NOT_FOUND"); }, redirect() { throw new Error("REDIRECT"); } };
    if (name === "@bloqer/services") return services;
    if (name === "@bloqer/config") return { isStorageConfigured: () => false };
    if (name === "@bloqer/domain") return { can: (_roles: string[], _action: string, module: string) => module === "PROJECTS", IIBB_PERCEPTION_LABEL_ES: "IIBB" };
    if (name === "@bloqer/utils") return { compareDecimal };
    if (name === "@/lib/auth") return dependencies[name] ?? { getCurrentUser: async () => ({ session: { user: { id: "actor" } }, tenantCtx: { tenantId: "tenant", companyId: "company", roles: ["FOREMAN"] } }) };
    if (name === "@/lib/format-money") return { formatMoneyAmount: (value: string, currency: string) => `${currency} ${value}`, formatQtyFromString: (value: string) => value, formatQtyWithUnit: (value: string, unit: string) => `${value} ${unit}`, formatUnitPriceFromString: (value: string) => value, formatRatePctFromString: (value: string) => value, isPositiveMoneyAmount: (value: string) => typeof value === "string" && compareDecimal(value, "0") > 0, isZeroRatePct: () => true };
    if (name === "@/lib/format") return { formatDbDate: () => "date", formatDate: () => "date" };
    if (name === "@/lib/date-input") return { toDateInput: () => "date" };
    if (name === "@/lib/searchable-options") return { toContactPickerOption: (value: unknown) => value };
    if (name === "@/features/procurement/lib/purchase-order-process-steps") return dependencies[name] ?? { purchaseOrderProcessSteps: () => ["draft", "approve", "confirm", "receive", "invoice", "pay"].map((id) => ({ id })) };
    if (name === "@/features/procurement/lib/procurement-ui") return { procurementActionBtnClass: "action", procurementAmberBannerClass: "warning" };
    if (name === "@bloqer/services/purchase-variance-pure") return { varianceJustificationReasonEs: () => "reason" };
    if (name === "@/features/procurement") return new Proxy({}, { get: (_, key) => key === "canRegisterApInvoice" ? () => false : String(key) });
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith("@/components/") || name.startsWith("@/features/") || name.startsWith("@/lib/") || name.includes("/actions")) return components;
    assert.fail(`Unexpected dependency: ${name}`);
  } });
  return exports as T;
}

test("SC-only hub hides order/receipt counts and inaccessible financial shortcuts", async () => {
  const hub = { canViewOrders: false, purchaseRequests: { openDraft: 1, submitted: 1, awaitingQuotes: 1, quoteSelected: 0 }, purchaseOrders: { draft: 0, submitted: 0, approved: 0, confirmedOpen: 0, partiallyReceived: 0 }, receipts: { recentConfirmed: 0 }, links: { solicitudes: "/requests", ordenes: "/orders", recepciones: "/receipts", reporteProveedores: "/suppliers-report", reporteCompras: "/analysis" } };
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/compras/page.tsx", {
    ServiceError, getProjectShellInfo: async () => ({}), getProjectProcurementHub: async () => hub, getTenantModuleGate: async () => ({ isEnabled: (module: string) => module !== "SUBCONTRACTS" }), canEditPurchaseRequests: () => true, canEditPurchaseOrders: () => false, canViewProjectCostControlReport: () => false, canViewSubcontractsArea: () => false,
  });
  const tree = await Page({ params: Promise.resolve({ id: "project" }) });
  assert.equal(elements(tree, "KpiStatGrid").some((node) => node.props.title === "Órdenes de compra"), false);
  const hrefs = elements(tree, "Link").map((node) => node.props.href);
  for (const restricted of ["/orders", "/receipts", "/suppliers-report", "/analysis"]) assert.ok(!hrefs.includes(restricted));
  assert.ok(!hrefs.some((href) => String(href).includes("subcontratos")));
  assert.ok(elements(tree, "KpiStatCard").some((node) => node.props.label === "Sin cotizaciones recibidas"));
  assert.ok(elements(tree, "KpiStatCard").some((node) => node.props.label === "Adjudicadas"));
});

test("procurement analysis shortcut respects the budget module required by its destination", async () => {
  const hub = { canViewOrders: true, purchaseRequests: { openDraft: 0, submitted: 0, awaitingQuotes: 0, quoteSelected: 0 }, purchaseOrders: { draft: 0, submitted: 0, approved: 0, confirmedOpen: 0, partiallyReceived: 0 }, receipts: { recentConfirmed: 0 }, links: { solicitudes: "/requests", ordenes: "/orders", recepciones: "/receipts", reporteProveedores: "/suppliers-report", reporteCompras: "/analysis" } };
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/compras/page.tsx", {
    ServiceError, getProjectShellInfo: async () => ({}), getProjectProcurementHub: async () => hub, getTenantModuleGate: async () => ({ isEnabled: (module: string) => module !== "BUDGETS" }), canEditPurchaseRequests: () => true, canEditPurchaseOrders: () => true, canViewProjectCostControlReport: () => true, canViewSubcontractsArea: () => false,
  });
  const tree = await Page({ params: Promise.resolve({ id: "project" }) });
  const hrefs = elements(tree, "Link").map((node) => node.props.href);
  assert.ok(!hrefs.includes("/analysis")); assert.ok(hrefs.includes("/suppliers-report")); assert.ok(hrefs.includes("/orders"));
});

function orderServices(overrides: Record<string, unknown> = {}) {
  return {
    ServiceError,
    getPurchaseOrderById: async () => ({ id: "order", projectId: "project", companyId: "company", code: "OC-001", currency: "USD", status: "CONFIRMED", lines: [], supplierName: "Supplier", totalAmount: "0", taxAmount: "0", subtotal: "0" }),
    listReceiptsByPurchaseOrder: async () => [], getProjectShellInfo: async () => ({ code: "P", name: "Project" }), getCompanyProcurementSettingsForProject: async () => ({}),
    getPurchaseOrderBillingSummary: async () => { throw new ServiceError("FORBIDDEN", "AP hidden"); }, listSupplierInvoicesByPurchaseOrder: async () => { throw new ServiceError("FORBIDDEN", "AP hidden"); }, listEntityDocuments: async () => [],
    canEditPurchaseOrders: () => false, canEditPurchaseReceipts: () => false, canApprovePurchaseOrders: () => false, canAuthorizeAndCommitPo: () => false, willApproveAutoConfirmPo: () => false,
    getPurchaseOrderApprovalAvailability: () => ({ canApprove: false, canReturn: false, approvalBlockedReason: null }),
    ...overrides,
  };
}

test("order detail keeps AP unavailable instead of showing an empty invoice list or a zero billing panel", async () => {
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/page.tsx", orderServices());
  const tree = await Page({ params: Promise.resolve({ id: "project", poId: "order" }), searchParams: Promise.resolve({}) });
  assert.equal(elements(tree, "PoBillingNextStepPanel").length, 0);
  assert.equal(elements(tree, "SupplierInvoiceTable").length, 0);
  assert.ok(text(tree).includes("No se puede comprobar el saldo"));
  const steps = elements(tree, "ProcessStepper")[0]!.props.steps as { id: string }[];
  assert.ok(!steps.some((step) => step.id === "invoice" || step.id === "pay"));
  assert.equal(elements(tree, "PurchaseOrderNextStep")[0]!.props.paymentSettled, false);
});

test("a mismatched order route stops before optional billing reads", async () => {
  let reads = 0;
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/page.tsx", orderServices({ getPurchaseOrderBillingSummary: async () => { reads++; return {}; } }));
  await assert.rejects(() => Page({ params: Promise.resolve({ id: "other-project", poId: "order" }), searchParams: Promise.resolve({}) }), /NOT_FOUND/);
  assert.equal(reads, 0);
});

test("order approval controls use server eligibility and preserve an allowed return", async () => {
  let eligibilityReads = 0;
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/page.tsx", orderServices({
    getPurchaseOrderById: async () => ({ id: "order", projectId: "project", code: "OC-001", currency: "USD", status: "SUBMITTED", lines: [], supplierName: "Supplier", totalAmount: "0", taxAmount: "0", subtotal: "0" }),
    canApprovePurchaseOrders: () => true,
    getPurchaseOrderApprovalAvailability: () => { eligibilityReads++; return { canApprove: false, canReturn: true, approvalBlockedReason: "Debe aprobarla otro usuario autorizado" }; },
  }));
  const tree = await Page({ params: Promise.resolve({ id: "project", poId: "order" }), searchParams: Promise.resolve({}) });
  assert.equal(eligibilityReads, 1);
  const controls = elements(tree, "PurchaseOrderApprovalActions")[0]!;
  assert.equal(controls.props.canApprove, false); assert.equal(controls.props.canReturn, true);
  assert.ok(text(tree).includes("Debe aprobarla otro usuario autorizado"));
});

for (const code of ["VALIDATION", "CONFLICT"]) {
  test(`a ${code} billing summary does not hide accessible original-currency invoices`, async () => {
    const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/page.tsx", orderServices({
      getPurchaseOrderBillingSummary: async () => { throw new ServiceError(code, "No se puede calcular el resumen"); },
      listSupplierInvoicesByPurchaseOrder: async () => [{ id: "invoice", code: "FC-001", supplierName: "Supplier", currency: "USD" }],
    }));
    const tree = await Page({ params: Promise.resolve({ id: "project", poId: "order" }), searchParams: Promise.resolve({}) });
    assert.equal(elements(tree, "PoBillingNextStepPanel").length, 0);
    assert.ok(text(tree).includes("No se puede calcular el resumen"));
    assert.equal((elements(tree, "SupplierInvoiceTable")[0]!.props.invoices as { currency: string }[])[0]!.currency, "USD");
  });
}

test("receipt detail distinguishes unavailable AP and Inventory from absence", async () => {
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/recepciones/[receiptId]/page.tsx", {
    ...orderServices(), getPurchaseReceiptById: async () => ({ id: "receipt", projectId: "project", purchaseOrderId: "order", purchaseOrderCode: "OC-001", status: "CONFIRMED", lines: [] }),
    listStockMovements: async () => { throw new ServiceError("FORBIDDEN", "Inventory hidden"); },
  });
  const tree = await Page({ params: Promise.resolve({ id: "project", receiptId: "receipt" }), searchParams: Promise.resolve({}) });
  assert.equal(elements(tree, "PoBillingNextStepPanel").length, 0);
  assert.ok(text(tree).includes("No se puede comprobar el saldo")); assert.ok(text(tree).includes("no se puede comprobar su ausencia"));
});

test("billing panel renders all amounts with the original order currency", () => {
  const { PoBillingNextStepPanel } = load<{ PoBillingNextStepPanel: (props: unknown) => Element }>("../components/po-billing-next-step-panel.tsx", {}, {
    "./procurement-amber-callout": { ProcurementAmberCallout: "ProcurementAmberCallout" }, "../lib/procurement-ui": { procurementActionBtnClass: "action" },
  });
  const tree = PoBillingNextStepPanel({ projectId: "project", purchaseOrderId: "order", billing: { currency: "USD", hasReceivedQuantity: true, receivedAmount: "10.00", invoicedAmount: "5.00", paidAmount: "3.00", pendingToInvoice: "3.00", draftInvoiceCount: 1, draftReservedAmount: "2.00", lineMatches: [] }, hasPendingLines: true, canEditAp: false });
  const content = text(tree);
  for (const amount of ["10.00", "5.00", "3.00", "2.00"]) assert.ok(content.includes(`USD ${amount}`));
  assert.ok(content.includes("Facturación de la OC · USD"));
  assert.ok(content.includes("Facturado neto + IVA")); assert.ok(content.includes("Pendiente de facturar neto + IVA")); assert.ok(content.includes("Pagado total"));
  assert.ok(content.includes("sin percepciones"));
});

for (const scenario of [
  { name: "unpaid perceptions remain pending after a payment covering net plus VAT", receivedAmount: "121.00", draftReservedAmount: "0.00", draftInvoiceCount: 0, paidAmount: "121.00", settled: false, allReceivedAmountIssued: true, allReceivedInvoiceLinesIssued: true, expectedState: "current", expectedInvoiceState: "done", expectedComplete: false },
  { name: "credit-note settlement completes payment stage without cash", receivedAmount: "121.00", draftReservedAmount: "0.00", draftInvoiceCount: 0, paidAmount: "0.00", settled: true, allReceivedAmountIssued: true, allReceivedInvoiceLinesIssued: true, expectedState: "done", expectedInvoiceState: "done", expectedComplete: true },
  { name: "a paid issued invoice plus a draft reservation still requires invoicing", receivedAmount: "242.00", draftReservedAmount: "121.00", draftInvoiceCount: 1, paidAmount: "124.00", settled: true, allReceivedAmountIssued: false, allReceivedInvoiceLinesIssued: false, expectedState: "upcoming", expectedInvoiceState: "current", expectedComplete: false },
  { name: "a zero monetary gap keeps the next step when a received line is still pending", receivedAmount: "121.00", draftReservedAmount: "0.00", draftInvoiceCount: 0, paidAmount: "121.00", settled: true, allReceivedAmountIssued: true, allReceivedInvoiceLinesIssued: false, pendingInvoiceLineIds: ["pending"], expectedState: "upcoming", expectedInvoiceState: "current", expectedComplete: false },
]) {
  test(`order settlement uses the canonical flag: ${scenario.name}`, async () => {
    const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/page.tsx", orderServices({
      getPurchaseOrderById: async () => ({ id: "order", projectId: "project", companyId: "company", code: "OC-001", currency: "ARS", status: "RECEIVED", lines: [], supplierName: "Supplier", totalAmount: "124.00", taxAmount: "21.00", subtotal: "100.00" }),
      getPurchaseOrderBillingSummary: async () => ({ currency: "ARS", receivedAmount: scenario.receivedAmount, invoicedAmount: "121.00", draftReservedAmount: scenario.draftReservedAmount, paidAmount: scenario.paidAmount, pendingToInvoice: "0.00", hasReceivedQuantity: true, draftInvoiceCount: scenario.draftInvoiceCount, unlinkedInvoiceCount: 0, openDraftInvoiceId: null, lineMatches: [], matchWarningCount: 0, allIssuedInvoicesSettled: scenario.settled, allReceivedAmountIssued: scenario.allReceivedAmountIssued, allReceivedInvoiceLinesIssued: scenario.allReceivedInvoiceLinesIssued, pendingInvoiceLineIds: scenario.pendingInvoiceLineIds ?? [] }),
      listSupplierInvoicesByPurchaseOrder: async () => [],
    }), { "@/features/procurement/lib/purchase-order-process-steps": orderProcess });
    const tree = await Page({ params: Promise.resolve({ id: "project", poId: "order" }), searchParams: Promise.resolve({}) });
    const steps = elements(tree, "ProcessStepper")[0]!.props.steps as { id: string; state: string }[];
    assert.equal(steps.find((step) => step.id === "pay")?.state, scenario.expectedState);
    assert.equal(steps.find((step) => step.id === "invoice")?.state, scenario.expectedInvoiceState);
    assert.equal(elements(tree, "PoBillingNextStepPanel")[0]!.props.hasPendingLines, Boolean(scenario.pendingInvoiceLineIds?.length));
    const nextProps = elements(tree, "PurchaseOrderNextStep")[0]!.props;
    assert.equal(nextProps.paymentSettled, scenario.expectedComplete);
    const { PurchaseOrderNextStep } = load<{ PurchaseOrderNextStep: (props: unknown) => Element }>("../components/purchase-order-next-step.tsx", {});
    const nextMessage = text(PurchaseOrderNextStep(nextProps));
    assert.equal(nextMessage.includes("Sin saldo pendiente de pago"), scenario.expectedComplete);
    if (scenario.expectedComplete) { assert.ok(nextMessage.includes("notas de crédito")); assert.ok(!nextMessage.includes("Pagada")); }
  });
}

const globalUser = { getCurrentUser: async () => ({ session: { user: { id: "actor" } }, tenantCtx: { tenantId: "tenant", companyId: null, roles: ["OWNER"] } }) };

test("global context resolves policy and linked documents from the readable order company", async () => {
  const reads: [string, unknown][] = [];
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/page.tsx", orderServices({
    getCompanyProcurementSettingsForProject: async (_project: string, ctx: { companyId: string }) => { reads.push(["settings", ctx.companyId]); return {}; },
    listEntityDocuments: async (_type: string, _id: string, ctx: { companyId: string }) => { reads.push(["documents", ctx.companyId]); return []; },
  }), { "@/lib/auth": globalUser });
  await Page({ params: Promise.resolve({ id: "project", poId: "order" }), searchParams: Promise.resolve({}) });
  assert.deepEqual(reads, [["settings", "company"], ["documents", "company"]]);
});

test("global draft editor resolves policy, suppliers, products and budget options from the order company", async () => {
  const reads: [string, unknown][] = [];
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/editar/page.tsx", orderServices({
    getPurchaseOrderById: async () => ({ id: "order", projectId: "project", companyId: "company", code: "OC-001", status: "DRAFT" }),
    listAllContacts: async (_filters: unknown, ctx: { companyId: string }) => { reads.push(["suppliers", ctx.companyId]); return []; },
    listProcurementWbsOptions: async (_project: string, ctx: { companyId: string }) => { reads.push(["budget", ctx.companyId]); return []; },
    listProducts: async (_filters: unknown, ctx: { companyId: string }) => { reads.push(["products", ctx.companyId]); return { data: [{ id: "own", companyId: "company" }, { id: "shared", companyId: null }, { id: "other", companyId: "another-company" }] }; },
    getCompanyProcurementSettingsForProject: async (_project: string, ctx: { companyId: string }) => { reads.push(["settings", ctx.companyId]); return { allowEmergencyDirectPo: true, varianceSoftAlertPct: "7", varianceExtraApprovalPct: "17" }; },
  }), { "@/lib/auth": globalUser });
  const tree = await Page({ params: Promise.resolve({ id: "project", poId: "order" }) });
  assert.equal(reads.length, 4); assert.ok(reads.every(([, company]) => company === "company"));
  const form = elements(tree, "PurchaseOrderEditForm")[0]!;
  assert.equal(form.props.allowEmergencyDirectPo, true);
  assert.equal((form.props.varianceSettings as { varianceSoftAlertPct: string }).varianceSoftAlertPct, "7");
  assert.deepEqual(Array.from(form.props.productOptions as { id: string }[], (product) => product.id), ["own", "shared"]);
});

test("draft editor does not silently substitute defaults after a policy failure", async () => {
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/editar/page.tsx", orderServices({
    getPurchaseOrderById: async () => ({ id: "order", projectId: "project", companyId: "company", code: "OC-001", status: "DRAFT" }),
    listAllContacts: async () => [], listProcurementWbsOptions: async () => [], listProducts: async () => ({ data: [] }),
    getCompanyProcurementSettingsForProject: async () => { throw new ServiceError("CONFLICT", "Policy unavailable"); },
  }), { "@/lib/auth": globalUser });
  await assert.rejects(() => Page({ params: Promise.resolve({ id: "project", poId: "order" }) }), /Policy unavailable/);
});

const receiptRows = [
  { id: "receipt-a", number: 7, code: "RC-007", purchaseOrderId: "order", purchaseOrderCode: "OC-001", supplierName: "Supplier", receiptDate: new Date("2026-11-04"), status: "CONFIRMED", receivedByName: null, lines: [] },
  { id: "receipt-b", number: 8, code: "RC-008", purchaseOrderId: "order", purchaseOrderCode: "OC-001", supplierName: "Supplier", receiptDate: new Date("2026-11-04"), status: "CANCELLED", receivedByName: null, lines: [] },
  { id: "f9489150-2df3-4c5a-b7d4-3fec4317be76", number: null, code: "Recepción histórica f9489150-2df3-4c5a-b7d4-3fec4317be76", purchaseOrderId: "order", purchaseOrderCode: "OC-001", supplierName: "Supplier", receiptDate: new Date("2026-11-04"), status: "CONFIRMED", receivedByName: null, lines: [] },
];

test("receipt table and cards distinguish same-OC receipts and preserve historical UUID without numbering", () => {
  for (const [file, name] of [["purchase-receipt-table", "PurchaseReceiptTable"], ["purchase-receipt-cards", "PurchaseReceiptCards"]]) {
    const loaded = load<Record<string, (props: unknown) => Element>>(`../components/${file}.tsx`, {}, { "./purchase-receipt-status-badge": components, "@/lib/utils": { cn: (...values: string[]) => values.join(" ") } });
    const tree = loaded[name!]!({ receipts: receiptRows, projectId: "project" });
    const content = text(tree);
    for (const row of receiptRows) assert.ok(content.includes(row.code));
    assert.ok(content.includes("OC de origen")); assert.ok(!content.includes("RC-000"));
    const links = elements(tree, "Link");
    for (const row of receiptRows) assert.ok(links.some((link) => link.props.href === `/proyectos/project/recepciones/${row.id}` && text(link).includes(row.code)));
    if (name === "PurchaseReceiptTable") assert.ok(links.some((link) => link.props.href === "/proyectos/project/ordenes-compra/order" && text(link) === "OC-001"));
  }
});

test("receipt project and OC lists carry the service identifier separately from their source order", async () => {
  for (const context of ["project", "order"]) {
    const file = context === "project" ? "../../../app/(app)/proyectos/[id]/recepciones/page.tsx" : "../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/page.tsx";
    const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>(file, orderServices({ listReceiptsByProject: async () => receiptRows, listReceiptsByPurchaseOrder: async () => receiptRows }));
    const tree = await Page({ params: Promise.resolve({ id: "project", poId: "order" }), searchParams: Promise.resolve({}) });
    const rows = elements(tree, "PurchaseReceiptListSection")[0]!.props.receipts as typeof receiptRows;
    assert.deepEqual(Array.from(rows, (row) => [row.code, row.number, row.purchaseOrderCode]), receiptRows.map((row) => [row.code, row.number, row.purchaseOrderCode]));
  }
});

for (const row of [receiptRows[0]!, receiptRows[2]!]) {
  test(`receipt detail identifies ${row.number == null ? "historical UUID" : "its own receipt code"} and preserves the source order link`, async () => {
    const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/recepciones/[receiptId]/page.tsx", {
      ...orderServices(), getPurchaseReceiptById: async () => ({ ...row, projectId: "project" }), listStockMovements: async () => [],
    });
    const tree = await Page({ params: Promise.resolve({ id: "project", receiptId: row.id }), searchParams: Promise.resolve({}) });
    assert.equal(elements(tree, "PageShell")[0]!.props.breadcrumbLabel, row.code);
    assert.equal(text(elements(tree, "h1")[0]), row.code);
    assert.ok(elements(tree, "Link").some((link) => link.props.href === "/proyectos/project/ordenes-compra/order" && text(link) === "OC-001"));
  });
}

test("SC desktop and mobile preserve per-line currencies across multiple budgets and historical quotes", async () => {
  const lines = ["USD", "ARS", null].map((budgetCurrency, index) => ({ id: `line-${index}`, description: `Item ${index}`, quantity: "1", unit: "un", wbsNodeId: `wbs-${index}`, wbsNodeCode: `${index + 1}`, budgetUnitCostSnapshot: `${index + 10}`, budgetCurrency, awardedPurchaseOrderId: null }));
  const quotes = [{ id: "quote", supplierName: "Supplier", status: "REJECTED", totalAmount: "30", currency: "ARS", leadTimeDays: null, validUntil: null, iibbPerceptionAmount: "0", lines: lines.map((line) => ({ purchaseRequestLineId: line.id, description: line.description, quantity: "1", unit: "un", offerKind: "QUOTED", unitPrice: "10", discountPct: "0", taxRate: "0", lineTotal: "10", budgetCurrency: line.budgetCurrency })) }];
  const pr = { id: "request", projectId: "project", code: "SC-001", status: "DRAFT", lines, notes: null, createdAt: new Date("2026-11-04"), submittedAt: null, neededByDate: null };
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/proyectos/[id]/solicitudes-compra/[prId]/page.tsx", {
    ServiceError, getPurchaseRequestById: async () => pr, listProcurementQuotesDetailedForRequest: async () => quotes, getPurchaseRequestPoLinks: async () => ({ activeOrders: [], hasAny: false, awardedLineCount: 0, totalLineCount: 3 }), canEditPurchaseRequests: () => false, canManageProcurementQuotes: () => false, listEntityDocuments: async () => [],
  }, { "@/features/procurement/lib/purchase-request-process-steps": { purchaseRequestProcessSteps: () => [] } });
  const desktop = await Page({ params: Promise.resolve({ id: "project", prId: "request" }), searchParams: Promise.resolve({}) });
  const refs = elements(desktop, "PoLineBudgetRef");
  assert.deepEqual(Array.from(refs, (node) => node.props.currency), ["USD", "ARS", null]);
  const section = elements(desktop, "ProcurementQuotesSection")[0]!;
  assert.deepEqual(Array.from(section.props.prLines as { budgetCurrency: string | null }[], (line) => line.budgetCurrency), ["USD", "ARS", null]);
  const { PurchaseRequestDetailMobileSections } = load<{ PurchaseRequestDetailMobileSections: (props: unknown) => Element }>("../components/purchase-request-detail-mobile-sections.tsx", {}, {
    "../lib/purchase-request-award-selection": { canQuickAwardQuoteLine: () => false, quoteLineOfferLabel: () => "Cotizado" }, "./purchase-request-status-badge": components, "./procurement-quote-status-badge": components, "./procurement-quote-form": components, "./po-line-budget-ref": components,
  });
  const mobile = PurchaseRequestDetailMobileSections(elements(desktop, "PurchaseRequestDetailMobileSections")[0]!.props);
  assert.ok(text(mobile).includes("Cotizaciones"));
  const mobileRefs = elements(mobile, "PoLineBudgetRef");
  assert.deepEqual(Array.from(mobileRefs, (node) => node.props.currency), ["USD", "ARS", null, "USD", "ARS", null]);
  assert.equal(mobileRefs[3]!.props.purchaseCurrency, "ARS");
  const { PoLineBudgetRef } = load<{ PoLineBudgetRef: (props: unknown) => Element }>("../components/po-line-budget-ref.tsx", {}, { "@/lib/budget-units": { budgetUnitLabel: (unit: string) => unit } });
  const rendered = mobileRefs.map((node) => text(PoLineBudgetRef(node.props)));
  assert.ok(rendered[0]!.includes("10 USD")); assert.ok(rendered[1]!.includes("11 ARS")); assert.ok(rendered[2]!.includes("12 moneda no disponible"));
  assert.ok(rendered[3]!.includes("Referencia en USD y cotización en ARS: desvío no calculable"));
  assert.ok(!rendered[4]!.includes("desvío no calculable"));
  assert.ok(rendered[5]!.includes("Moneda de referencia no disponible; no se puede comparar"));
});

test("new and draft receipt warehouse options bind the source company and exclude other projects", async () => {
  for (const mode of ["create", "edit"]) {
    const requests: { filters: { companyId: string }; companyId: string }[] = [];
    const services = {
      ...orderServices(), canEditPurchaseReceipts: () => true, findActiveDraftReceiptId: async () => null,
      getPoLinesForReceiptForm: async () => [], countActiveDraftReceiptsForPo: async () => 0,
      getPurchaseReceiptById: async () => ({ ...receiptRows[0], status: "DRAFT", projectId: "project", companyId: "company", lines: [] }), listStockMovements: async () => [],
      listWarehouses: async (filters: { companyId: string }, ctx: { companyId: string }) => { requests.push({ filters, companyId: ctx.companyId }); return [{ id: "general", name: "General", projectId: null }, { id: "site", name: "Site", projectId: "project" }, { id: "elsewhere", name: "Other site", projectId: "another-project" }]; },
    };
    const file = mode === "create" ? "../../../app/(app)/proyectos/[id]/ordenes-compra/[poId]/recepciones/nueva/page.tsx" : "../../../app/(app)/proyectos/[id]/recepciones/[receiptId]/page.tsx";
    const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>(file, services, { "@/lib/auth": globalUser });
    const tree = await Page({ params: Promise.resolve({ id: "project", poId: "order", receiptId: "receipt-a" }), searchParams: Promise.resolve({}) });
    assert.equal(requests[0]?.filters.companyId, "company"); assert.equal(requests[0]?.companyId, "company");
    const form = elements(tree, mode === "create" ? "ReceiptCreateComposer" : "ReceiptForm")[0]!;
    assert.deepEqual(Array.from(form.props.warehouseOptions as { id: string }[], (warehouse) => warehouse.id), ["general", "site"]);
  }
});
