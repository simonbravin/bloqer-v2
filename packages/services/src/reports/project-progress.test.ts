import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  Prisma,
  prisma,
  readProjectProgressEvidence,
  progressProjectWhere,
  type ProjectProgressEvidence,
} from "@bloqer/database";

import { ServiceError, type ServiceContext } from "../types";
import {
  aggregateProjectProgressCoverage,
  projectProgressCostsAt,
  projectProgressPlanPct,
  resolveProjectProgressPhysical,
} from "./project-progress-pure";
import {
  getProjectProgressReport,
  parseProjectProgressFilters,
  projectProgressCostEvents,
  projectProgressSourceAccess,
} from "./project-progress.service";

const d = (value: string | number) => new Prisma.Decimal(value);
const ctx: ServiceContext = {
  actorUserId: "actor",
  tenantId: "tenant",
  companyId: "company",
  roles: ["OWNER"],
};
const none = {
  jobsite: false,
  schedule: false,
  certifications: false,
  ar: false,
  costs: false,
  procurement: false,
  subcontracts: false,
};
const emptyEvidence = (): ProjectProgressEvidence => ({
  nodes: [],
  logs: [],
  scheduleItems: [],
  certifications: [],
  invoices: [],
  orders: [],
  subcontracts: [],
  subCerts: [],
  supplierInvoices: [],
  payments: [],
});

const restorations: (() => void)[] = [];
function replaceMethod(target: object, key: string, replacement: (...args: unknown[]) => unknown) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = replacement;
  restorations.push(() => {
    record[key] = original;
  });
}
afterEach(() => {
  for (const restore of restorations.splice(0).reverse()) restore();
});

describe("project progress physical evidence", () => {
  it("prefers incremental physical percentages without adding quantity progress", () => {
    const value = resolveProjectProgressPhysical(
      [
        { date: "2026-06-02", pct: "12", qty: "1" },
        { date: "2026-07-02", pct: "18", qty: "1" },
        { date: "2026-09-01", pct: "40", qty: "1" },
      ],
      "100",
      "2026-08-01",
    );
    assert.equal(value.pct?.toFixed(4), "30.0000");
    assert.equal(value.qty.toFixed(4), "2.0000");
  });
  it("uses quantities only if no explicit percentage was recorded, and distinguishes no data from explicit zero", () => {
    assert.equal(resolveProjectProgressPhysical([], "100", "2026-10-01").pct, null);
    assert.equal(
      resolveProjectProgressPhysical(
        [{ date: "2026-09-01", pct: null, qty: "30" }],
        "100",
        "2026-10-01",
      ).pct?.toFixed(4),
      "30.0000",
    );
    assert.equal(
      resolveProjectProgressPhysical(
        [{ date: "2026-09-01", pct: "0", qty: "0" }],
        "100",
        "2026-10-01",
      ).pct?.toFixed(4),
      "0.0000",
    );
  });
  it("does not validate legacy percentages even when they sum to less than 100", () => {
    const value = resolveProjectProgressPhysical(
      [{ date: "2026-05-31", pct: "20", qty: "0" }],
      "100",
      "2026-10-01",
    );
    assert.equal(value.pct, null);
    assert.equal(value.hasLegacy, true);
    assert.equal(value.sourcePct?.toFixed(4), "20.0000");
  });
  it("preserves out-of-scope evidence and does not clamp it into a validated measurement", () => {
    const value = resolveProjectProgressPhysical(
      [{ date: "2026-06-01", pct: "120", qty: "5" }],
      "100",
      "2026-10-01",
    );
    assert.equal(value.pct, null);
    assert.equal(value.invalid, true);
    assert.equal(value.sourcePct?.toFixed(4), "120.0000");
  });
  it("keeps the entire contractual scope in the denominator until missing measurements arrive", () => {
    const partial = aggregateProjectProgressCoverage([
      { cost: "60000", pct: d(50) },
      { cost: "40000", pct: null },
    ]);
    assert.equal(partial.observedPct, "30.0000");
    assert.equal(partial.coveragePct, "60.0000");
    assert.equal(partial.pct, null);
    const complete = aggregateProjectProgressCoverage([
      { cost: "60000", pct: d(50) },
      { cost: "40000", pct: d(0) },
    ]);
    assert.equal(complete.pct, "30.0000");
    assert.equal(complete.coveragePct, "100.0000");
  });
  it("does not turn absence of any evidence into 0% and includes zero-cost anomalies in validity", () => {
    assert.equal(aggregateProjectProgressCoverage([{ cost: "100", pct: null }]).observedPct, null);
    const value = aggregateProjectProgressCoverage([
      { cost: "100", pct: d(30) },
      { cost: "0", pct: null, hasLegacy: true },
    ]);
    assert.equal(value.observedPct, "30.0000");
    assert.equal(value.zeroCostCount, 1);
    assert.equal(value.totalCount, 2);
    assert.equal(value.pct, null);
  });
  it("does not validate a missing cost base or invent a percent for an all-zero budget", () => {
    for (const missingBase of [null, "-1"]) {
      const result = aggregateProjectProgressCoverage([
        { cost: missingBase, pct: d(40) },
        { cost: "10", pct: d(30) },
      ]);
      assert.equal(result.pct, null);
      assert.equal(result.observedPct, null);
      assert.equal(result.coveragePct, null);
      assert.equal(result.coveredCount, 2);
    }
    assert.equal(aggregateProjectProgressCoverage([{ cost: "0", pct: d(30) }]).pct, null);
  });
  it("uses the same cost weights for plan and physical", () => {
    const p = projectProgressPlanPct("2026-06-01", "2026-07-01", "2026-06-16");
    assert.equal(p?.toFixed(4), "50.0000");
    assert.equal(
      aggregateProjectProgressCoverage([
        { cost: "60", pct: p },
        { cost: "40", pct: d(25) },
      ]).pct,
      "40.0000",
    );
    assert.equal(projectProgressPlanPct("2026-07-01", "2026-06-01", "2026-06-16"), null);
    assert.equal(
      projectProgressPlanPct("2026-06-01", "2026-06-01", "2026-06-01")?.toFixed(4),
      "100.0000",
    );
  });
});

describe("project progress cost layers", () => {
  it("consumes the commitment once and keeps cash separate at every cut", () => {
    const events = [
      { wbsNodeId: "a", date: "2026-06-01", committed: d(10000) },
      { wbsNodeId: "a", date: "2026-07-01", accrued: d(4000), accruedLinked: d(4000) },
      { wbsNodeId: "a", date: "2026-08-01", paid: d(2000) },
      { wbsNodeId: "a", date: "2026-09-01", accrued: d(-1000), accruedLinked: d(-1000) },
    ];
    const beforePayment = projectProgressCostsAt(events, "2026-07-31").get("a")!;
    assert.equal(beforePayment.exposure.toFixed(2), "10000.00");
    assert.equal(beforePayment.paid.toFixed(2), "0.00");
    const final = projectProgressCostsAt(events, "2026-10-01").get("a")!;
    assert.equal(final.accrued.toFixed(2), "3000.00");
    assert.equal(final.exposure.toFixed(2), "10000.00");
    assert.equal(final.paid.toFixed(2), "2000.00");
  });
  it("reads subcontract commitment from its contract date, and excludes foreign/unallocated amounts", () => {
    const data = emptyEvidence();
    data.subcontracts.push({
      id: "sub",
      currency: "ARS",
      contractDate: new Date("2026-08-01"),
      lines: [{ id: "sl", wbsNodeId: "a", lineTotal: d(5000) }],
    });
    data.orders.push({
      id: "foreign",
      currency: "USD",
      issueDate: new Date("2026-06-01"),
      lines: [{ id: "fl", wbsNodeId: "a", lineSubtotal: d(100) }],
    });
    data.orders.push({
      id: "unallocated",
      currency: "ARS",
      issueDate: new Date("2026-06-01"),
      lines: [{ id: "ul", wbsNodeId: null, lineSubtotal: d(1000) }],
    });
    const result = projectProgressCostEvents(data, new Set(["a"]), "ARS");
    assert.equal(result.foreignCount, 1);
    assert.equal(result.unallocatedCount, 1);
    assert.equal(projectProgressCostsAt(result.events, "2026-07-31").size, 0);
    assert.equal(
      projectProgressCostsAt(result.events, "2026-08-01").get("a")?.exposure.toFixed(2),
      "5000.00",
    );
  });
  it("does not offset an over-accrued purchase order against another open order on the same WBS", () => {
    const result = projectProgressCostsAt(
      [
        { wbsNodeId: "a", date: "2026-06-01", commitmentId: "po-a", committed: d(100) },
        { wbsNodeId: "a", date: "2026-06-01", commitmentId: "po-b", committed: d(100) },
        {
          wbsNodeId: "a",
          date: "2026-07-01",
          commitmentId: "po-a",
          accrued: d(150),
          accruedLinked: d(150),
        },
      ],
      "2026-08-01",
    ).get("a")!;
    assert.equal(result.exposure.toFixed(2), "250.00");
  });
});

function installReportFixture(shared = false) {
  const budgetId = "a0000000-0000-4000-8000-000000000001";
  const data = emptyEvidence();
  data.nodes.push({
    id: "a",
    code: "1",
    name: "Estructura",
    budgetId,
    costItem: {
      unit: "m2",
      quantity: d(100),
      totalCostDirect: d(60000),
      totalSalePrice: d(100000),
      unitSalePrice: d(1000),
    },
  });
  data.nodes.push({
    id: "b",
    code: "2",
    name: "Terminación",
    budgetId,
    costItem: {
      unit: "m2",
      quantity: d(100),
      totalCostDirect: d(40000),
      totalSalePrice: d(100000),
      unitSalePrice: d(1000),
    },
  });
  data.logs.push({
    id: "log",
    logDate: new Date("2026-07-01"),
    status: "APPROVED",
    progress: [{ wbsNodeId: "a", physicalPct: d(50), quantityCompleted: d(50) }],
  });
  data.certifications.push({
    id: "cert",
    number: 1,
    status: "APPROVED",
    issueDate: new Date("2026-07-02"),
    periodEnd: new Date("2026-06-30"),
    totalAmount: d(40000),
    lines: [{ wbsNodeId: "a", currentQty: d(40), periodAmount: d(40000) }],
    salesInvoices: [{ id: "inv" }],
  });
  data.certifications.push({
    id: "future-cert",
    number: 2,
    status: "ISSUED",
    issueDate: new Date("2026-09-01"),
    periodEnd: new Date("2026-08-31"),
    totalAmount: d(10000),
    lines: [{ wbsNodeId: "a", currentQty: d(10), periodAmount: d(10000) }],
    salesInvoices: [],
  });
  data.invoices.push({
    id: "inv",
    issueDate: new Date("2026-07-02"),
    dueDate: new Date("2026-08-01"),
    currency: "ARS",
    totalAmount: d(48400),
    receivable: {
      originalAmount: d(48400),
      status: "PARTIAL",
      collections: [
        { amount: d(10000), collectionDate: new Date("2026-08-15"), currency: "ARS" },
        { amount: d(5000), collectionDate: new Date("2026-09-01"), currency: "ARS" },
      ],
      creditApplications: [
        { amount: d(4840), creditNoteSalesInvoice: { issueDate: new Date("2026-08-20") } },
      ],
    },
  });
  replaceMethod(prisma.project, "findUnique", async () => ({
    id: "project",
    tenantId: "tenant",
    companyId: shared ? null : "company",
    status: "ACTIVE",
    country: "AR",
  }));
  replaceMethod(prisma.tenant, "findUnique", async () => ({ projectAccessMode: "TENANT_WIDE" }));
  replaceMethod(prisma.project, "findFirst", async () => ({ name: "Proyecto de prueba" }));
  replaceMethod(prisma.tenantModuleSetting, "findMany", async () => []);
  replaceMethod(prisma.budget, "findMany", async () => [
    {
      id: budgetId,
      name: "Principal",
      status: "APPROVED",
      currency: "ARS",
      parentBudgetId: null,
      versionNumber: 1,
    },
  ]);
  const sources = [
    [prisma.wbsNode, data.nodes],
    [prisma.jobsiteLog, data.logs],
    [prisma.scheduleItem, data.scheduleItems],
    [prisma.certification, data.certifications],
    [prisma.salesInvoice, data.invoices],
    [prisma.purchaseOrder, data.orders],
    [prisma.subcontract, data.subcontracts],
    [prisma.subcontractCertification, data.subCerts],
    [prisma.supplierInvoice, data.supplierInvoices],
    [prisma.payment, data.payments],
  ] as const;
  for (const [model, rows] of sources) replaceMethod(model, "findMany", async () => rows);
  return data;
}

function supplierInvoiceFixture(
  overrides: Partial<ProjectProgressEvidence["supplierInvoices"][number]>,
): ProjectProgressEvidence["supplierInvoices"][number] {
  return {
    id: "supplier-invoice",
    tenantId: "tenant",
    companyId: "company",
    projectId: "project",
    status: "ISSUED",
    issueDate: new Date("2026-07-01"),
    currency: "ARS",
    documentKind: "INVOICE",
    totalAmount: d(100),
    purchaseOrderId: null,
    subcontractCertificationId: null,
    lines: [],
    purchaseOrder: null,
    subcontractCertification: null,
    referencedSupplierInvoice: null,
    ...overrides,
  };
}

describe("project progress complete service cuts", () => {
  it("does not publish partial budget totals or global budget ratios when a CostItem is missing", async () => {
    const fixture = installReportFixture();
    fixture.nodes[1]!.costItem = null;
    const report = await getProjectProgressReport(
      "project",
      { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
      ctx,
    );
    assert.equal(report.type, "REPORT");
    if (report.type !== "REPORT") return;
    assert.equal(report.financial.budgetCost, null);
    assert.equal(report.financial.budgetSale, null);
    assert.equal(report.financial.certifiedPct, null);
    assert.equal(report.financial.costAccruedPct, null);
    assert.equal(report.financial.costExposurePct, null);
    assert.equal(report.financial.costPaidPct, null);
    assert.equal(report.financial.certified, "40000.00");
    assert.equal(report.financial.collected, "10000.00");
    assert.equal(report.financial.costAccrued, "0.00");
    assert.equal(report.physical.observedPct, null);
    assert.match(report.warnings.join(" "), /Base presupuestaria incompleta/);
  });
  it("preserves opening accumulations and credits, excludes future cash, and prevents re-certifying a future active certificate", async () => {
    installReportFixture();
    const report = await getProjectProgressReport(
      "project",
      { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
      ctx,
    );
    assert.equal(report.type, "REPORT");
    if (report.type !== "REPORT") return;
    assert.equal(report.physical.observedPct, "30.0000");
    assert.equal(report.physical.coveragePct, "60.0000");
    assert.equal(report.physical.pct, null);
    assert.equal(report.opening.certified, "40000.00");
    assert.equal(report.series[0]?.certified, "40000.00");
    assert.equal(report.opening.collected, "0.00");
    assert.equal(report.financial.collected, "10000.00");
    assert.equal(report.financial.receivableBalance, "33560.00");
    assert.equal(report.financial.overdueBalance, "33560.00");
    assert.equal(report.rows[0]?.certifiedQty, "40.0000");
    assert.equal(report.rows[0]?.pendingCertifyQty, "0.0000");
    assert.equal(
      report.pending.some((p) => p.id === "approve-future-cert"),
      false,
    );
  });
  it("keeps shared projects visible and marks AR unavailable rather than returning a partial mixed-currency zero", async () => {
    const fixture = installReportFixture(true);
    fixture.invoices[0]!.currency = "USD";
    const report = await getProjectProgressReport(
      "project",
      { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
      ctx,
    );
    assert.equal(report.type, "REPORT");
    if (report.type !== "REPORT") return;
    assert.equal(report.financial.invoiced, null);
    assert.equal(report.financial.collectionPct, null);
    assert.match(report.warnings.join(" "), /otra moneda/);
  });
  it("puts documented cost overruns before routine remaining work", async () => {
    const fixture = installReportFixture();
    fixture.orders.push({
      id: "overrun",
      currency: "ARS",
      issueDate: new Date("2026-07-01"),
      lines: [{ id: "overrun-line", wbsNodeId: "a", lineSubtotal: d(70000) }],
    });
    const report = await getProjectProgressReport(
      "project",
      { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
      ctx,
    );
    assert.equal(report.type, "REPORT");
    if (report.type !== "REPORT") return;
    assert.equal(report.pending[0]?.kind, "COST_OVERRUN");
    assert.equal(report.pending[0]?.amount, "10000.00");
    assert.ok(report.notes.some((note) => note.includes("Cronograma completo actual")));
  });
  it("restores the parent's open OC commitment when a supplier credit note has no direct OC links", async () => {
    const fixture = installReportFixture();
    fixture.orders.push({
      id: "po",
      currency: "ARS",
      issueDate: new Date("2026-06-01"),
      lines: [{ id: "po-line", wbsNodeId: "a", lineSubtotal: d(100) }],
    });
    const parent = supplierInvoiceFixture({
      id: "parent",
      purchaseOrderId: "po",
      purchaseOrder: {
        lines: [{ id: "po-line", wbsNodeId: "a", lineSubtotal: d(100), lineTotal: d(121) }],
      },
      lines: [
        {
          wbsNodeId: "a",
          lineSubtotal: d(100),
          lineTotal: d(121),
          purchaseOrderLineId: "po-line",
          purchaseOrderLine: { wbsNodeId: "a" },
        },
      ],
    });
    fixture.supplierInvoices.push(
      parent,
      supplierInvoiceFixture({
        id: "note",
        documentKind: "CREDIT_NOTE",
        issueDate: new Date("2026-08-01"),
        totalAmount: d(20),
        referencedSupplierInvoice: parent,
        lines: [
          {
            wbsNodeId: "a",
            lineSubtotal: d(20),
            lineTotal: d(20),
            purchaseOrderLineId: null,
            purchaseOrderLine: null,
          },
        ],
      }),
    );
    const report = await getProjectProgressReport(
      "project",
      { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
      ctx,
    );
    assert.equal(report.type, "REPORT");
    if (report.type !== "REPORT") return;
    assert.equal(report.financial.costAccrued, "80.00");
    assert.equal(report.financial.costExposure, "100.00");
    assert.equal(report.opening.costAccrued, "100.00");
    assert.equal(report.opening.costExposure, "100.00");
    assert.deepEqual(report.sourceDates, {
      jobsite: "2026-07-01",
      certifications: "2026-07-02",
      invoices: "2026-07-02",
      collections: "2026-08-15",
      costs: "2026-08-01",
    });
  });
  it("marks exposure incomplete when a credit note cannot identify which parent commitment line to reverse", async () => {
    const fixture = installReportFixture();
    fixture.orders.push({
      id: "po",
      currency: "ARS",
      issueDate: new Date("2026-06-01"),
      lines: [
        { id: "po-a", wbsNodeId: "a", lineSubtotal: d(50) },
        { id: "po-b", wbsNodeId: "a", lineSubtotal: d(50) },
      ],
    });
    const parent = supplierInvoiceFixture({
      id: "parent",
      purchaseOrderId: "po",
      purchaseOrder: {
        lines: [
          { id: "po-a", wbsNodeId: "a", lineSubtotal: d(50), lineTotal: d(50) },
          { id: "po-b", wbsNodeId: "a", lineSubtotal: d(50), lineTotal: d(50) },
        ],
      },
      lines: [
        {
          wbsNodeId: "a",
          lineSubtotal: d(50),
          lineTotal: d(50),
          purchaseOrderLineId: "po-a",
          purchaseOrderLine: { wbsNodeId: "a" },
        },
        {
          wbsNodeId: "a",
          lineSubtotal: d(50),
          lineTotal: d(50),
          purchaseOrderLineId: "po-b",
          purchaseOrderLine: { wbsNodeId: "a" },
        },
      ],
    });
    fixture.supplierInvoices.push(
      parent,
      supplierInvoiceFixture({
        id: "note",
        documentKind: "CREDIT_NOTE",
        issueDate: new Date("2026-08-01"),
        totalAmount: d(20),
        referencedSupplierInvoice: parent,
        lines: [
          {
            wbsNodeId: "a",
            lineSubtotal: d(20),
            lineTotal: d(20),
            purchaseOrderLineId: null,
            purchaseOrderLine: null,
          },
        ],
      }),
    );
    const report = await getProjectProgressReport(
      "project",
      { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
      ctx,
    );
    assert.equal(report.type, "REPORT");
    if (report.type !== "REPORT") return;
    assert.equal(report.financial.costAccrued, "80.00");
    assert.equal(report.financial.costExposure, null);
    assert.match(report.warnings.join(" "), /vínculo inequívoco/);
  });
});

describe("project progress access, filters and scoped reads", () => {
  it("rejects users without project or budget access before any I/O", async () => {
    await assert.rejects(
      () => getProjectProgressReport("project", {}, { ...ctx, roles: [] }),
      (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN",
    );
  });
  it("does not grant AR or cost sources from project-view access", () => {
    const access = projectProgressSourceAccess({ ...ctx, roles: ["PROJECT_VIEWER"] }, () => true);
    assert.equal(access.ar, false);
    assert.equal(access.costs, false);
    assert.equal(access.jobsite, true);
    assert.deepEqual(
      projectProgressSourceAccess(ctx, () => false),
      none,
    );
  });
  it("rejects invalid dates, reversed intervals, future cuts and invalid budget IDs", () => {
    for (const raw of [
      { dateTo: "2026-02-31" },
      { dateFrom: "2026-02-02", dateTo: "2026-02-01" },
      { dateTo: "2999-01-01" },
      { budgetId: "other-budget" },
      { dateFrom: "2000-01-01", dateTo: "2026-01-01" },
    ]) {
      assert.throws(
        () => parseProjectProgressFilters(raw),
        (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION",
      );
    }
    assert.deepEqual(
      parseProjectProgressFilters({ dateFrom: "2010-01-01", dateTo: "2019-12-31" }),
      { dateFrom: "2010-01-01", dateTo: "2019-12-31" },
    );
  });
  it("rejects cross-tenant projects before loading report sources", async () => {
    replaceMethod(prisma.project, "findUnique", async () => ({
      id: "project",
      tenantId: "other",
      companyId: "company",
      status: "ACTIVE",
      country: "AR",
    }));
    await assert.rejects(
      () => getProjectProgressReport("project", {}, ctx),
      (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN",
    );
  });
  it("rejects a company mismatch even when a user can see the project", async () => {
    replaceMethod(prisma.project, "findUnique", async () => ({
      id: "project",
      tenantId: "tenant",
      companyId: "other",
      status: "ACTIVE",
      country: "AR",
    }));
    replaceMethod(prisma.tenant, "findUnique", async () => ({ projectAccessMode: "TENANT_WIDE" }));
    await assert.rejects(
      () => getProjectProgressReport("project", {}, ctx),
      (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN",
    );
  });
  it("scopes each source by tenant, project and company, and applies execution and payment cutoffs", async () => {
    const captured: Record<string, unknown>[] = [];
    for (const model of [
      prisma.wbsNode,
      prisma.jobsiteLog,
      prisma.scheduleItem,
      prisma.certification,
      prisma.salesInvoice,
      prisma.purchaseOrder,
      prisma.subcontract,
      prisma.subcontractCertification,
      prisma.supplierInvoice,
      prisma.payment,
    ]) {
      replaceMethod(model, "findMany", async (args: unknown) => {
        captured.push(args as Record<string, unknown>);
        return [];
      });
    }
    const cut = new Date("2026-08-31T23:59:59.999Z");
    await readProjectProgressEvidence(
      { tenantId: "tenant", projectId: "project", companyId: null, activeCompanyId: "company" },
      ["budget"],
      cut,
      {
        jobsite: true,
        schedule: true,
        certifications: true,
        ar: true,
        costs: true,
        procurement: true,
        subcontracts: true,
      },
    );
    assert.equal(captured.length, 10);
    assert.equal((captured[4]!.where as { companyId?: string }).companyId, "company");
    assert.equal((captured[5]!.where as { companyId?: string }).companyId, "company");
    assert.ok(
      !(
        captured[3]!.select as { salesInvoices: { where: object } }
      ).salesInvoices.where.hasOwnProperty("issueDate"),
    );
    for (const args of captured) {
      const serialized = JSON.stringify(args);
      assert.match(serialized, /tenant/);
      assert.match(serialized, /project/);
      assert.match(serialized, /company/);
    }
    assert.ok(
      captured.some((args) => JSON.stringify(args).includes('"contractDate":{"lte":"2026-08-31')),
    );
    assert.ok(
      captured.some((args) => JSON.stringify(args).includes('"paymentDate":{"lte":"2026-08-31')),
    );
    assert.deepEqual(
      progressProjectWhere({ tenantId: "tenant", projectId: "project", companyId: "company" }),
      { tenantId: "tenant", projectId: "project", project: { companyId: "company" } },
    );
  });
  it("does not query sources whose section is disabled or forbidden", async () => {
    replaceMethod(prisma.wbsNode, "findMany", async () => []);
    let forbiddenCalls = 0;
    replaceMethod(prisma.salesInvoice, "findMany", async () => {
      forbiddenCalls++;
      throw new Error("must not query AR");
    });
    const result = await readProjectProgressEvidence(
      { tenantId: "tenant", projectId: "project", companyId: "company" },
      ["budget"],
      new Date(),
      none,
    );
    assert.equal(forbiddenCalls, 0);
    assert.deepEqual(result.invoices, []);
    assert.deepEqual(result.payments, []);
  });
});
