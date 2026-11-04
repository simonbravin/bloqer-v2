import { z } from "zod";
import { Prisma, prisma, type CostCategory } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { roundToDecimals } from "@bloqer/utils";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";

import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { canViewJobsiteLogArea } from "../jobsite-log/jobsite-log-access";
import { canViewSubcontractsArea } from "../subcontracts/subcontract-access";
import { requireProjectAccess } from "../security/access";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";

import { pickPrincipalContractualBudget } from "../budget/pick-principal-budget";
import { assertBudgetCostGraph } from "../budget/budget-cost-graph";
import { compareWbsCodes } from "../budget/wbs-code-rules";
import {
  STOCK_CONSUMPTION_UNAVAILABLE_WARNING,
  STOCK_CONSUMPTION_UNVALUED_WARNING,
} from "../inventory/stock-consumption-warnings";
import { assertBudgetCurrency } from "./comparison-currency";
import { computeCostExposureByCommitment } from "./cost-exposure";
import { pctOfBudget, pctPhysicalProgressFromLibro, shouldWarnUnlinkedInvoiceAgainstPo } from "./cost-control-pct";
import { serializeMoneyDecimal, serializeQtyDecimal, serializeUnitPriceDecimal } from "../finance/money-decimal";
import {
  loadMaterialApuCommitments,
  type MaterialApuCommitmentView,
} from "../materials/material-commitment";
import { getResourceApuCommitmentsForWbs } from "../resources/project-resource-board.service";

export type ResourceApuCommitmentView = {
  costAnalysisLineId: string;
  description: string;
  unit: string;
  needQty: string;
  orderedQty: string;
  invoicedQty: string;
  shortfallQty: string;
  overCommitted: boolean;
};
import {
  buildWbsProgressSummary,
  type WbsProgressSummary,
} from "./wbs-progress-summary";
import { parseFilterDate } from "../reports/report-month";
import {
  COST_TYPE_LABELS_ES,
  COST_TYPE_ORDER,
  computeDominantCostTypeFromApuLines,
  inventoryCostType,
  resolveLineCostType,
  subcontractCostType,
} from "./cost-type";

export {
  COST_TYPE_LABELS_ES,
  COST_TYPE_ORDER,
  dominantCostTypeByWbs,
  inventoryCostType,
  resolveLineCostType,
  subcontractCostType,
} from "./cost-type";

function serializePct2(raw: string | number): string {
  return roundToDecimals(raw, 2);
}

export { canViewProjectCostControlReport };
export { computeCostExposureLayers } from "./cost-exposure";
export { buildWbsProgressSummary, type WbsProgressSummary } from "./wbs-progress-summary";
export {
  costTypeBucketHasActivity,
  parseCostCategoryFilter,
  sliceCostControlByCostType,
  sliceCostControlReportByCostType,
} from "./cost-type-slice";

export type {
  AvailableBudget,
  BudgetSelectionRequired,
  CostControlFilters,
  CostControlResult,
  CostControlRow,
  CostControlRowFlags,
  CostControlTotals,
  CostTypeBucket,
  NoApprovedBudgets,
  ProjectCostControlReport,
} from "./cost-control-types";

// ─── Filter / output types (re-exported above from cost-control-types) ────────

import type {
  CostControlFilters,
  CostControlResult,
  CostControlRow,
  CostControlRowFlags,
  CostControlTotals,
  CostTypeBucket,
} from "./cost-control-types";

// ─── Internal accumulators ────────────────────────────────────────────────────

type WbsAcc = {
  certifiedIssued: Prisma.Decimal;
  certifiedApproved: Prisma.Decimal;
  committedCost: Prisma.Decimal;
  receivedCost: Prisma.Decimal;
  accruedCost: Prisma.Decimal;
  /** Accrued that consumes a commitment (PO-linked invoice / approved subcontract cert). */
  accruedLinkedCost: Prisma.Decimal;
  paidCost: Prisma.Decimal;
  inventoryConsumedCost: Prisma.Decimal;
  qtyCommitted: Prisma.Decimal;
  qtyReceived: Prisma.Decimal;
  qtyConsumed: Prisma.Decimal;
  operationalProgressQty: Prisma.Decimal;
  operationalProgressPct: Prisma.Decimal;
  submittedProgressQty: Prisma.Decimal;
  /** Committed from PO lines only — subcontract does not imply “vincular a la OC”. */
  poCommittedCost: Prisma.Decimal;
};

/** Per-category money layers ([D-099]). */
type TypeAcc = {
  committedCost: Prisma.Decimal;
  accruedCost: Prisma.Decimal;
  accruedLinkedCost: Prisma.Decimal;
  paidCost: Prisma.Decimal;
  inventoryConsumedCost: Prisma.Decimal;
};

type CostCommitment = {
  wbsNodeId: string;
  costType: CostCategory;
  committed: Prisma.Decimal;
  accruedLinked: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);

const financialScopeSelect = { tenantId: true, companyId: true, projectId: true } as const;
const wbsScopeSelect = {
  id: true, budgetId: true,
  budget: { select: { id: true, ...financialScopeSelect } },
} as const;
const apuScopeSelect = {
  budgetId: true, category: true,
  costItem: { select: { budgetId: true, wbsNodeId: true, wbsNode: { select: wbsScopeSelect } } },
} as const;
const orderLineScopeSelect = {
  id: true, purchaseOrderId: true, wbsNodeId: true, costType: true,
  wbsNode: { select: wbsScopeSelect },
  costAnalysisLine: { select: apuScopeSelect },
} as const;
const orderScopeSelect = {
  id: true, ...financialScopeSelect,
  lines: { select: orderLineScopeSelect },
} as const;
const invoiceLineScopeSelect = {
  id: true, wbsNodeId: true, costType: true, purchaseOrderLineId: true,
  wbsNode: { select: wbsScopeSelect },
  costAnalysisLine: { select: apuScopeSelect },
  purchaseOrderLine: { select: {
    ...orderLineScopeSelect,
    purchaseOrder: { select: { id: true, ...financialScopeSelect } },
  } },
} as const;
const invoiceScopeSelect = {
  id: true, ...financialScopeSelect, currency: true, issueDate: true, status: true,
  documentKind: true, referencedSupplierInvoiceId: true,
  purchaseOrderId: true, subcontractCertificationId: true,
  lines: { select: invoiceLineScopeSelect },
  purchaseOrder: { select: orderScopeSelect },
  subcontractCertification: { select: {
    id: true, ...financialScopeSelect, subcontractId: true,
    subcontract: { select: { id: true, ...financialScopeSelect } },
    lines: { select: { lineTotal: true, subcontractLine: { select: {
      id: true, subcontractId: true, wbsNodeId: true, wbsNode: { select: wbsScopeSelect },
    } } } },
  } },
} as const;
const invoiceWithParentScopeSelect = {
  ...invoiceScopeSelect,
  referencedSupplierInvoice: { select: invoiceScopeSelect },
} as const;

type FinancialScope = { tenantId: string; companyId: string | null; projectId: string | null };
type WbsScope = Prisma.WbsNodeGetPayload<{ select: typeof wbsScopeSelect }>;
type ApuScope = Prisma.CostAnalysisLineGetPayload<{ select: typeof apuScopeSelect }>;
type InvoiceScope = Prisma.SupplierInvoiceGetPayload<{ select: typeof invoiceWithParentScopeSelect }>;
type BaseInvoiceScope = Prisma.SupplierInvoiceGetPayload<{ select: typeof invoiceScopeSelect }>;

function inconsistentCostRelation(): never {
  throw new ServiceError("CONFLICT", "Hay documentos con vínculos de empresa, obra o presupuesto inconsistentes. Revisá su trazabilidad antes de consultar los costos.");
}

function assertFinancialRelation(parent: FinancialScope | null, document: FinancialScope): void {
  if (!parent || parent.tenantId !== document.tenantId || parent.companyId !== document.companyId || parent.projectId !== document.projectId) inconsistentCostRelation();
}

function assertWbsRelation(node: WbsScope | null, document: FinancialScope, ctx: ServiceContext): void {
  if (node && (node.budget.id !== node.budgetId || node.budget.tenantId !== document.tenantId ||
      node.budget.projectId !== document.projectId || isCrossCompany(node.budget.companyId, ctx))) inconsistentCostRelation();
}

function assertApuRelation(line: ApuScope | null, wbsNodeId: string | null, document: FinancialScope, ctx: ServiceContext): void {
  if (!line) return;
  if (line.budgetId !== line.costItem.budgetId || line.budgetId !== line.costItem.wbsNode.budgetId ||
      (wbsNodeId != null && line.costItem.wbsNodeId !== wbsNodeId)) inconsistentCostRelation();
  assertWbsRelation(line.costItem.wbsNode, document, ctx);
}

function assertBaseInvoiceRelations(invoice: BaseInvoiceScope, ctx: ServiceContext): void {
  if (invoice.tenantId !== ctx.tenantId || isCrossCompany(invoice.companyId, ctx)) inconsistentCostRelation();
  if (invoice.purchaseOrderId) {
    assertFinancialRelation(invoice.purchaseOrder, invoice);
    if (invoice.purchaseOrder?.id !== invoice.purchaseOrderId) inconsistentCostRelation();
    for (const line of invoice.purchaseOrder.lines) {
      assertWbsRelation(line.wbsNode, invoice, ctx);
      assertApuRelation(line.costAnalysisLine, line.wbsNodeId, invoice, ctx);
    }
  }
  if (invoice.subcontractCertificationId) {
    const cert = invoice.subcontractCertification;
    assertFinancialRelation(cert, invoice);
    if (!cert || cert.id !== invoice.subcontractCertificationId) inconsistentCostRelation();
    assertFinancialRelation(cert.subcontract, cert);
    if (cert.subcontract.id !== cert.subcontractId) inconsistentCostRelation();
    for (const line of cert.lines) {
      if (line.subcontractLine.subcontractId !== cert.subcontractId) inconsistentCostRelation();
      assertWbsRelation(line.subcontractLine.wbsNode, cert, ctx);
    }
  }
  for (const line of invoice.lines) {
    assertWbsRelation(line.wbsNode, invoice, ctx);
    const poLine = line.purchaseOrderLine;
    if (line.purchaseOrderLineId) {
      if (!poLine || poLine.id !== line.purchaseOrderLineId) inconsistentCostRelation();
      assertFinancialRelation(poLine.purchaseOrder, invoice);
      if (invoice.purchaseOrderId && poLine.purchaseOrderId !== invoice.purchaseOrderId) inconsistentCostRelation();
      assertWbsRelation(poLine.wbsNode, invoice, ctx);
      assertApuRelation(poLine.costAnalysisLine, poLine.wbsNodeId, invoice, ctx);
    }
    assertApuRelation(line.costAnalysisLine, line.wbsNodeId ?? poLine?.wbsNodeId ?? null, invoice, ctx);
  }
}

function assertInvoiceRelations(invoice: InvoiceScope, ctx: ServiceContext): void {
  assertBaseInvoiceRelations(invoice, ctx);
  if (invoice.documentKind !== "INVOICE") {
    const parent = invoice.referencedSupplierInvoice;
    assertFinancialRelation(parent, invoice);
    if (!parent || parent.id !== invoice.referencedSupplierInvoiceId || parent.documentKind !== "INVOICE" ||
        parent.status !== "ISSUED" || parent.currency !== invoice.currency || parent.issueDate > invoice.issueDate) inconsistentCostRelation();
    assertBaseInvoiceRelations(parent, ctx);
  }
}

function assertPaymentRelations(payment: FinancialScope & {
  payableId: string; supplierInvoiceId: string;
  payable: FinancialScope & { id: string; supplierInvoiceId: string };
}, invoice: FinancialScope & { id: string }): void {
  assertFinancialRelation(payment.payable, payment);
  assertFinancialRelation(invoice, payment);
  if (payment.payable.id !== payment.payableId || payment.payable.supplierInvoiceId !== payment.supplierInvoiceId ||
      invoice.id !== payment.supplierInvoiceId) inconsistentCostRelation();
}

/** Match the routing precedence of the paid layer, independently of source dates/gates. */
function paymentWbsIds(invoice: BaseInvoiceScope): Array<string | null> {
  if (invoice.lines.some((line) => line.purchaseOrderLineId)) {
    return invoice.lines.map((line) => line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId);
  }
  if (invoice.purchaseOrder) return invoice.purchaseOrder.lines.map((line) => line.wbsNodeId);
  if (invoice.subcontractCertification) {
    return invoice.subcontractCertification.lines.map((line) => line.subcontractLine.wbsNodeId);
  }
  return invoice.lines.map((line) => line.wbsNodeId);
}

/** Read only graph IDs first: both FK directions can hide a contradictory legacy child. */
function invoiceCostTypeInput(line: {
  costType: CostCategory | null;
  costAnalysisLine: { category: CostCategory } | null;
  purchaseOrderLine?: { costType: CostCategory | null; costAnalysisLine: { category: CostCategory } | null } | null;
}): { costType: CostCategory | null; apuCategory: CostCategory | null } {
  const ownApuCategory = line.costAnalysisLine?.category ?? null;
  return {
    costType: line.costType ?? (ownApuCategory ? null : line.purchaseOrderLine?.costType ?? null),
    apuCategory: ownApuCategory ?? line.purchaseOrderLine?.costAnalysisLine?.category ?? null,
  };
}

function newAcc(): WbsAcc {
  return {
    certifiedIssued: ZERO, certifiedApproved: ZERO,
    committedCost: ZERO, receivedCost: ZERO, accruedCost: ZERO, accruedLinkedCost: ZERO,
    paidCost: ZERO, inventoryConsumedCost: ZERO,
    qtyCommitted: ZERO, qtyReceived: ZERO, qtyConsumed: ZERO,
    operationalProgressQty: ZERO, operationalProgressPct: ZERO, submittedProgressQty: ZERO,
    poCommittedCost: ZERO,
  };
}

function newTypeAcc(): TypeAcc {
  return {
    committedCost: ZERO,
    accruedCost: ZERO,
    accruedLinkedCost: ZERO,
    paidCost: ZERO,
    inventoryConsumedCost: ZERO,
  };
}

function ensureTypeAcc(
  map: Map<string, Map<CostCategory, TypeAcc>>,
  wbsId: string,
  costType: CostCategory,
): TypeAcc {
  let byType = map.get(wbsId);
  if (!byType) {
    byType = new Map();
    map.set(wbsId, byType);
  }
  let acc = byType.get(costType);
  if (!acc) {
    acc = newTypeAcc();
    byType.set(costType, acc);
  }
  return acc;
}

function addTyped(
  map: Map<string, Map<CostCategory, TypeAcc>>,
  wbsId: string,
  costType: CostCategory,
  field: keyof TypeAcc,
  amount: Prisma.Decimal,
) {
  const acc = ensureTypeAcc(map, wbsId, costType);
  acc[field] = acc[field].add(amount);
}

type UnallocAcc = {
  committedCost: Prisma.Decimal;
  receivedCost: Prisma.Decimal;
  accruedCost: Prisma.Decimal;
  paidCost: Prisma.Decimal;
  inventoryConsumedCost: Prisma.Decimal;
};

/** Row shape for subcontract certification lines in cost aggregation (matches `findMany` select). */
type SubCertLineForCostControl = {
  subcontractCertificationId: string;
  lineTotal: Prisma.Decimal;
  certification: FinancialScope & { subcontractId: string };
  subcontractLine: {
    id: string; subcontractId: string; wbsNodeId: string | null; wbsNode: WbsScope | null;
    subcontract: FinancialScope & { id: string; currency: string };
  };
};

function newUnalloc(): UnallocAcc {
  return { committedCost: ZERO, receivedCost: ZERO, accruedCost: ZERO, paidCost: ZERO, inventoryConsumedCost: ZERO };
}

function dateWhere(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: parseFilterDate(from, false) } : {}),
    ...(to ? { lte: parseFilterDate(to, true) } : {}),
  };
}

const filterDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

function assertCostControlFilters(filters: CostControlFilters): void {
  const result = z.object({ dateFrom: filterDate.optional(), dateTo: filterDate.optional() })
    .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo)
    .safeParse(filters);
  if (!result.success) throw new ServiceError("VALIDATION", "Indicá fechas válidas y un período desde/hasta ordenado.");
}

function add(map: Map<string, WbsAcc>, wbsId: string, field: keyof WbsAcc, amount: Prisma.Decimal) {
  if (!map.has(wbsId)) return; // only budget WBS nodes get rows
  const acc = map.get(wbsId)!;
  (acc[field] as Prisma.Decimal) = (acc[field] as Prisma.Decimal).add(amount);
}


// ─── Main function ────────────────────────────────────────────────────────────

export async function getProjectCostControl(
  projectId: string,
  filters: CostControlFilters,
  ctx: ServiceContext,
): Promise<CostControlResult> {
  return buildProjectCostControl(projectId, filters, ctx);
}

/** The item-only read is internal to drilldown; the public report keeps its full scope. */
async function buildProjectCostControl(
  projectId: string,
  filters: CostControlFilters,
  ctx: ServiceContext,
  itemScope?: string,
): Promise<CostControlResult> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver control de costos");
  }
  assertCostControlFilters(filters);
  await requireProjectAccess(projectId, ctx);
  // Operational documents below have companyId NOT NULL; budgets/certifications remain nullable.
  const companyWhere = ctx.companyId ? { companyId: ctx.companyId } : {};

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");

  // ─ Budget selection ─
  const validBudgets = await prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx), status: { in: ["APPROVED", "CLOSED"] } },
    select: {
      id: true,
      name: true,
      currency: true,
      status: true,
      versionNumber: true,
      parentBudgetId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // D-116: one screen shows the principal. The filter can switch to an addendum.
  const budget = filters.budgetId
    ? validBudgets.find((b) => b.id === filters.budgetId)
    : pickPrincipalContractualBudget(validBudgets);
  if (filters.budgetId && !budget) {
    throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado o no está aprobado/cerrado");
  }
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };

  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  const incCert = gate.isEnabled("CERTIFICATIONS") && can(ctx.roles, "VIEW", "CERTIFICATIONS");
  const incProc = gate.isEnabled("PROCUREMENT") && canViewProcurementProjectArea(ctx.roles);
  const incSub = gate.isEnabled("SUBCONTRACTS") && canViewSubcontractsArea(ctx.roles);
  const incAp = gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP");
  const incInv = gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY");
  const incJl = gate.isEnabled("JOBSITE_LOG") && canViewJobsiteLogArea(ctx.roles);

  if (!gate.isEnabled("CERTIFICATIONS")) {
    sectionsExcluded.push({
      module: "CERTIFICATIONS",
      section: "certified_revenue",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Certificaciones deshabilitadas en esta organización: se excluyen montos certificados.");
  }
  if (!gate.isEnabled("PROCUREMENT")) {
    sectionsExcluded.push({
      module: "PROCUREMENT",
      section: "po_committed_received",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Compras deshabilitadas: se excluyen OC y recepciones (comprometido / recibido).");
  }
  if (!gate.isEnabled("SUBCONTRACTS")) {
    sectionsExcluded.push({
      module: "SUBCONTRACTS",
      section: "subcontract_committed_certified",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Subcontratos deshabilitados: se excluyen líneas de subcontrato y certificaciones de subcontrato.");
  }
  if (!gate.isEnabled("AP")) {
    sectionsExcluded.push({
      module: "AP",
      section: "supplier_invoice_payment_layers",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Cuentas por pagar deshabilitadas: se excluyen facturas de proveedor y pagos.");
  }
  if (!gate.isEnabled("INVENTORY")) {
    sectionsExcluded.push({
      module: "INVENTORY",
      section: "stock_consumption",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Inventario deshabilitado: se excluye consumo de stock por partida EDT.");
  }
  if (!gate.isEnabled("JOBSITE_LOG")) {
    sectionsExcluded.push({
      module: "JOBSITE_LOG",
      section: "operational_progress",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Libro de obra deshabilitado: se excluyen cantidades de avance operativo.");
  }
  for (const [module, included, label] of [
    ["CERTIFICATIONS", incCert, "Certificaciones"], ["PROCUREMENT", incProc, "Compras"], ["SUBCONTRACTS", incSub, "Subcontratos"],
    ["AP", incAp, "Cuentas por pagar (AP)"], ["INVENTORY", incInv, "Inventario"], ["JOBSITE_LOG", incJl, "Libro de obra"],
  ] as const) {
    if (gate.isEnabled(module) && !included) {
      warnings.push(`Sin permiso para consultar ${label}: fuente excluida. Los totales muestran solo las fuentes disponibles, no un costo completo de la obra.`);
    }
  }

  // ─ WBS ITEM nodes with cost items ─
  await assertBudgetCostGraph(budget.id);
  const wbsNodes = await prisma.wbsNode.findMany({
    where: {
      budgetId: budget.id,
      type: "ITEM",
      ...(itemScope ? { id: itemScope } : {}),
      ...(filters.wbsSearch ? {
        OR: [
          { code: { contains: filters.wbsSearch, mode: "insensitive" } },
          { name: { contains: filters.wbsSearch, mode: "insensitive" } },
        ],
      } : {}),
    },
    include: {
      costItem: {
        include: {
          analysisLines: { where: { budgetId: budget.id }, select: { budgetId: true, category: true, totalCost: true } },
        },
      },
    },
  });
  for (const node of wbsNodes) {
    if (node.costItem && (node.costItem.budgetId !== node.budgetId ||
        node.costItem.analysisLines.some((line) => line.budgetId !== node.costItem!.budgetId))) inconsistentCostRelation();
  }
  wbsNodes.sort((a, b) => compareWbsCodes(a.code, b.code));

  const wbsNodeIds = new Set(wbsNodes.map((n) => n.id));
  const assertContributingCurrency = (wbsNodeId: string | null, currency: string) => {
    if (wbsNodeId ? wbsNodeIds.has(wbsNodeId) : !itemScope) {
      assertBudgetCurrency(budget.currency, currency);
    }
  };
  const wbsUnits = new Map(wbsNodes.map((node) => [node.id, node.costItem?.unit.trim().toLowerCase() ?? ""]));
  const incomparableQty = new Map<string, Set<"qtyCommitted" | "qtyReceived" | "qtyConsumed">>();
  const checkQtyUnit = (id: string | null, sourceUnit: string | null | undefined, field: "qtyCommitted" | "qtyReceived" | "qtyConsumed") => {
    if (!id || !wbsNodeIds.has(id)) return;
    const unit = sourceUnit?.trim().toLowerCase();
    if (!unit || unit !== wbsUnits.get(id)) {
      const fields = incomparableQty.get(id) ?? new Set();
      fields.add(field);
      incomparableQty.set(id, fields);
    }
  };
  const dominantTypes = new Map(wbsNodes.map((node) => [
    node.id, computeDominantCostTypeFromApuLines(node.costItem?.analysisLines ?? []),
  ]));
  const lineCostType = (wbsNodeId: string | null, costType: CostCategory | null, apuCategory: CostCategory | null = null) =>
    resolveLineCostType({ costType, apuCategory, wbsDominantCostType: wbsNodeId ? dominantTypes.get(wbsNodeId) : null });
  const commitments = new Map<string, CostCommitment>();
  const registerCommitment = (key: string, wbsNodeId: string | null, costType: CostCategory, amount: Prisma.Decimal) => {
    if (!wbsNodeId || !wbsNodeIds.has(wbsNodeId)) return;
    commitments.set(key, { wbsNodeId, costType, committed: amount, accruedLinked: ZERO });
  };
  const consumeCommitment = (key: string, amount: Prisma.Decimal) => {
    const commitment = commitments.get(key);
    if (!commitment) return;
    commitment.accruedLinked = commitment.accruedLinked.add(amount);
    add(accMap, commitment.wbsNodeId, "accruedLinkedCost", amount);
    addTyped(typeAccMap, commitment.wbsNodeId, commitment.costType, "accruedLinkedCost", amount);
  };
  const consumeOrderWbs = (lines: Array<{ id: string; wbsNodeId: string | null; lineSubtotal: Prisma.Decimal }>, wbsNodeId: string, amount: Prisma.Decimal) => {
    const matches = lines.filter((line) => line.wbsNodeId === wbsNodeId);
    const base = matches.reduce((sum, line) => sum.add(line.lineSubtotal), ZERO);
    if (base.isZero()) return;
    for (const line of matches) consumeCommitment(`po-line:${line.id}`, amount.mul(line.lineSubtotal).div(base));
  };

  // Pre-populate accumulator map for all budget WBS ITEM nodes
  const accMap = new Map<string, WbsAcc>(wbsNodes.map((n) => [n.id, newAcc()]));
  const typeAccMap = new Map<string, Map<CostCategory, TypeAcc>>();
  for (const n of wbsNodes) typeAccMap.set(n.id, new Map());
  const unalloc = newUnalloc();
  const addUnallocated = (field: keyof UnallocAcc, amount: Prisma.Decimal, currency: string) => {
    if (itemScope) return;
    assertBudgetCurrency(budget.currency, currency);
    unalloc[field] = unalloc[field].add(amount);
  };
  const unvaluedConsumptionWbs = new Set<string>();
  let unvaluedUnallocatedConsumption = false;
  const dateFrom = filters.dateFrom;
  const dateTo   = filters.dateTo;

  // ─ Bulk data fetch ─
  const [
    certLines,
    poLines,
    activeSubLines,
    subCertLines,
    poLinkedInvoices,
    unallocatedInvoices,
    payments,
    consumptions,
    approvedProgress,
    submittedProgress,
  ] = await Promise.all([
    incCert
      ? prisma.certificationLine.findMany({
          where: {
            certification: {
              projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx),
              budgetId: budget.id,
              status: { in: ["ISSUED", "APPROVED"] },
              ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          select: { wbsNodeId: true, periodAmount: true, certification: { select: { status: true } } },
        })
      : Promise.resolve([]),
    incProc
      ? prisma.purchaseOrderLine.findMany({
          where: {
            purchaseOrder: {
              projectId, tenantId: ctx.tenantId, ...companyWhere,
              status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
              ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          include: {
            purchaseOrder: { select: { id: true, ...financialScopeSelect, currency: true, totalAmount: true } },
            wbsNode: { select: wbsScopeSelect },
            costAnalysisLine: { select: apuScopeSelect },
            receiptLines: {
              include: { purchaseReceipt: { select: { ...financialScopeSelect, purchaseOrderId: true, status: true } } },
            },
          },
        })
      : Promise.resolve([]),
    incSub
      ? prisma.subcontractLine.findMany({
          where: { subcontract: { projectId, tenantId: ctx.tenantId, ...companyWhere, status: "ACTIVE" } },
          select: {
            id: true, wbsNodeId: true, lineTotal: true, quantity: true, unit: true,
            wbsNode: { select: wbsScopeSelect }, subcontract: { select: { ...financialScopeSelect, currency: true } },
          },
        })
      : Promise.resolve([]),
    incSub
      ? prisma.subcontractCertificationLine.findMany({
          where: {
            certification: {
              projectId, tenantId: ctx.tenantId, ...companyWhere, status: "APPROVED",
              ...(dateWhere(dateFrom, dateTo) ? { certificationDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          select: {
            subcontractCertificationId: true,
            lineTotal: true,
            certification: { select: { ...financialScopeSelect, subcontractId: true } },
            subcontractLine: { select: {
              id: true, subcontractId: true, wbsNodeId: true, wbsNode: { select: wbsScopeSelect },
              subcontract: { select: { id: true, ...financialScopeSelect, currency: true } },
            } },
          },
        })
      : Promise.resolve([] as SubCertLineForCostControl[]),
    incAp
      ? prisma.supplierInvoice.findMany({
          where: {
            projectId, tenantId: ctx.tenantId, ...companyWhere, status: "ISSUED",
            documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
            purchaseOrderId: { not: null },
            subcontractCertificationId: null,
            ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: {
            ...invoiceWithParentScopeSelect,
            id: true, subtotal: true, totalAmount: true, purchaseOrderId: true, documentKind: true,
            lines: {
              select: {
                ...invoiceLineScopeSelect,
                lineSubtotal: true,
                lineTotal: true,
                wbsNodeId: true,
                costType: true,
                purchaseOrderLineId: true,
                purchaseOrderLine: { select: {
                  ...invoiceLineScopeSelect.purchaseOrderLine.select,
                  lineSubtotal: true, lineTotal: true,
                } },
              },
            },
            purchaseOrder: {
              select: {
                ...orderScopeSelect,
                id: true,
                totalAmount: true,
                lines: { select: { ...orderLineScopeSelect, lineSubtotal: true, lineTotal: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    incAp
      ? prisma.supplierInvoice.findMany({
          where: {
            projectId, tenantId: ctx.tenantId, ...companyWhere, status: "ISSUED",
            documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
            purchaseOrderId: null, subcontractCertificationId: null,
            ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: {
            ...invoiceWithParentScopeSelect,
            tenantId: true, companyId: true, projectId: true, currency: true, issueDate: true,
            subtotal: true, totalAmount: true, documentKind: true,
            lines: { select: {
              ...invoiceLineScopeSelect,
              wbsNodeId: true, lineSubtotal: true, lineTotal: true, costType: true,
              purchaseOrderLineId: true,
            } },
          },
        })
      : Promise.resolve([]),
    incAp
      ? prisma.payment.findMany({
          where: {
            projectId, tenantId: ctx.tenantId, ...companyWhere, status: "CONFIRMED",
            ...(dateWhere(dateFrom, dateTo) ? { paymentDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: {
            ...financialScopeSelect,
            payableId: true, supplierInvoiceId: true,
            amount: true, currency: true,
            payable: {
              select: {
                id: true, ...financialScopeSelect, supplierInvoiceId: true,
                supplierInvoice: {
                  select: {
                    ...invoiceWithParentScopeSelect,
                    id: true, totalAmount: true,
                    purchaseOrderId: true, subcontractCertificationId: true,
                    purchaseOrder: {
                      select: {
                        ...orderScopeSelect,
                        totalAmount: true,
                        lines: { select: { ...orderLineScopeSelect, lineTotal: true } },
                      },
                    },
                    lines: {
                      select: {
                        ...invoiceLineScopeSelect,
                        wbsNodeId: true,
                        lineTotal: true,
                        costType: true,
                        purchaseOrderLineId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    incInv
      ? prisma.stockMovement.findMany({
          where: {
            projectId, tenantId: ctx.tenantId, ...companyWhere,
            status: "CONFIRMED", type: "OUT", sourceType: "CONSUMPTION",
            ...(itemScope ? { wbsNodeId: itemScope } : {}),
            ...(dateWhere(dateFrom, dateTo) ? { movementDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: { wbsNodeId: true, quantity: true, product: { select: { unit: true } } },
        })
      : Promise.resolve([]),
    incJl
      ? prisma.jobsiteLogProgress.findMany({
          where: {
            jobsiteLog: {
              projectId, tenantId: ctx.tenantId, ...companyWhere, status: "APPROVED",
              ...(dateWhere(dateFrom, dateTo) ? { logDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          select: { wbsNodeId: true, quantityCompleted: true, physicalPct: true },
        })
      : Promise.resolve([]),
    incJl
      ? prisma.jobsiteLogProgress.findMany({
          where: {
            jobsiteLog: {
              projectId, tenantId: ctx.tenantId, ...companyWhere, status: "SUBMITTED",
              ...(dateWhere(dateFrom, dateTo) ? { logDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          select: { wbsNodeId: true, quantityCompleted: true },
        })
      : Promise.resolve([]),
  ]);

  // Validate every joined parent before its WBS, category, weights or amount is used.
  for (const line of poLines) {
    assertWbsRelation(line.wbsNode, line.purchaseOrder, ctx);
    assertApuRelation(line.costAnalysisLine, line.wbsNodeId, line.purchaseOrder, ctx);
    for (const receiptLine of line.receiptLines) {
      assertFinancialRelation(receiptLine.purchaseReceipt, line.purchaseOrder);
      if (receiptLine.purchaseReceipt.purchaseOrderId !== line.purchaseOrderId) inconsistentCostRelation();
    }
  }
  for (const line of activeSubLines) assertWbsRelation(line.wbsNode, line.subcontract, ctx);
  for (const line of subCertLines) {
    assertFinancialRelation(line.subcontractLine.subcontract, line.certification);
    if (line.subcontractLine.subcontractId !== line.certification.subcontractId) inconsistentCostRelation();
    assertWbsRelation(line.subcontractLine.wbsNode, line.certification, ctx);
  }
  for (const invoice of [...poLinkedInvoices, ...unallocatedInvoices]) assertInvoiceRelations(invoice, ctx);
  for (const payment of payments) {
    assertPaymentRelations(payment, payment.payable.supplierInvoice);
    assertInvoiceRelations(payment.payable.supplierInvoice, ctx);
  }

  // ─ Aggregate ─

  // A. Certified revenue
  for (const cl of certLines) {
    const status = cl.certification.status;
    const field  = status === "ISSUED" ? "certifiedIssued" : "certifiedApproved";
    if (wbsNodeIds.has(cl.wbsNodeId)) {
      add(accMap, cl.wbsNodeId, field, cl.periodAmount);
    }
    // Lines from this budget's certs are already WBS-scoped; no unallocated needed here.
  }

  // B. Committed + received from PO lines
  for (const pol of poLines) {
    const wbsId = pol.wbsNodeId;
    const inBudget = wbsId && wbsNodeIds.has(wbsId);
    assertContributingCurrency(wbsId, pol.purchaseOrder.currency);
    const costType = lineCostType(wbsId, pol.costType, pol.costAnalysisLine?.category ?? null);
    registerCommitment(`po-line:${pol.id}`, wbsId, costType, pol.lineSubtotal);
    if (!pol.quantity.isZero()) checkQtyUnit(wbsId, pol.unit, "qtyCommitted");
    // Committed
    if (inBudget) {
      add(accMap, wbsId!, "committedCost", new Prisma.Decimal(pol.lineSubtotal));
      add(accMap, wbsId!, "poCommittedCost", new Prisma.Decimal(pol.lineSubtotal));
      add(accMap, wbsId!, "qtyCommitted", new Prisma.Decimal(pol.quantity));
      addTyped(typeAccMap, wbsId!, costType, "committedCost", new Prisma.Decimal(pol.lineSubtotal));
    } else if (!wbsId) {
      addUnallocated("committedCost", pol.lineSubtotal, pol.purchaseOrder.currency);
    }
    // Received (via CONFIRMED receipts) — same net basis as committed ([D-095]/[D-098])
    const unitCostNet = pol.quantity.isZero()
      ? ZERO
      : new Prisma.Decimal(pol.lineSubtotal).div(pol.quantity);
    for (const rl of pol.receiptLines) {
      if (rl.purchaseReceipt.status !== "CONFIRMED") continue;
      if (!rl.quantityReceived.isZero()) checkQtyUnit(wbsId, pol.unit, "qtyReceived");
      const cost = unitCostNet.mul(rl.quantityReceived);
      if (inBudget) {
        add(accMap, wbsId!, "receivedCost", cost);
        add(accMap, wbsId!, "qtyReceived", new Prisma.Decimal(rl.quantityReceived));
      } else if (!wbsId) {
        addUnallocated("receivedCost", cost, pol.purchaseOrder.currency);
      }
    }
  }

  // C. Committed from ACTIVE subcontract lines
  for (const sl of activeSubLines) {
    const wbsId = sl.wbsNodeId;
    assertContributingCurrency(wbsId, sl.subcontract.currency);
    const subType = subcontractCostType();
    registerCommitment(`sub-line:${sl.id}`, wbsId, subType, sl.lineTotal);
    if (!sl.quantity.isZero()) checkQtyUnit(wbsId, sl.unit, "qtyCommitted");
    if (wbsId && wbsNodeIds.has(wbsId)) {
      add(accMap, wbsId, "committedCost", new Prisma.Decimal(sl.lineTotal));
      add(accMap, wbsId, "qtyCommitted", new Prisma.Decimal(sl.quantity));
      addTyped(typeAccMap, wbsId, subType, "committedCost", new Prisma.Decimal(sl.lineTotal));
    } else if (!wbsId) {
      addUnallocated("committedCost", sl.lineTotal, sl.subcontract.currency);
    }
  }

  // D. Accrued from APPROVED sub cert lines (linked to subcontract commitment)
  for (const scl of subCertLines) {
    const wbsId = scl.subcontractLine.wbsNodeId;
    assertContributingCurrency(wbsId, scl.subcontractLine.subcontract.currency);
    const amount = new Prisma.Decimal(scl.lineTotal);
    const subType = subcontractCostType();
    if (wbsId && wbsNodeIds.has(wbsId)) {
      add(accMap, wbsId, "accruedCost", amount);
      consumeCommitment(`sub-line:${scl.subcontractLine.id}`, amount);
      addTyped(typeAccMap, wbsId, subType, "accruedCost", amount);
    } else if (!wbsId) {
      addUnallocated("accruedCost", amount, scl.subcontractLine.subcontract.currency);
    }
  }

  // E. Accrued from ISSUED SupplierInvoices (PO-linked) — prefer line FK ([D-066]), else PO weights.
  // Net basis (lineSubtotal) so accruedLinked consumes open_committed consistently with D-095.
  // [D-115] CREDIT_NOTE reduces accrued (signed negative).
  for (const inv of poLinkedInvoices) {
    if (!inv.purchaseOrder) continue;
    const signed = (amount: Prisma.Decimal) =>
      inv.documentKind === "CREDIT_NOTE" ? amount.negated() : amount;
    const linkedLines = inv.lines.filter((l) => l.purchaseOrderLineId);
    if (linkedLines.length > 0) {
      for (const line of linkedLines) {
        const wbsId = line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId;
        assertContributingCurrency(wbsId, inv.currency);
        const amount = signed(new Prisma.Decimal(line.lineSubtotal));
        const typeInput = invoiceCostTypeInput(line);
        const spentType = lineCostType(wbsId, typeInput.costType, typeInput.apuCategory);
        if (wbsId && wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "accruedCost", amount);
          // Only FK-mapped lines consume open_committed on that partida ([D-065]).
          consumeCommitment(`po-line:${line.purchaseOrderLineId!}`, amount);
          addTyped(typeAccMap, wbsId, spentType, "accruedCost", amount);
        } else if (!wbsId) {
          addUnallocated("accruedCost", amount, inv.currency);
        }
      }
      // Orphan lines on a PO invoice: accrue by line WBS. If that WBS is on the
      // same OC commitment, also count as linked so open_committed shrinks ([D-065]).
      const orphanLines = inv.lines.filter((l) => !l.purchaseOrderLineId);
      for (const line of orphanLines) {
        const amount = signed(new Prisma.Decimal(line.lineSubtotal));
        const wbsId = line.wbsNodeId;
        assertContributingCurrency(wbsId, inv.currency);
        const typeInput = invoiceCostTypeInput(line);
        const spentType = lineCostType(wbsId, typeInput.costType, typeInput.apuCategory);
        if (wbsId && wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "accruedCost", amount);
          addTyped(typeAccMap, wbsId, spentType, "accruedCost", amount);
          consumeOrderWbs(inv.purchaseOrder.lines, wbsId, amount);
        } else if (!wbsId) {
          addUnallocated("accruedCost", amount, inv.currency);
        }
      }
      continue;
    }

    const poLines2 = inv.purchaseOrder.lines;
    if (poLines2.length > 0 && poLines2.every((line) => line.wbsNodeId && !wbsNodeIds.has(line.wbsNodeId))) continue;
    const poTotal = poLines2.reduce((s, l) => s.add(l.lineSubtotal), ZERO);
    const invNet = signed(
      inv.lines.length > 0
        ? inv.lines.reduce((s, l) => s.add(l.lineSubtotal), ZERO)
        : new Prisma.Decimal(inv.subtotal),
    );
    if (poTotal.isZero()) {
      addUnallocated("accruedCost", invNet, inv.currency);
      continue;
    }
    for (const pol of poLines2) {
      const share = new Prisma.Decimal(pol.lineSubtotal).div(poTotal).mul(invNet);
      const wbsId = pol.wbsNodeId;
      assertContributingCurrency(wbsId, inv.currency);
      const costType = lineCostType(wbsId, pol.costType, pol.costAnalysisLine?.category ?? null);
      if (wbsId && wbsNodeIds.has(wbsId)) {
        add(accMap, wbsId, "accruedCost", share);
        consumeCommitment(`po-line:${pol.id}`, share);
        addTyped(typeAccMap, wbsId, costType, "accruedCost", share);
      } else if (!wbsId) {
        addUnallocated("accruedCost", share, inv.currency);
      }
    }
  }

  // F. Direct project invoices (no PO, no sub cert) — prefer line WBS ([D-055]); NOT linked to commitment
  // [D-115] CREDIT_NOTE reduces accrued.
  for (const inv of unallocatedInvoices) {
    if (itemScope && !inv.lines.some((line) => line.wbsNodeId === itemScope)) continue;
    if (inv.lines.length === 0 || inv.lines.some((line) => !line.wbsNodeId || wbsNodeIds.has(line.wbsNodeId))) {
      assertBudgetCurrency(budget.currency, inv.currency);
    }
    const signed = (amount: Prisma.Decimal) =>
      inv.documentKind === "CREDIT_NOTE" ? amount.negated() : amount;
    const noteCommitments = new Map<string, Set<string>>();
    const parentWbs = new Set<string>();
    if (inv.documentKind !== "INVOICE" && inv.lines.some((line) => !line.wbsNodeId || wbsNodeIds.has(line.wbsNodeId))) {
      const parent = inv.referencedSupplierInvoice;
      if (!parent || parent.tenantId !== inv.tenantId || parent.companyId !== inv.companyId ||
          parent.projectId !== inv.projectId || parent.currency !== inv.currency ||
          parent.status !== "ISSUED" || parent.issueDate > inv.issueDate) {
        throw new ServiceError("CONFLICT", "Una nota de crédito/débito carece de una factura de origen comparable; no se puede calcular la exposición.");
      }
      const addParent = (id: string | null, key: string | null) => {
        if (!id) return;
        parentWbs.add(id);
        if (!key) return;
        const keys = noteCommitments.get(id) ?? new Set<string>();
        keys.add(key);
        noteCommitments.set(id, keys);
      };
      if (parent.lines.some((line) => line.purchaseOrderLineId)) {
        for (const line of parent.lines) {
          const wbs = line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId;
          if (line.purchaseOrderLineId) addParent(wbs, `po-line:${line.purchaseOrderLineId}`);
          else {
            const matches = parent.purchaseOrder?.lines.filter((row) => row.wbsNodeId === wbs) ?? [];
            if (matches.length) for (const row of matches) addParent(wbs, `po-line:${row.id}`);
            else addParent(wbs, null);
          }
        }
      } else if (parent.purchaseOrder) {
        for (const line of parent.purchaseOrder.lines) addParent(line.wbsNodeId, `po-line:${line.id}`);
      } else if (parent.subcontractCertification) {
        for (const line of parent.subcontractCertification.lines) addParent(line.subcontractLine.wbsNodeId, `sub-line:${line.subcontractLine.id}`);
      } else {
        for (const line of parent.lines) addParent(line.wbsNodeId, null);
      }
    }
    const linesWithWbs = inv.lines.filter((l) => l.wbsNodeId);
    if (linesWithWbs.length > 0) {
      for (const line of linesWithWbs) {
        const wbsId = line.wbsNodeId!;
        const amount = signed(new Prisma.Decimal(line.lineSubtotal));
        if (wbsNodeIds.has(wbsId)) {
          if (inv.documentKind !== "INVOICE") {
            const keys = noteCommitments.get(wbsId);
            if (!parentWbs.has(wbsId) || (keys && keys.size > 1)) {
              throw new ServiceError("CONFLICT", "Una nota de crédito/débito no identifica un único compromiso para su partida; revisá su trazabilidad.");
            }
            if (keys?.size === 1) consumeCommitment([...keys][0]!, amount);
          } else if (line.purchaseOrderLineId) {
            consumeCommitment(`po-line:${line.purchaseOrderLineId}`, amount);
          }
          add(accMap, wbsId, "accruedCost", amount);
          const typeInput = invoiceCostTypeInput(line);
          addTyped(
            typeAccMap,
            wbsId,
            lineCostType(wbsId, typeInput.costType, typeInput.apuCategory),
            "accruedCost",
            amount,
          );
        }
      }
      const linesWithoutWbs = inv.lines.filter((l) => !l.wbsNodeId);
      for (const line of linesWithoutWbs) {
        addUnallocated("accruedCost", signed(new Prisma.Decimal(line.lineSubtotal)), inv.currency);
      }
    } else {
      // D-095: unassigned invoices retain their net base too, never gross IVA.
      addUnallocated("accruedCost", signed(new Prisma.Decimal(inv.subtotal)), inv.currency);
    }
  }
  const unallocWithoutLineWbs = itemScope ? [] : unallocatedInvoices.filter(
    (inv) => inv.lines.every((l) => !l.wbsNodeId),
  );
  if (unallocWithoutLineWbs.length > 0) {
    warnings.push(`${unallocWithoutLineWbs.length} factura(s) de proveedor sin OC ni EDT en líneas — costo no asignado a partida EDT.`);
  }

  // G. Paid cost (CONFIRMED payments) — prefer invoice line → PO line WBS when present
  for (const pmt of payments) {
    const inv = pmt.payable?.supplierInvoice;
    if (!inv) { addUnallocated("paidCost", pmt.amount, pmt.currency); continue; }
    const targets = paymentWbsIds(inv);
    if (itemScope && !targets.includes(itemScope)) continue;
    // Explicit assignments outside this budget/text scope must not become unallocated,
    // including documents with zero allocation weights or parents outside the period.
    if (targets.length > 0 && targets.every((id) => id !== null && !wbsNodeIds.has(id))) continue;

    const invLinesWithPo = inv.lines?.filter((l) => l.purchaseOrderLineId) ?? [];
    if (invLinesWithPo.length > 0) {
      const lineTotal = inv.lines.reduce((s, l) => s.add(l.lineTotal), ZERO);
      if (lineTotal.isZero()) { addUnallocated("paidCost", pmt.amount, pmt.currency); continue; }
      for (const line of inv.lines) {
        const share = new Prisma.Decimal(line.lineTotal).div(lineTotal).mul(pmt.amount);
        const wbsId = line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId;
        assertContributingCurrency(wbsId, pmt.currency);
        const typeInput = invoiceCostTypeInput(line);
        const costType = lineCostType(wbsId, typeInput.costType, typeInput.apuCategory);
        if (wbsId && wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "paidCost", share);
          addTyped(typeAccMap, wbsId, costType, "paidCost", share);
        } else if (!wbsId) addUnallocated("paidCost", share, pmt.currency);
      }
    } else if (inv.purchaseOrderId && inv.purchaseOrder) {
      const poLines2 = inv.purchaseOrder.lines;
      const poTotal  = poLines2.reduce((s, l) => s.add(l.lineTotal), ZERO);
      if (poTotal.isZero()) { addUnallocated("paidCost", pmt.amount, pmt.currency); continue; }
      for (const pol of poLines2) {
        const share = new Prisma.Decimal(pol.lineTotal).div(poTotal).mul(pmt.amount);
        const wbsId = pol.wbsNodeId;
        assertContributingCurrency(wbsId, pmt.currency);
        const costType = lineCostType(wbsId, pol.costType, pol.costAnalysisLine?.category ?? null);
        if (wbsId && wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "paidCost", share);
          addTyped(typeAccMap, wbsId, costType, "paidCost", share);
        } else if (!wbsId) addUnallocated("paidCost", share, pmt.currency);
      }
    } else if (inv.subcontractCertificationId) {
      // AP payment routing uses its own parent, not the period/gate-filtered accrued list.
      // This metadata allocates authorized paid amounts; it does not accrue subcontracts.
      const lines = inv.subcontractCertification!.lines;
      const total = lines.reduce((sum, line) => sum.add(line.lineTotal), ZERO);
      if (total.isZero()) { addUnallocated("paidCost", pmt.amount, pmt.currency); continue; }
      const subType = subcontractCostType();
      for (const line of lines) {
        const wbsId = line.subcontractLine.wbsNodeId;
        const share = new Prisma.Decimal(line.lineTotal).div(total).mul(pmt.amount);
        assertContributingCurrency(wbsId, pmt.currency);
        if (wbsId && wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "paidCost", share);
          addTyped(typeAccMap, wbsId, subType, "paidCost", share);
        } else if (!wbsId) addUnallocated("paidCost", share, pmt.currency);
      }
    } else if (inv.lines?.some((l) => l.wbsNodeId)) {
      const lineTotal = inv.lines.reduce((s, l) => s.add(l.lineTotal), ZERO);
      if (lineTotal.isZero()) { addUnallocated("paidCost", pmt.amount, pmt.currency); continue; }
      for (const line of inv.lines) {
        const share = new Prisma.Decimal(line.lineTotal).div(lineTotal).mul(pmt.amount);
        assertContributingCurrency(line.wbsNodeId, pmt.currency);
        const typeInput = invoiceCostTypeInput(line);
        const costType = lineCostType(line.wbsNodeId, typeInput.costType, typeInput.apuCategory);
        if (line.wbsNodeId && wbsNodeIds.has(line.wbsNodeId)) {
          add(accMap, line.wbsNodeId, "paidCost", share);
          addTyped(typeAccMap, line.wbsNodeId, costType, "paidCost", share);
        } else if (!line.wbsNodeId) addUnallocated("paidCost", share, pmt.currency);
      }
    } else {
      addUnallocated("paidCost", pmt.amount, pmt.currency);
    }
  }

  // H. Inventory consumption
  for (const sm of consumptions) {
    const wbsId = sm.wbsNodeId;
    if (!sm.quantity.isZero()) checkQtyUnit(wbsId, sm.product.unit, "qtyConsumed");
    if (wbsId && wbsNodeIds.has(wbsId)) {
      // D-124: current consumptions have no currency or valuation-layer lineage.
      // A stored price alone must not become a comparable cost or a zero saving.
      unvaluedConsumptionWbs.add(wbsId);
      add(accMap, wbsId, "qtyConsumed", new Prisma.Decimal(sm.quantity));
    } else if (!wbsId && !itemScope) unvaluedUnallocatedConsumption = true;
  }
  if (!incInv) warnings.push(STOCK_CONSUMPTION_UNAVAILABLE_WARNING);
  else if (unvaluedConsumptionWbs.size > 0 || unvaluedUnallocatedConsumption) {
    warnings.push(STOCK_CONSUMPTION_UNVALUED_WARNING);
  }

  // I. Operational progress (APPROVED logs)
  const wbsWithPhysicalPct = new Set<string>();
  for (const p of approvedProgress) {
    if (!wbsNodeIds.has(p.wbsNodeId)) continue;
    add(accMap, p.wbsNodeId, "operationalProgressQty", p.quantityCompleted);
    if (p.physicalPct != null) {
      add(accMap, p.wbsNodeId, "operationalProgressPct", p.physicalPct);
      wbsWithPhysicalPct.add(p.wbsNodeId);
    }
  }

  // J. Submitted progress (informational)
  for (const p of submittedProgress) {
    if (wbsNodeIds.has(p.wbsNodeId)) add(accMap, p.wbsNodeId, "submittedProgressQty", p.quantityCompleted);
  }

  // ─ Build rows ─
  const commitmentsByWbs = new Map<string, CostCommitment[]>();
  for (const entry of commitments.values()) {
    const rows = commitmentsByWbs.get(entry.wbsNodeId) ?? [];
    rows.push(entry);
    commitmentsByWbs.set(entry.wbsNodeId, rows);
  }
  const rows: CostControlRow[] = [];
  const totAcc = newAcc();
  let totBudgetCost = ZERO, totBudgetSale = ZERO;
  let totExpected = ZERO, totRemaining = ZERO, totVariance = ZERO, totMargin = ZERO;
  let totOpenCommitted = ZERO;

  for (const node of wbsNodes) {
    const acc    = accMap.get(node.id)!;
    const consumptionUnknown = !incInv || unvaluedConsumptionWbs.has(node.id);
    const ci     = node.costItem;
    const bCost  = ci ? new Prisma.Decimal(ci.totalCostDirect) : ZERO;
    const bSale  = ci ? new Prisma.Decimal(ci.totalSalePrice)  : ZERO;
    const bQty   = ci ? new Prisma.Decimal(ci.quantity)        : ZERO;
    const bUCost = ci ? new Prisma.Decimal(ci.unitCostDirect)  : ZERO;
    const bUSale = ci ? new Prisma.Decimal(ci.unitSalePrice)   : ZERO;

    const committed = acc.committedCost;
    const received  = acc.receivedCost;
    const accrued   = acc.accruedCost;

    // [BR-COS-002] / [D-065]: exposure = accrued + open_committed (not max / not committed+accrued)
    const rowCommitments = commitmentsByWbs.get(node.id) ?? [];
    const { openCommitted, expectedCostExposure: expected } = computeCostExposureByCommitment({
      accrued,
      commitments: rowCommitments,
    });
    const remaining = bCost.sub(expected);
    const variance  = remaining; // positive = saving
    const margin    = bSale.sub(expected);

    const flags: CostControlRowFlags = {
      overBudget:    expected.gt(bCost) && !bCost.isZero(),
      overCertified: acc.certifiedApproved.gt(bSale) && !bSale.isZero(),
      missingBudget: ci === null,
    };

    // Budget by APU category ([D-047]/[D-099]): totalCost is per CostItem unit.
    const budgetByType = new Map<CostCategory, Prisma.Decimal>();
    if (ci?.analysisLines) {
      for (const al of ci.analysisLines) {
        const contrib = new Prisma.Decimal(al.totalCost).mul(bQty);
        budgetByType.set(al.category, (budgetByType.get(al.category) ?? ZERO).add(contrib));
      }
    }
    const typeAccs = typeAccMap.get(node.id) ?? new Map();
    const byCostType: CostTypeBucket[] = [];
    for (const cat of COST_TYPE_ORDER) {
      const tAcc = typeAccs.get(cat) ?? newTypeAcc();
      const bucketConsumptionUnknown = cat === inventoryCostType() && consumptionUnknown;
      const tBudget = budgetByType.get(cat) ?? ZERO;
      const { openCommitted: tOpen, expectedCostExposure: tExpected } = computeCostExposureByCommitment({
        accrued: tAcc.accruedCost,
        commitments: rowCommitments.filter((entry) => entry.costType === cat),
      });
      const hasSignal =
        bucketConsumptionUnknown ||
        !tBudget.isZero() ||
        !tAcc.committedCost.isZero() ||
        !tAcc.accruedCost.isZero() ||
        !tAcc.paidCost.isZero() ||
        !tAcc.inventoryConsumedCost.isZero() ||
        !tOpen.isZero();
      if (!hasSignal) continue;
      byCostType.push({
        costType: cat,
        label: COST_TYPE_LABELS_ES[cat],
        budgetTotalCost: serializeMoneyDecimal(tBudget),
        committedCost: serializeMoneyDecimal(tAcc.committedCost),
        accruedCost: serializeMoneyDecimal(tAcc.accruedCost),
        paidCost: serializeMoneyDecimal(tAcc.paidCost),
        inventoryConsumedCost: bucketConsumptionUnknown ? null : serializeMoneyDecimal(tAcc.inventoryConsumedCost),
        openCommittedCost: serializeMoneyDecimal(tOpen),
        expectedCostExposure: serializeMoneyDecimal(tExpected),
        costVariance: serializeMoneyDecimal(tBudget.sub(tExpected)),
      });
    }

    rows.push({
      wbsNodeId: node.id,
      wbsCode:   node.code,
      wbsName:   node.name,
      unit:      ci?.unit ?? "",
      budgetQty:       serializeQtyDecimal(bQty),
      budgetUnitCost:  serializeUnitPriceDecimal(bUCost),
      budgetTotalCost: serializeMoneyDecimal(bCost),
      budgetUnitSale:  serializeUnitPriceDecimal(bUSale),
      budgetTotalSale: serializeMoneyDecimal(bSale),
      certifiedIssued:   serializeMoneyDecimal(acc.certifiedIssued),
      certifiedApproved: serializeMoneyDecimal(acc.certifiedApproved),
      committedCost:         serializeMoneyDecimal(committed),
      receivedCost:          serializeMoneyDecimal(received),
      accruedCost:           serializeMoneyDecimal(accrued),
      paidCost:              serializeMoneyDecimal(acc.paidCost),
      inventoryConsumedCost: consumptionUnknown ? null : serializeMoneyDecimal(acc.inventoryConsumedCost),
      qtyCommitted: incomparableQty.get(node.id)?.has("qtyCommitted") ? null : serializeQtyDecimal(acc.qtyCommitted),
      qtyReceived:  incomparableQty.get(node.id)?.has("qtyReceived") ? null : serializeQtyDecimal(acc.qtyReceived),
      qtyConsumed:  incomparableQty.get(node.id)?.has("qtyConsumed") ? null : serializeQtyDecimal(acc.qtyConsumed),
      operationalProgressQty: serializeQtyDecimal(acc.operationalProgressQty),
      submittedProgressQty:   serializeQtyDecimal(acc.submittedProgressQty),
      openCommittedCost:    serializeMoneyDecimal(openCommitted),
      expectedCostExposure: serializeMoneyDecimal(expected),
      remainingBudgetCost:  serializeMoneyDecimal(remaining),
      costVariance:         serializeMoneyDecimal(variance),
      projectedMargin:      serializeMoneyDecimal(margin),
      pctPurchased:        pctOfBudget(committed, bCost),
      pctReceived:         pctOfBudget(received, bCost),
      pctPhysicalProgress: pctPhysicalProgressFromLibro({
        hasPhysicalPct: wbsWithPhysicalPct.has(node.id),
        physicalPctAcum: acc.operationalProgressPct,
        operationalQty: acc.operationalProgressQty,
        budgetQty: bQty,
      }),
      pctEconomic:         pctOfBudget(accrued, bCost),
      pctExposure:         pctOfBudget(expected, bCost),
      flags,
      byCostType,
    });

    // Accumulate totals
    totBudgetCost = totBudgetCost.add(bCost);
    totBudgetSale = totBudgetSale.add(bSale);
    totExpected   = totExpected.add(expected);
    totRemaining  = totRemaining.add(remaining);
    totVariance   = totVariance.add(variance);
    totMargin     = totMargin.add(margin);
    totOpenCommitted = totOpenCommitted.add(openCommitted);
    for (const k of Object.keys(acc) as (keyof WbsAcc)[]) {
      (totAcc[k] as Prisma.Decimal) = (totAcc[k] as Prisma.Decimal).add(acc[k] as Prisma.Decimal);
    }

    const unlinkedAccrued = acc.accruedCost.sub(acc.accruedLinkedCost);
    if (shouldWarnUnlinkedInvoiceAgainstPo(acc.poCommittedCost, unlinkedAccrued)) {
      warnings.push(
        `Partida ${node.code}: hay facturas emitidas sin vincular a la OC (${serializeMoneyDecimal(unlinkedAccrued)}). La exposición suma ese devengado más el comprometido abierto.`,
      );
    }
  }

  const totals: CostControlTotals = {
    budgetTotalCost:      serializeMoneyDecimal(totBudgetCost),
    budgetTotalSale:      serializeMoneyDecimal(totBudgetSale),
    certifiedIssued:      serializeMoneyDecimal(totAcc.certifiedIssued),
    certifiedApproved:    serializeMoneyDecimal(totAcc.certifiedApproved),
    committedCost:        serializeMoneyDecimal(totAcc.committedCost),
    receivedCost:         serializeMoneyDecimal(totAcc.receivedCost),
    accruedCost:          serializeMoneyDecimal(totAcc.accruedCost),
    paidCost:             serializeMoneyDecimal(totAcc.paidCost),
    inventoryConsumedCost: !incInv || rows.some((row) => row.inventoryConsumedCost === null)
      ? null : serializeMoneyDecimal(totAcc.inventoryConsumedCost),
    operationalProgressQty: serializeQtyDecimal(totAcc.operationalProgressQty),
    openCommittedCost:    serializeMoneyDecimal(totOpenCommitted),
    expectedCostExposure: serializeMoneyDecimal(totExpected),
    remainingBudgetCost:  serializeMoneyDecimal(totRemaining),
    costVariance:         serializeMoneyDecimal(totVariance),
    projectedMargin:      serializeMoneyDecimal(totMargin),
  };

  return {
    type: "REPORT",
    currency: budget.currency,
    projectId,
    budgetId:        budget.id,
    budgetName:      budget.name,
    budgetStatus:    budget.status,
    availableBudgets: validBudgets,
    rows,
    totals,
    unallocatedCommittedCost:        serializeMoneyDecimal(unalloc.committedCost),
    unallocatedReceivedCost:         serializeMoneyDecimal(unalloc.receivedCost),
    unallocatedAccruedCost:          serializeMoneyDecimal(unalloc.accruedCost),
    unallocatedPaidCost:             serializeMoneyDecimal(unalloc.paidCost),
    unallocatedInventoryConsumedCost: !incInv || unvaluedUnallocatedConsumption
      ? null : serializeMoneyDecimal(unalloc.inventoryConsumedCost),
    warnings,
    sectionsExcluded,
  };
}

// ─── WBS item drilldown ───────────────────────────────────────────────────────

export type WbsItemCostDetail = {
  wbsNodeId: string;
  currency: string;
  warnings: string[];
  periodFiltered?: boolean;
  wbsCode: string;
  wbsName: string;
  budgetItem: {
    unit: string; quantity: string; unitCostDirect: string;
    totalCostDirect: string; unitSalePrice: string; totalSalePrice: string;
  } | null;
  certificationLines: Array<{
    certNumber: number; certStatus: string; periodAmount: string;
    periodStart: Date; periodEnd: Date;
  }>;
  purchaseOrderLines: Array<{
    poId: string; poNumber: number; poStatus: string;
    description: string; quantity: string; unitPrice: string; lineTotal: string;
    receivedQty: string;
    costType: string | null;
  }>;
  subcontractLines: Array<{
    subcontractId: string; subcontractNumber: number; subcontractTitle: string; subcontractStatus: string;
    description: string; quantity: string; unitPrice: string; lineTotal: string;
    certifiedQuantity: string;
  }>;
  subcontractCertLines: Array<{
    certId: string; subcontractId: string; certNumber: number; certStatus: string;
    currentQty: string; lineTotal: string; certificationDate: Date;
  }>;
  supplierInvoices: Array<{
    invoiceId: string; invoiceNumber: number; status: string;
    issueDate: Date; totalAmount: string; purchaseOrderId: string | null;
    /** Distinct cost types on lines imputing this WBS (es-AR labels joined). */
    costTypeLabel: string | null;
  }>;
  payments: Array<{
    paymentId: string; paymentDate: Date; amount: string; status: string;
    invoiceId: string; invoiceNumber: number;
  }>;
  stockMovements: Array<{
    id: string; movementDate: Date; quantity: string;
    unitCost: string | null; totalCost: string | null; sourceType: string;
  }>;
  jobsiteProgress: Array<{
    logId: string; logDate: Date; logStatus: string;
    quantityCompleted: string; physicalPct: string | null;
  }>;
  /** MATERIAL APU need / ordered / shortfall for this ITEM. */
  materialCommitments: MaterialApuCommitmentView[];
  /** LABOR APU need / ordered / invoiced / shortfall for this ITEM. */
  laborCommitments: ResourceApuCommitmentView[];
  /** EQUIPMENT APU need / ordered / invoiced / shortfall for this ITEM. */
  equipmentCommitments: ResourceApuCommitmentView[];
  /** Derived físico / económico / costo % — not persisted. */
  progressSummary: WbsProgressSummary;
  /** Partida × CostCategory buckets ([D-099]); empty if no typed spend/budget. */
  byCostType: CostTypeBucket[];
};

export async function getWbsItemCostDetail(
  wbsNodeId: string,
  projectId: string,
  filters: CostControlFilters,
  ctx: ServiceContext,
): Promise<WbsItemCostDetail> {
  if (!canViewProjectCostControlReport(ctx.roles)) throw new ServiceError("FORBIDDEN", "Sin permisos");
  assertCostControlFilters(filters);
  await requireProjectAccess(projectId, ctx);
  // Operational documents have companyId NOT NULL.
  const companyWhere = ctx.companyId ? { companyId: ctx.companyId } : {};
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");
  const node = await prisma.wbsNode.findFirst({
    where: {
      id: wbsNodeId,
      type: "ITEM",
      ...(filters.budgetId ? { budgetId: filters.budgetId } : {}),
      budget: { projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx), status: { in: ["APPROVED", "CLOSED"] } },
    },
    include: { budget: { select: { projectId: true, tenantId: true, currency: true } } },
  });
  if (!node) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");
  if (node.budget.tenantId !== ctx.tenantId || node.budget.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "Acceso denegado");
  }
  await assertBudgetCostGraph(node.budgetId);
  const ci = await prisma.costItem.findUnique({
    where: { wbsNodeId },
    include: { analysisLines: { where: { budgetId: node.budgetId }, select: { budgetId: true, category: true, totalCost: true } } },
  });
  if (ci && ci.budgetId !== node.budgetId) inconsistentCostRelation();

  const incCert = gate.isEnabled("CERTIFICATIONS") && can(ctx.roles, "VIEW", "CERTIFICATIONS");
  const incProc = gate.isEnabled("PROCUREMENT") && canViewProcurementProjectArea(ctx.roles);
  const incSub = gate.isEnabled("SUBCONTRACTS") && canViewSubcontractsArea(ctx.roles);
  const incAp = gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP");
  const incInv = gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY");
  const incJl = gate.isEnabled("JOBSITE_LOG") && canViewJobsiteLogArea(ctx.roles);

  const dateFrom = filters.dateFrom;
  const dateTo   = filters.dateTo;

  const [certLines, poLines, subLines, subCertLines2, stockMoves, logProgress, invoiceLinesDirect, invoiceLinesViaPo, invoicesViaPoHeader] =
    await Promise.all([
    incCert
      ? prisma.certificationLine.findMany({
          where: { wbsNodeId, certification: {
            projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx), budgetId: node.budgetId,
            status: { in: ["ISSUED", "APPROVED"] },
            ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
          } },
          include: { certification: { select: { number: true, status: true, periodStart: true, periodEnd: true } } },
          orderBy: { certification: { periodStart: "desc" } },
        })
      : Promise.resolve([]),
    incProc
      ? prisma.purchaseOrderLine.findMany({
          where: { wbsNodeId, purchaseOrder: {
            projectId, tenantId: ctx.tenantId, ...companyWhere, status: { notIn: ["DRAFT", "CANCELLED"] },
            ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
          } },
          include: {
            purchaseOrder: { select: { id: true, number: true, status: true, currency: true, ...financialScopeSelect } },
            wbsNode: { select: wbsScopeSelect }, costAnalysisLine: { select: apuScopeSelect },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    incSub
      ? prisma.subcontractLine.findMany({
          where: { wbsNodeId, subcontract: { projectId, tenantId: ctx.tenantId, ...companyWhere, status: { notIn: ["CANCELLED"] } } },
          include: { subcontract: { select: { id: true, number: true, title: true, status: true, currency: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    incSub
      ? prisma.subcontractCertificationLine.findMany({
          where: {
            subcontractLine: { wbsNodeId },
            certification: {
              projectId, tenantId: ctx.tenantId, ...companyWhere, status: { in: ["ISSUED", "APPROVED"] },
              ...(dateWhere(dateFrom, dateTo) ? { certificationDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          include: {
            subcontractLine: { select: {
              id: true, subcontractId: true, wbsNodeId: true, wbsNode: { select: wbsScopeSelect },
              subcontract: { select: { id: true, ...financialScopeSelect, currency: true } },
            } },
            certification: {
              select: { id: true, number: true, status: true, certificationDate: true, subcontractId: true, ...financialScopeSelect },
            },
          },
          orderBy: { certification: { certificationDate: "desc" } },
        })
      : Promise.resolve([]),
    incInv
      ? prisma.stockMovement.findMany({
          where: {
            wbsNodeId, projectId, tenantId: ctx.tenantId, ...companyWhere,
            status: "CONFIRMED", type: "OUT", sourceType: "CONSUMPTION",
            ...(dateWhere(dateFrom, dateTo) ? { movementDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          orderBy: { movementDate: "desc" },
        })
      : Promise.resolve([]),
    incJl
      ? prisma.jobsiteLogProgress.findMany({
          where: { wbsNodeId, jobsiteLog: {
            projectId, tenantId: ctx.tenantId, ...companyWhere, status: { in: ["SUBMITTED", "APPROVED"] },
            ...(dateWhere(dateFrom, dateTo) ? { logDate: dateWhere(dateFrom, dateTo) } : {}),
          } },
          include: { jobsiteLog: { select: { id: true, logDate: true, status: true } } },
          orderBy: { jobsiteLog: { logDate: "desc" } },
        })
      : Promise.resolve([]),
    incAp
      ? prisma.supplierInvoiceLine.findMany({
          where: {
            wbsNodeId,
            invoice: {
              projectId,
              tenantId: ctx.tenantId, ...companyWhere,
              status: "ISSUED",
              documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
              ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          include: {
            invoice: {
              select: {
                ...invoiceWithParentScopeSelect,
                id: true, number: true, status: true, issueDate: true, totalAmount: true, purchaseOrderId: true,
                documentKind: true,
              },
            },
          },
          orderBy: { invoice: { issueDate: "desc" } },
        })
      : Promise.resolve([]),
    incAp
      ? prisma.supplierInvoiceLine.findMany({
          where: {
            purchaseOrderLine: { wbsNodeId },
            OR: [{ wbsNodeId: null }, { wbsNodeId: { not: wbsNodeId } }],
            invoice: {
              projectId,
              tenantId: ctx.tenantId, ...companyWhere,
              status: "ISSUED",
              documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
              ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          include: {
            invoice: {
              select: {
                ...invoiceWithParentScopeSelect,
                id: true, number: true, status: true, issueDate: true, totalAmount: true, purchaseOrderId: true,
                documentKind: true,
              },
            },
          },
          orderBy: { invoice: { issueDate: "desc" } },
        })
      : Promise.resolve([]),
    // Header proration applies only without any PO-line FK; direct WBS rows are listed above.
    incAp
      ? prisma.supplierInvoice.findMany({
          where: {
            projectId,
            tenantId: ctx.tenantId, ...companyWhere,
            status: "ISSUED",
            documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
            purchaseOrder: { lines: { some: { wbsNodeId } } },
            lines: {
              none: {
                OR: [
                  { wbsNodeId },
                  { purchaseOrderLineId: { not: null } },
                ],
              },
            },
            ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: {
            ...invoiceWithParentScopeSelect,
            id: true, number: true, status: true, issueDate: true, totalAmount: true, purchaseOrderId: true,
            documentKind: true,
          },
          orderBy: { issueDate: "desc" },
        })
      : Promise.resolve([]),
  ]);

  for (const line of poLines) {
    assertWbsRelation(line.wbsNode, line.purchaseOrder, ctx);
    assertApuRelation(line.costAnalysisLine, line.wbsNodeId, line.purchaseOrder, ctx);
    assertBudgetCurrency(node.budget.currency, line.purchaseOrder.currency);
  }
  for (const line of subLines) assertBudgetCurrency(node.budget.currency, line.subcontract.currency);
  for (const line of subCertLines2) {
    assertFinancialRelation(line.subcontractLine.subcontract, line.certification);
    if (line.subcontractLine.subcontractId !== line.certification.subcontractId) inconsistentCostRelation();
    assertWbsRelation(line.subcontractLine.wbsNode, line.certification, ctx);
    assertBudgetCurrency(node.budget.currency, line.subcontractLine.subcontract.currency);
  }
  for (const row of [...invoiceLinesDirect, ...invoiceLinesViaPo]) {
    assertInvoiceRelations(row.invoice, ctx);
    assertBudgetCurrency(node.budget.currency, row.invoice.currency);
  }
  for (const invoice of invoicesViaPoHeader) {
    assertInvoiceRelations(invoice, ctx);
    assertBudgetCurrency(node.budget.currency, invoice.currency);
  }

  // Deduplicate invoices by id (direct WBS line + via PO line FK + via PO header)
  const invoiceById = new Map<string, {
    invoiceId: string; invoiceNumber: number; status: string;
    issueDate: Date; totalAmount: string; purchaseOrderId: string | null;
    costTypes: Set<string>;
  }>();
  for (const row of [...invoiceLinesDirect, ...invoiceLinesViaPo]) {
    const existing = invoiceById.get(row.invoice.id);
    const sourceLine = row.invoice.lines.find((line) => line.id === row.id);
    const typeInput = sourceLine ? invoiceCostTypeInput(sourceLine) : { costType: row.costType, apuCategory: null };
    const lineType = resolveLineCostType({ ...typeInput, wbsDominantCostType: computeDominantCostTypeFromApuLines(ci?.analysisLines ?? []) });
    const signedTotal =
      row.invoice.documentKind === "CREDIT_NOTE"
        ? new Prisma.Decimal(row.invoice.totalAmount).negated()
        : row.invoice.totalAmount;
    if (!existing) {
      invoiceById.set(row.invoice.id, {
        invoiceId: row.invoice.id,
        invoiceNumber: row.invoice.number,
        status: row.invoice.status,
        issueDate: row.invoice.issueDate,
        totalAmount: serializeMoneyDecimal(signedTotal),
        purchaseOrderId: row.invoice.purchaseOrderId,
        costTypes: new Set(lineType ? [lineType] : []),
      });
    } else if (lineType) {
      existing.costTypes.add(lineType);
    }
  }
  for (const inv of invoicesViaPoHeader) {
    if (!invoiceById.has(inv.id)) {
      const signedTotal =
        inv.documentKind === "CREDIT_NOTE"
          ? new Prisma.Decimal(inv.totalAmount).negated()
          : inv.totalAmount;
      invoiceById.set(inv.id, {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        status: inv.status,
        issueDate: inv.issueDate,
        totalAmount: serializeMoneyDecimal(signedTotal),
        purchaseOrderId: inv.purchaseOrderId,
        costTypes: new Set(),
      });
    }
  }
  const supplierInvoices = Array.from(invoiceById.values()).map((inv) => ({
    invoiceId: inv.invoiceId,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    issueDate: inv.issueDate,
    totalAmount: inv.totalAmount,
    purchaseOrderId: inv.purchaseOrderId,
    costTypeLabel:
      inv.costTypes.size > 0
        ? [...inv.costTypes]
            .map((t) => COST_TYPE_LABELS_ES[t as CostCategory] ?? t)
            .join(", ")
        : null,
  }));

  const paymentCandidates = incAp
    ? await prisma.payment.findMany({
        where: {
          tenantId: ctx.tenantId, ...companyWhere,
          projectId,
          status: "CONFIRMED",
          supplierInvoice: { OR: [
            { lines: { some: { OR: [{ wbsNodeId }, { purchaseOrderLine: { wbsNodeId } }] } } },
            { purchaseOrder: { lines: { some: { wbsNodeId } } } },
            { subcontractCertification: { lines: { some: { subcontractLine: { wbsNodeId } } } } },
          ] },
          ...(dateWhere(dateFrom, dateTo) ? { paymentDate: dateWhere(dateFrom, dateTo) } : {}),
        },
        include: {
          supplierInvoice: { select: { ...invoiceWithParentScopeSelect, number: true } },
          payable: { select: { id: true, supplierInvoiceId: true, ...financialScopeSelect } },
        },
        orderBy: { paymentDate: "desc" },
      })
    : [];
  for (const payment of paymentCandidates) {
    assertPaymentRelations(payment, payment.supplierInvoice);
    assertInvoiceRelations(payment.supplierInvoice, ctx);
  }
  const paymentRows = paymentCandidates.filter((payment) => paymentWbsIds(payment.supplierInvoice).includes(wbsNodeId));
  for (const payment of paymentRows) {
    assertBudgetCurrency(node.budget.currency, payment.currency);
  }

  const [materialCommitments, laborCommitments, equipmentCommitments] = await Promise.all([
    incProc ? loadMaterialApuCommitments(projectId, ctx, {
      wbsNodeIds: [wbsNodeId],
    }) : Promise.resolve([]),
    getResourceApuCommitmentsForWbs(projectId, wbsNodeId, "LABOR", ctx).catch((err) => {
      if (err instanceof ServiceError) return [] as ResourceApuCommitmentView[];
      throw err;
    }),
    getResourceApuCommitmentsForWbs(projectId, wbsNodeId, "EQUIPMENT", ctx).catch((err) => {
      if (err instanceof ServiceError) return [] as ResourceApuCommitmentView[];
      throw err;
    }),
  ]);

  // Physical acum: APPROVED libro only (same as getWbsIncrementalProgressSnapshot).
  let physicalPctAcum = ZERO;
  let physicalQtyAcum = ZERO;
  for (const p of logProgress) {
    if (p.jobsiteLog.status !== "APPROVED") continue;
    if (p.physicalPct != null) physicalPctAcum = physicalPctAcum.add(p.physicalPct);
    physicalQtyAcum = physicalQtyAcum.add(p.quantityCompleted);
  }

  // Economic: ISSUED|APPROVED cert lines already filtered in query.
  let certifiedQty = ZERO;
  let certifiedAmount = ZERO;
  for (const cl of certLines) {
    certifiedQty = certifiedQty.add(cl.currentQty);
    certifiedAmount = certifiedAmount.add(cl.periodAmount);
  }

  // D-021 layers use the same document period as physical/economic evidence above.
  // Soft-fail ServiceError only: never let cost-control resolution break the drilldown.
  let committedCost: Prisma.Decimal | null = null;
  let accruedCost: Prisma.Decimal | null = null;
  let expectedCostExposure: Prisma.Decimal | null = null;
  let byCostType: CostTypeBucket[] = [];
  const warnings: string[] = !incInv ? [STOCK_CONSUMPTION_UNAVAILABLE_WARNING]
    : stockMoves.length > 0 ? [STOCK_CONSUMPTION_UNVALUED_WARNING] : [];
  try {
    const cc = await buildProjectCostControl(
      projectId,
      { budgetId: filters.budgetId ?? node.budgetId, dateFrom, dateTo },
      ctx,
      wbsNodeId,
    );
    if (cc.type === "REPORT") {
      for (const warning of cc.warnings) if (!warnings.includes(warning)) warnings.push(warning);
      const row = cc.rows.find((r) => r.wbsNodeId === wbsNodeId);
      if (row) {
        committedCost = new Prisma.Decimal(row.committedCost);
        accruedCost = new Prisma.Decimal(row.accruedCost);
        expectedCostExposure = new Prisma.Decimal(row.expectedCostExposure);
        byCostType = row.byCostType ?? [];
      }
    }
  } catch (err) {
    if (!(err instanceof ServiceError)) throw err;
    warnings.push(err.message);
    // Layers stay null → UI shows "—" for cost %.
  }

  const progressSummary = buildWbsProgressSummary({
    physicalPctAcum,
    physicalQtyAcum,
    certifiedQty,
    certifiedAmount,
    budgetQty: ci?.quantity ?? null,
    budgetTotalSale: ci?.totalSalePrice ?? null,
    budgetTotalCost: ci?.totalCostDirect ?? null,
    committedCost,
    accruedCost,
    expectedCostExposure,
  });

  return {
    wbsNodeId, wbsCode: node.code, wbsName: node.name,
    currency: node.budget.currency,
    warnings,
    periodFiltered: Boolean(dateFrom || dateTo),
    budgetItem: ci ? {
      unit: ci.unit,
      quantity: serializeQtyDecimal(ci.quantity),
      unitCostDirect: serializeUnitPriceDecimal(ci.unitCostDirect),
      totalCostDirect: serializeMoneyDecimal(ci.totalCostDirect),
      unitSalePrice: serializeUnitPriceDecimal(ci.unitSalePrice),
      totalSalePrice: serializeMoneyDecimal(ci.totalSalePrice),
    } : null,
    certificationLines: certLines.map((cl) => ({
      certNumber: cl.certification.number,
      certStatus: cl.certification.status,
      periodAmount: serializeMoneyDecimal(cl.periodAmount),
      periodStart: cl.certification.periodStart,
      periodEnd: cl.certification.periodEnd,
    })),
    purchaseOrderLines: poLines.map((pol) => ({
      poId: pol.purchaseOrder.id,
      poNumber: pol.purchaseOrder.number,
      poStatus: pol.purchaseOrder.status,
      description: pol.description,
      quantity: serializeQtyDecimal(pol.quantity),
      unitPrice: serializeUnitPriceDecimal(pol.unitPrice),
      lineTotal: serializeMoneyDecimal(pol.lineTotal),
      receivedQty: serializeQtyDecimal(pol.receivedQuantity),
      costType: resolveLineCostType({
        costType: pol.costType, apuCategory: pol.costAnalysisLine?.category ?? null,
        wbsDominantCostType: computeDominantCostTypeFromApuLines(ci?.analysisLines ?? []),
      }),
    })),
    subcontractLines: subLines.map((sl) => ({
      subcontractId: sl.subcontract.id,
      subcontractNumber: sl.subcontract.number,
      subcontractTitle: sl.subcontract.title,
      subcontractStatus: sl.subcontract.status,
      description: sl.description,
      quantity: serializeQtyDecimal(sl.quantity),
      unitPrice: serializeUnitPriceDecimal(sl.unitPrice),
      lineTotal: serializeMoneyDecimal(sl.lineTotal),
      certifiedQuantity: serializeQtyDecimal(sl.certifiedQuantity),
    })),
    subcontractCertLines: subCertLines2.map((scl) => ({
      certId: scl.certification.id,
      subcontractId: scl.certification.subcontractId,
      certNumber: scl.certification.number,
      certStatus: scl.certification.status,
      currentQty: serializeQtyDecimal(scl.currentQty),
      lineTotal: serializeMoneyDecimal(scl.lineTotal),
      certificationDate: scl.certification.certificationDate,
    })),
    supplierInvoices,
    payments: paymentRows.map((p) => ({
      paymentId: p.id,
      paymentDate: p.paymentDate,
      amount: serializeMoneyDecimal(p.amount),
      status: p.status,
      invoiceId: p.supplierInvoice.id,
      invoiceNumber: p.supplierInvoice.number,
    })),
    stockMovements: stockMoves.map((sm) => ({
      id: sm.id,
      movementDate: sm.movementDate,
      quantity: serializeQtyDecimal(sm.quantity),
      // D-124: their original currency/value lineage is not represented by this model.
      unitCost: null,
      totalCost: null,
      sourceType: sm.sourceType,
    })),
    jobsiteProgress: logProgress.map((p) => ({
      logId: p.jobsiteLog.id,
      logDate: p.jobsiteLog.logDate,
      logStatus: p.jobsiteLog.status,
      quantityCompleted: serializeQtyDecimal(p.quantityCompleted),
      physicalPct: p.physicalPct != null ? serializePct2(p.physicalPct.toString()) : null,
    })),
    materialCommitments,
    laborCommitments,
    equipmentCommitments,
    progressSummary,
    byCostType,
  };
}
