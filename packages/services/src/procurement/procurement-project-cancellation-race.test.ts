import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Prisma } from "@bloqer/database";
import * as domain from "@bloqer/domain";
import * as utils from "@bloqer/utils";
import { ServiceError, type ServiceContext } from "../types";
import { lockProjectForOperationalMutation } from "../project/project-operational-guard";
import { calcLine, recalcPurchaseOrderTotals } from "./purchase-order-calc.service";
import { headerTotalsWithIibbPerception } from "../finance/document-header-tax";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import * as lineMoney from "../finance/invoice-line-money";
import * as money from "../finance/money-decimal";
import { coerceFreeTextGoodsCostType, resolveLineCostType } from "../cost-control/cost-type";
import { companyScopeFilter, isCrossCompany } from "../company-scope";

type ServiceModule = Record<string, (...args: unknown[]) => Promise<unknown>>;
const ctx: ServiceContext = { actorUserId: "actor", tenantId: "tenant", companyId: "company", roles: ["OWNER"] };
const decimal = (value: string) => new Prisma.Decimal(value);
const line = { id: "line", wbsNodeId: "wbs", quantity: decimal("1"), unitPrice: decimal("10"), lineSubtotal: decimal("10"), lineTax: decimal("0"), lineTotal: decimal("10"), certifiedQuantity: decimal("0"), sortOrder: 0, description: "Synthetic line", unit: "u", awardedPurchaseOrderId: null };
const inputLine = { ...line, quantity: "1", unitPrice: "10", taxRate: "0", lineType: "GOODS", purchaseRequestLineId: "line" };

/**
 * Execute maintained service bodies and the real Project lock/status helper.
 * Replace authorization/I/O boundaries and commit cancellation immediately before
 * the writer's first lock/write. This is an interleaving regression, not SQL or
 * financial-math verification; the isolated live suite verifies database locks.
 */
function setup(options: { cancelBeforeFirstLock?: boolean; status?: string; allowActivation?: boolean; omitRecheck?: boolean } = {}) {
  const events: string[] = [];
  let prechecks = 0;
  let cancelled = false;
  const project = { id: "project", tenantId: "tenant", companyId: "company", country: "AR", status: "ACTIVE" };
  const request = { id: "request", tenantId: "tenant", companyId: "company", projectId: "project", status: options.status ?? "DRAFT", lines: [line] };
  const order = { ...request, id: "order", supplierContactId: "supplier", currency: "ARS", purchaseRequestId: null, totalAmount: decimal("10"), iibbPerceptionRate: decimal("0"), updatedAt: new Date("2026-11-04T00:00:00Z") };
  const subcontract = { ...request, id: "subcontract", number: 1, subcontractorContact: { legalName: "Synthetic", fantasyName: null } };
  const quote = { id: "quote", tenantId: "tenant", purchaseRequestId: "request", purchaseRequest: request, status: "RECEIVED", lines: [], currency: "ARS" };
  function beforeLock() {
    if (options.cancelBeforeFirstLock !== false && !cancelled) {
      // Cancellation wins the Project row before this writer obtains its lock.
      project.status = "CANCELLED";
      cancelled = true;
      events.push("cancellation committed");
    }
  }
  async function precheck() {
    prechecks++;
    if (project.status !== "ACTIVE") throw new ServiceError("CONFLICT", "La obra está cancelada");
    return { ...project };
  }
  const stop = new Error("Reached ordinary document operation");
  function write(name: string) {
    beforeLock();
    events.push(`write ${name}`);
    throw stop;
  }
  const transaction = {
    $queryRaw: async (query: TemplateStringsArray) => {
      beforeLock();
      if (query.join("").includes("FROM projects")) {
        events.push("lock Project");
        return [{ id: project.id }];
      }
      events.push("lock document");
      throw stop;
    },
    project: { findFirst: async () => ({ ...project }) },
    company: { findFirst: async () => ({ id: "company" }) },
    purchaseRequest: { findUnique: async () => request },
    procurementQuote: { findUnique: async () => quote },
    purchaseOrder: {
      aggregate: async () => ({ _max: { number: 1 } }),
      findUnique: async () => order,
      findUniqueOrThrow: async () => order,
      update: async () => write("PO"),
      updateMany: async () => write("PO"),
      create: async () => write("PO"),
    },
    purchaseOrderLine: { findMany: async () => [line] },
    subcontract: {
      aggregate: async () => ({ _max: { number: 1 } }),
      create: async () => write("subcontract"),
      update: async () => write("subcontract"),
      updateMany: async () => {
        if (!options.allowActivation) return write("subcontract");
        events.push("activate subcontract");
        subcontract.status = "ACTIVE";
        return { count: 1 };
      },
      findUniqueOrThrow: async () => subcontract,
    },
  };
  // Additional delegates fail on any unprotected write, including code before the fix.
  Object.assign(transaction.purchaseRequest, {
    aggregate: async () => ({ _max: { number: 1 } }),
    create: async () => write("PR"), updateMany: async () => write("PR"),
  });
  const db = {
    $transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction),
    project: { findFirst: async () => project, findUnique: async () => project },
    company: { findFirst: async () => ({ id: "company" }) },
    purchaseRequest: { findUnique: async () => request },
    purchaseRequestLine: { findMany: async () => [line] },
    procurementQuote: { findUnique: async () => quote, count: async () => 0 },
    purchaseOrder: { findUnique: async () => order, count: async () => 0 },
    purchaseOrderLine: { count: async () => 1 },
    subcontract: {
      findUnique: async () => subcontract,
      // The old activation/meta path wrote outside a transaction.
      update: async () => write("subcontract outside tx"),
      updateMany: async () => write("subcontract outside tx"),
    },
  };
  const noop = async () => undefined;
  const boundaries: Record<string, unknown> = {
    "@bloqer/database": { Prisma, prisma: db, PurchaseOrderStatus: { DRAFT: "DRAFT", CONFIRMED: "CONFIRMED", PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED", RECEIVED: "RECEIVED" } },
    "@bloqer/domain": domain, "@bloqer/utils": utils,
    "../types": { ServiceError },
    "../project/project-operational-guard": { assertProjectAllowsOperationalMutation: precheck, lockProjectForOperationalMutation: options.omitRecheck ? async () => undefined : lockProjectForOperationalMutation },
    "./purchase-request-scope": { assertPurchaseRequestScope: precheck },
    "../security/access": { requireProjectAccess: noop, requireProjectAccessIfPresent: noop },
    "../tenant-modules/tenant-module-enforcement": { assertProcurementTenantModule: noop, assertSubcontractsTenantModule: noop },
    "./procurement-access": { canEditPurchaseOrders: () => true, canApprovePurchaseOrders: () => true, canEditPurchaseRequests: () => true },
    "./subcontract-access": { canEditSubcontractsArea: () => true },
    "../finance/optimistic-lock": { assertOptimisticRowUpdate: (count: number) => assert.equal(count, 1) },
    "./procurement-wbs": { assertCompanyMatchesProject: noop, assertWbsLineForProject: noop, assertCostAnalysisLineForWbs: noop, lockProcurementCompanyForNumbering: noop, assertPurchaseOrderRelations: () => undefined, procurementOrderLineScopeInclude: {}, procurementOrderParentScopeInclude: {} },
    "../procurement/procurement-wbs": { assertCompanyMatchesProject: noop, assertWbsLineForProject: noop },
    "../contact/assert-contact-role": { assertContactRoleInTenant: noop },
    "./procurement-budget-baseline": { assertWbsRequiredOnLines: () => undefined },
    "../cost-control/cost-type": { coerceFreeTextGoodsCostType, resolveLineCostType, loadWbsDominantCostTypes: async () => new Map() },
    "./company-procurement-settings.service": { getCompanyProcurementSettingsForProject: async () => ({ allowAuthorizeAndCommit: true }) },
    "./purchase-order-calc.service": { calcLine, recalcPurchaseOrderTotals },
    "../finance/document-header-tax": { headerTotalsWithIibbPerception },
    "../finance/fx-amount.service": { computeDocumentFxAmounts },
    "../finance/invoice-line-money": lineMoney,
    "../finance/money-decimal": money,
    "./purchase-request-to-po.service": { assertQuoteNotFrozenByActivePo: noop },
    "./procurement-policy.service": { assertDirectPoAllowed: () => undefined },
    "./purchase-request-return-guards": { assertPurchaseRequestReturnable: () => undefined, PURCHASE_REQUEST_BLOCKING_QUOTE_STATUSES: [] },
    "../audit/audit.service": { log: async (_input: unknown, tx: unknown) => { assert.equal(tx, transaction, "Activation audit must share its transaction"); events.push("audit activation"); } },
    // These imports are unused before the Project guard/first document operation.
    "./procurement-audit": {}, "../budget/wbs-code-rules": {}, "../user/resolve-user-display-names": {},
    "./purchase-request-list-enrichment": {}, "./procurement-notifications.service": {}, "./procurement-constants": {},
    "./purchase-variance.service": {}, "../materials/material-commitment": {}, "./purchase-order-workflow.service": {},
    "./quote-validity": {}, "../company/company.service": {},
    "../company-scope": { companyScopeFilter, isCrossCompany },
  };
  function load(filename: string): ServiceModule {
    const compiled = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    const exports = {};
    runInNewContext(compiled, {
      exports,
      require: (name: string) => {
        assert.ok(Object.hasOwn(boundaries, name), `Unmocked service boundary: ${name}`);
        return boundaries[name];
      },
    });
    return exports as ServiceModule;
  }
  return { load, events, prechecks: () => prechecks, stop };
}

const cases = [
  { file: "./purchase-request.service.ts", name: "createPurchaseRequest", args: [{ projectId: "project", neededByDate: "2026-11-03", lines: [inputLine] }] },
  { file: "./purchase-request.service.ts", name: "updatePurchaseRequest", args: ["request", { lines: [inputLine] }] },
  { file: "./purchase-request.service.ts", name: "submitPurchaseRequest", args: ["request"] },
  { file: "./purchase-request.service.ts", name: "returnPurchaseRequest", args: ["request", "Synthetic return"], status: "SUBMITTED" },
  { file: "./purchase-request.service.ts", name: "cancelPurchaseRequest", args: ["request"], status: "SUBMITTED" },
  { file: "./purchase-order.service.ts", name: "createPurchaseOrder", args: [{ projectId: "project", supplierContactId: "supplier", lines: [{ ...inputLine, purchaseRequestLineId: null }] }] },
  { file: "./purchase-order.service.ts", name: "updatePurchaseOrder", args: ["order", {}] },
  { file: "./purchase-order-workflow.service.ts", name: "authorizeAndCommitPurchaseOrder", args: ["order"] },
  { file: "./purchase-order-workflow.service.ts", name: "submitPurchaseOrder", args: ["order"] },
  { file: "./purchase-order-workflow.service.ts", name: "approvePurchaseOrder", args: ["order"], status: "SUBMITTED" },
  { file: "./purchase-order-workflow.service.ts", name: "confirmPurchaseOrder", args: ["order"], status: "APPROVED" },
  { file: "./procurement-quote.service.ts", name: "createProcurementQuote", args: [{ purchaseRequestId: "request", supplierContactId: "supplier", lines: [inputLine] }], status: "SUBMITTED" },
  { file: "./procurement-quote.service.ts", name: "updateProcurementQuote", args: ["quote", "request", { lines: [inputLine] }], status: "SUBMITTED" },
  { file: "./procurement-quote.service.ts", name: "deleteProcurementQuote", args: ["quote", "request"], status: "SUBMITTED" },
  { file: "./purchase-request-to-po.service.ts", name: "createPurchaseOrderFromQuoteLines", args: ["quote", ["line"]], status: "SUBMITTED" },
  { file: "./purchase-request-to-po.service.ts", name: "createPurchaseOrdersFromAwards", args: ["request", [{ procurementQuoteId: "quote", purchaseRequestLineIds: ["line"] }]], status: "SUBMITTED" },
  { file: "../subcontracts/subcontract.service.ts", name: "createSubcontract", args: [{ projectId: "project", companyId: "company", subcontractorContactId: "subcontractor", lines: [inputLine] }] },
  { file: "../subcontracts/subcontract.service.ts", name: "updateSubcontract", args: ["subcontract", {}] },
  { file: "../subcontracts/subcontract.service.ts", name: "updateSubcontractMeta", args: ["subcontract", { notes: "Updated" }] },
  { file: "../subcontracts/subcontract.service.ts", name: "activateSubcontract", args: ["subcontract"] },
];

for (const entry of cases) {
  test(`${entry.name}: cancellation after the ACTIVE precheck prevents document locks/writes`, async () => {
    const harness = setup({ status: entry.status });
    const service = harness.load(entry.file);
    await assert.rejects(() => service[entry.name]!(...entry.args, ctx), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT" && error.message.includes("obra"));
    assert.ok(harness.prechecks() > 0, "The existing ordinary access guard must still run");
    assert.deepEqual(harness.events, ["cancellation committed", "lock Project"]);
  });
}

test("negative control without the transaction recheck reaches writes after cancellation", async () => {
  for (const name of ["createPurchaseRequest", "submitPurchaseOrder", "activateSubcontract"]) {
    const entry = cases.find((candidate) => candidate.name === name)!;
    const harness = setup({ status: entry.status, omitRecheck: true });
    const service = harness.load(entry.file);
    await assert.rejects(() => service[name]!(...entry.args, ctx), (error: unknown) => error === harness.stop);
    assert.equal(harness.events[0], "cancellation committed");
    assert.ok(harness.events[1]?.startsWith("write "), "The old ACTIVE precheck alone must not make this race test pass");
  }
});

test("quote and award orchestrators lock Project before the shared request row", async () => {
  for (const name of ["createProcurementQuote", "updateProcurementQuote", "deleteProcurementQuote", "createPurchaseOrderFromQuoteLines", "createPurchaseOrdersFromAwards"]) {
    const entry = cases.find((candidate) => candidate.name === name)!;
    const harness = setup({ status: entry.status, cancelBeforeFirstLock: false });
    const service = harness.load(entry.file);
    await assert.rejects(() => service[name]!(...entry.args, ctx), (error: unknown) => error === harness.stop);
    assert.deepEqual(harness.events, ["lock Project", "lock document"]);
  }
});

test("subcontract activation succeeds with its audit inside the same locked transaction", async () => {
  const harness = setup({ cancelBeforeFirstLock: false, allowActivation: true });
  const service = harness.load("../subcontracts/subcontract.service.ts");
  const result = await service.activateSubcontract!("subcontract", ctx) as { status: string; totalValue: string };
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.totalValue, "10.00");
  assert.deepEqual(harness.events, ["lock Project", "activate subcontract", "audit activation"]);
});
