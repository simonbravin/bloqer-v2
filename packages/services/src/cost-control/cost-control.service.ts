import { Prisma, prisma, type CostCategory } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { roundToDecimals } from "@bloqer/utils";
import { ServiceContext, ServiceError } from "../types";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";

import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { requireProjectInTenant } from "../project/require-project-in-tenant";
import { compareWbsCodes } from "../budget/wbs-code-rules";
import { computeCostExposureLayers } from "./cost-exposure";
import { serializeMoneyDecimal, serializeQtyDecimal, serializeUnitPriceDecimal } from "../finance/money-decimal";
import {
  loadMaterialApuCommitments,
  type MaterialApuCommitmentView,
} from "../materials/material-commitment";
import {
  buildWbsProgressSummary,
  type WbsProgressSummary,
} from "./wbs-progress-summary";
import { parseFilterDate } from "../reports/report-month";
import {
  COST_TYPE_LABELS_ES,
  COST_TYPE_ORDER,
  inventoryCostType,
  resolveLineCostType,
  subcontractCostType,
} from "./cost-type";

export {
  COST_TYPE_LABELS_ES,
  COST_TYPE_ORDER,
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

// ─── Filter / output types ────────────────────────────────────────────────────

export type CostControlFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
  wbsSearch?: string;
};

export type CostControlRowFlags = {
  overBudget: boolean;
  overCertified: boolean;
  missingBudget: boolean;
};

export type CostControlRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  unit: string;
  // ─ Budget baseline ─
  budgetQty: string;
  budgetUnitCost: string;
  budgetTotalCost: string;
  budgetUnitSale: string;
  budgetTotalSale: string;
  // ─ Revenue ─
  certifiedIssued: string;   // Certification.status = ISSUED
  certifiedApproved: string; // Certification.status = APPROVED (primary KPI)
  // ─ Cost layers (shown separately — no double-counting) ─
  committedCost: string;         // CONFIRMED POs (lineSubtotal neto) + ACTIVE subcontracts
  receivedCost: string;          // CONFIRMED receipts (qty × unit price via POLine)
  accruedCost: string;           // ISSUED SupplierInvoices (lineSubtotal neto) + APPROVED SubcontractCertifications
  paidCost: string;              // CONFIRMED Payments traceable to WBS
  inventoryConsumedCost: string; // StockMovement OUT CONSUMPTION with wbsNodeId
  // ─ Quantities (D-098 EDT presets) ─
  qtyCommitted: string; // PO + subcontract line qty on this WBS
  qtyReceived: string;  // CONFIRMED receipt qty
  qtyConsumed: string;  // Stock OUT CONSUMPTION qty
  // ─ Progress ─
  operationalProgressQty: string;   // APPROVED logs only
  submittedProgressQty: string;     // SUBMITTED logs (informational)
  // ─ Derived ([BR-COS-002] / [D-065]) ─
  // openCommittedCost = max(0, committed − accrued_linked) — both net ([D-095]/[D-098])
  // expectedCostExposure = accrued + openCommitted (received is informational only)
  openCommittedCost: string;
  expectedCostExposure: string;
  remainingBudgetCost: string; // budgetTotalCost - expectedCostExposure
  costVariance: string;        // same; positive = saving, negative = overrun
  projectedMargin: string;     // budgetTotalSale - expectedCostExposure
  // ─ Percentages vs budget (null when budget is zero) ─
  pctPurchased: string | null;  // committedCost / budgetTotalCost × 100
  pctPhysical: string | null;   // qtyReceived / budgetQty × 100
  pctEconomic: string | null;   // accruedCost / budgetTotalCost × 100
  pctExposure: string | null;   // expectedCostExposure / budgetTotalCost × 100
  flags: CostControlRowFlags;
  /** Partida × cost type breakdown ([D-099]). Empty categories omitted by the UI. */
  byCostType: CostTypeBucket[];
};

/** Budget vs cost layers for one CostCategory under a WBS ITEM ([D-099]). */
export type CostTypeBucket = {
  costType: CostCategory;
  label: string;
  budgetTotalCost: string;
  committedCost: string;
  accruedCost: string;
  paidCost: string;
  inventoryConsumedCost: string;
  openCommittedCost: string;
  expectedCostExposure: string;
  costVariance: string;
};

export type CostControlTotals = {
  budgetTotalCost: string;
  budgetTotalSale: string;
  certifiedIssued: string;
  certifiedApproved: string;
  committedCost: string;
  receivedCost: string;
  accruedCost: string;
  paidCost: string;
  inventoryConsumedCost: string;
  operationalProgressQty: string;
  openCommittedCost: string;
  expectedCostExposure: string;
  remainingBudgetCost: string;
  costVariance: string;
  projectedMargin: string;
};

export type AvailableBudget = { id: string; name: string; status: string };

export type ProjectCostControlReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  budgetStatus: string;
  availableBudgets: AvailableBudget[];
  rows: CostControlRow[];
  totals: CostControlTotals;
  unallocatedCommittedCost: string;
  unallocatedReceivedCost: string;
  unallocatedAccruedCost: string;
  unallocatedPaidCost: string;
  unallocatedInventoryConsumedCost: string;
  warnings: string[];
  /** Phase 12D: layers omitted when the corresponding tenant module is disabled. */
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type BudgetSelectionRequired = {
  type: "BUDGET_SELECTION_REQUIRED";
  availableBudgets: AvailableBudget[];
};

/** No approved/closed budgets — avoid throwing so the UI can explain instead of a 500. */
export type NoApprovedBudgets = {
  type: "NO_APPROVED_BUDGETS";
};

export type CostControlResult = ProjectCostControlReport | BudgetSelectionRequired | NoApprovedBudgets;

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
  submittedProgressQty: Prisma.Decimal;
};

/** Per-category money layers ([D-099]). */
type TypeAcc = {
  committedCost: Prisma.Decimal;
  accruedCost: Prisma.Decimal;
  accruedLinkedCost: Prisma.Decimal;
  paidCost: Prisma.Decimal;
  inventoryConsumedCost: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);

function newAcc(): WbsAcc {
  return {
    certifiedIssued: ZERO, certifiedApproved: ZERO,
    committedCost: ZERO, receivedCost: ZERO, accruedCost: ZERO, accruedLinkedCost: ZERO,
    paidCost: ZERO, inventoryConsumedCost: ZERO,
    qtyCommitted: ZERO, qtyReceived: ZERO, qtyConsumed: ZERO,
    operationalProgressQty: ZERO, submittedProgressQty: ZERO,
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
  subcontractLine: { wbsNodeId: string | null };
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

function decOrZero(v: Prisma.Decimal | null | undefined): Prisma.Decimal {
  return v ?? ZERO;
}

function add(map: Map<string, WbsAcc>, wbsId: string, field: keyof WbsAcc, amount: Prisma.Decimal) {
  if (!map.has(wbsId)) return; // only budget WBS nodes get rows
  const acc = map.get(wbsId)!;
  (acc[field] as Prisma.Decimal) = (acc[field] as Prisma.Decimal).add(amount);
}

/** Percent of numerator/denominator × 100, or null when denominator is zero. */
function pctOfBudget(num: Prisma.Decimal, den: Prisma.Decimal): string | null {
  if (den.isZero()) return null;
  return serializePct2(num.div(den).times(100).toString());
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function getProjectCostControl(
  projectId: string,
  filters: CostControlFilters,
  ctx: ServiceContext,
): Promise<CostControlResult> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver control de costos");
  }

  await requireProjectInTenant(projectId, ctx.tenantId);

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");

  // ─ Budget selection ─
  const validBudgets = await prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, status: { in: ["APPROVED", "CLOSED"] } },
    select: { id: true, name: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  let budget: { id: string; name: string; status: string };
  if (filters.budgetId) {
    const found = validBudgets.find((b) => b.id === filters.budgetId);
    if (!found) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado o no está aprobado/cerrado");
    budget = found;
  } else if (validBudgets.length === 1) {
    budget = validBudgets[0]!;
  } else if (validBudgets.length === 0) {
    return { type: "NO_APPROVED_BUDGETS" };
  } else {
    return { type: "BUDGET_SELECTION_REQUIRED", availableBudgets: validBudgets };
  }

  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  const incCert = gate.isEnabled("CERTIFICATIONS");
  const incProc = gate.isEnabled("PROCUREMENT");
  const incSub = gate.isEnabled("SUBCONTRACTS");
  const incAp = gate.isEnabled("AP");
  const incInv = gate.isEnabled("INVENTORY");
  const incJl = gate.isEnabled("JOBSITE_LOG");

  if (!incCert) {
    sectionsExcluded.push({
      module: "CERTIFICATIONS",
      section: "certified_revenue",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Certificaciones deshabilitadas para el tenant: se excluyen montos certificados.");
  }
  if (!incProc) {
    sectionsExcluded.push({
      module: "PROCUREMENT",
      section: "po_committed_received",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Compras deshabilitadas: se excluyen OC y recepciones (comprometido / recibido).");
  }
  if (!incSub) {
    sectionsExcluded.push({
      module: "SUBCONTRACTS",
      section: "subcontract_committed_certified",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Subcontratos deshabilitados: se excluyen líneas de subcontrato y certificaciones de subcontrato.");
  }
  if (!incAp) {
    sectionsExcluded.push({
      module: "AP",
      section: "supplier_invoice_payment_layers",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Cuentas por pagar deshabilitadas: se excluyen facturas de proveedor y pagos.");
  }
  if (!incInv) {
    sectionsExcluded.push({
      module: "INVENTORY",
      section: "stock_consumption",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Inventario deshabilitado: se excluye consumo de stock por partida EDT.");
  }
  if (!incJl) {
    sectionsExcluded.push({
      module: "JOBSITE_LOG",
      section: "operational_progress",
      reason:  "TENANT_MODULE_DISABLED",
    });
    warnings.push("Libro de obra deshabilitado: se excluyen cantidades de avance operativo.");
  }

  // ─ WBS ITEM nodes with cost items ─
  const wbsNodes = await prisma.wbsNode.findMany({
    where: {
      budgetId: budget.id,
      type: "ITEM",
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
          analysisLines: { select: { category: true, totalCost: true } },
        },
      },
    },
  });
  wbsNodes.sort((a, b) => compareWbsCodes(a.code, b.code));

  const wbsNodeIds = new Set(wbsNodes.map((n) => n.id));

  // Pre-populate accumulator map for all budget WBS ITEM nodes
  const accMap = new Map<string, WbsAcc>(wbsNodes.map((n) => [n.id, newAcc()]));
  const typeAccMap = new Map<string, Map<CostCategory, TypeAcc>>();
  for (const n of wbsNodes) typeAccMap.set(n.id, new Map());
  const unalloc = newUnalloc();
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
              projectId, tenantId: ctx.tenantId,
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
              projectId, tenantId: ctx.tenantId,
              status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
              ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          include: {
            purchaseOrder: { select: { id: true, totalAmount: true } },
            receiptLines: {
              include: { purchaseReceipt: { select: { status: true } } },
            },
          },
        })
      : Promise.resolve([]),
    incSub
      ? prisma.subcontractLine.findMany({
          where: { subcontract: { projectId, tenantId: ctx.tenantId, status: "ACTIVE" } },
          select: { wbsNodeId: true, lineTotal: true, quantity: true },
        })
      : Promise.resolve([]),
    incSub
      ? prisma.subcontractCertificationLine.findMany({
          where: {
            certification: {
              projectId, tenantId: ctx.tenantId, status: "APPROVED",
              ...(dateWhere(dateFrom, dateTo) ? { certificationDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          select: {
            subcontractCertificationId: true,
            lineTotal: true,
            subcontractLine: { select: { wbsNodeId: true } },
          },
        })
      : Promise.resolve([] as SubCertLineForCostControl[]),
    incAp
      ? prisma.supplierInvoice.findMany({
          where: {
            projectId, tenantId: ctx.tenantId, status: "ISSUED",
            purchaseOrderId: { not: null },
            subcontractCertificationId: null,
            ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: {
            id: true, totalAmount: true, purchaseOrderId: true,
            lines: {
              select: {
                lineSubtotal: true,
                lineTotal: true,
                wbsNodeId: true,
                costType: true,
                purchaseOrderLineId: true,
                purchaseOrderLine: { select: { wbsNodeId: true, lineSubtotal: true, lineTotal: true, costType: true } },
              },
            },
            purchaseOrder: {
              select: {
                id: true,
                totalAmount: true,
                lines: { select: { id: true, wbsNodeId: true, lineSubtotal: true, lineTotal: true, costType: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    incAp
      ? prisma.supplierInvoice.findMany({
          where: {
            projectId, tenantId: ctx.tenantId, status: "ISSUED",
            purchaseOrderId: null, subcontractCertificationId: null,
            ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: {
            totalAmount: true,
            lines: { select: { wbsNodeId: true, lineSubtotal: true, lineTotal: true, costType: true } },
          },
        })
      : Promise.resolve([]),
    incAp
      ? prisma.payment.findMany({
          where: {
            projectId, tenantId: ctx.tenantId, status: "CONFIRMED",
            ...(dateWhere(dateFrom, dateTo) ? { paymentDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: {
            amount: true,
            payable: {
              select: {
                supplierInvoice: {
                  select: {
                    id: true, totalAmount: true,
                    purchaseOrderId: true, subcontractCertificationId: true,
                    purchaseOrder: {
                      select: {
                        totalAmount: true,
                        lines: { select: { id: true, wbsNodeId: true, lineTotal: true, costType: true } },
                      },
                    },
                    lines: {
                      select: {
                        wbsNodeId: true,
                        lineTotal: true,
                        costType: true,
                        purchaseOrderLineId: true,
                        purchaseOrderLine: { select: { wbsNodeId: true, costType: true } },
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
            projectId, tenantId: ctx.tenantId,
            status: "CONFIRMED", type: "OUT", sourceType: "CONSUMPTION",
            wbsNodeId: { not: null },
            ...(dateWhere(dateFrom, dateTo) ? { movementDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: { wbsNodeId: true, quantity: true, unitCost: true, totalCost: true },
        })
      : Promise.resolve([]),
    incJl
      ? prisma.jobsiteLogProgress.findMany({
          where: {
            jobsiteLog: {
              projectId, tenantId: ctx.tenantId, status: "APPROVED",
              ...(dateWhere(dateFrom, dateTo) ? { logDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          select: { wbsNodeId: true, quantityCompleted: true },
        })
      : Promise.resolve([]),
    incJl
      ? prisma.jobsiteLogProgress.findMany({
          where: {
            jobsiteLog: {
              projectId, tenantId: ctx.tenantId, status: "SUBMITTED",
              ...(dateWhere(dateFrom, dateTo) ? { logDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          select: { wbsNodeId: true, quantityCompleted: true },
        })
      : Promise.resolve([]),
  ]);

  // ─ Build WBS allocation maps for payment routing ─
  // subCertWbsMap: subCertId → [{ wbsNodeId: string | null, fraction: Decimal }]
  const subCertTotals = new Map<string, Prisma.Decimal>();
  const subCertLinesBySubCert = new Map<string, SubCertLineForCostControl[]>();
  for (const scl of subCertLines) {
    const certId = scl.subcontractCertificationId;
    subCertTotals.set(certId, decOrZero(subCertTotals.get(certId)).add(scl.lineTotal));
    if (!subCertLinesBySubCert.has(certId)) subCertLinesBySubCert.set(certId, []);
    subCertLinesBySubCert.get(certId)!.push(scl);
  }
  const subCertWbsMap = new Map<string, Array<{ wbsNodeId: string | null; fraction: Prisma.Decimal }>>();
  for (const [certId, total] of subCertTotals) {
    if (total.isZero()) continue;
    const lines2 = subCertLinesBySubCert.get(certId) ?? [];
    subCertWbsMap.set(certId, lines2.map((l) => ({
      wbsNodeId: l.subcontractLine.wbsNodeId,
      fraction: new Prisma.Decimal(l.lineTotal).div(total),
    })));
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
    const costType = resolveLineCostType({ costType: pol.costType, apuCategory: null });
    // Committed
    if (inBudget) {
      add(accMap, wbsId!, "committedCost", new Prisma.Decimal(pol.lineSubtotal));
      add(accMap, wbsId!, "qtyCommitted", new Prisma.Decimal(pol.quantity));
      addTyped(typeAccMap, wbsId!, costType, "committedCost", new Prisma.Decimal(pol.lineSubtotal));
    } else {
      unalloc.committedCost = unalloc.committedCost.add(pol.lineSubtotal);
    }
    // Received (via CONFIRMED receipts) — same net basis as committed ([D-095]/[D-098])
    const unitCostNet = pol.quantity.isZero()
      ? ZERO
      : new Prisma.Decimal(pol.lineSubtotal).div(pol.quantity);
    for (const rl of pol.receiptLines) {
      if (rl.purchaseReceipt.status !== "CONFIRMED") continue;
      const cost = unitCostNet.mul(rl.quantityReceived);
      if (inBudget) {
        add(accMap, wbsId!, "receivedCost", cost);
        add(accMap, wbsId!, "qtyReceived", new Prisma.Decimal(rl.quantityReceived));
      } else {
        unalloc.receivedCost = unalloc.receivedCost.add(cost);
      }
    }
  }

  // C. Committed from ACTIVE subcontract lines
  for (const sl of activeSubLines) {
    const wbsId = sl.wbsNodeId;
    const subType = subcontractCostType();
    if (wbsId && wbsNodeIds.has(wbsId)) {
      add(accMap, wbsId, "committedCost", new Prisma.Decimal(sl.lineTotal));
      add(accMap, wbsId, "qtyCommitted", new Prisma.Decimal(sl.quantity));
      addTyped(typeAccMap, wbsId, subType, "committedCost", new Prisma.Decimal(sl.lineTotal));
    } else {
      unalloc.committedCost = unalloc.committedCost.add(sl.lineTotal);
    }
  }

  // D. Accrued from APPROVED sub cert lines (linked to subcontract commitment)
  for (const scl of subCertLines) {
    const wbsId = scl.subcontractLine.wbsNodeId;
    const amount = new Prisma.Decimal(scl.lineTotal);
    const subType = subcontractCostType();
    if (wbsId && wbsNodeIds.has(wbsId)) {
      add(accMap, wbsId, "accruedCost", amount);
      add(accMap, wbsId, "accruedLinkedCost", amount);
      addTyped(typeAccMap, wbsId, subType, "accruedCost", amount);
      addTyped(typeAccMap, wbsId, subType, "accruedLinkedCost", amount);
    } else {
      unalloc.accruedCost = unalloc.accruedCost.add(amount);
    }
  }

  // E. Accrued from ISSUED SupplierInvoices (PO-linked) — prefer line FK ([D-066]), else PO weights.
  // Net basis (lineSubtotal) so accruedLinked consumes open_committed consistently with D-095.
  for (const inv of poLinkedInvoices) {
    if (!inv.purchaseOrder) continue;
    const linkedLines = inv.lines.filter((l) => l.purchaseOrderLineId);
    if (linkedLines.length > 0) {
      for (const line of linkedLines) {
        const wbsId = line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId;
        const amount = new Prisma.Decimal(line.lineSubtotal);
        const costType = resolveLineCostType({
          costType: line.costType ?? line.purchaseOrderLine?.costType ?? null,
          apuCategory: null,
        });
        if (wbsId && wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "accruedCost", amount);
          // Only FK-mapped lines consume open_committed on that partida ([D-065]).
          add(accMap, wbsId, "accruedLinkedCost", amount);
          addTyped(typeAccMap, wbsId, costType, "accruedCost", amount);
          addTyped(typeAccMap, wbsId, costType, "accruedLinkedCost", amount);
        } else {
          unalloc.accruedCost = unalloc.accruedCost.add(amount);
        }
      }
      // Orphan lines on a PO invoice: accrue by line WBS. If that WBS is on the
      // same OC commitment, also count as linked so open_committed shrinks ([D-065]).
      const orphanLines = inv.lines.filter((l) => !l.purchaseOrderLineId);
      const poWbsOnCommitment = new Set(
        inv.purchaseOrder.lines.map((l) => l.wbsNodeId).filter((id): id is string => Boolean(id)),
      );
      for (const line of orphanLines) {
        const amount = new Prisma.Decimal(line.lineSubtotal);
        const wbsId = line.wbsNodeId;
        const costType = resolveLineCostType({ costType: line.costType, apuCategory: null });
        if (wbsId && wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "accruedCost", amount);
          addTyped(typeAccMap, wbsId, costType, "accruedCost", amount);
          if (poWbsOnCommitment.has(wbsId)) {
            add(accMap, wbsId, "accruedLinkedCost", amount);
            addTyped(typeAccMap, wbsId, costType, "accruedLinkedCost", amount);
          }
        } else {
          unalloc.accruedCost = unalloc.accruedCost.add(amount);
        }
      }
      continue;
    }

    const poLines2 = inv.purchaseOrder.lines;
    const poTotal = poLines2.reduce((s, l) => s.add(l.lineSubtotal), ZERO);
    const invNet = inv.lines.length > 0
      ? inv.lines.reduce((s, l) => s.add(l.lineSubtotal), ZERO)
      : new Prisma.Decimal(inv.totalAmount);
    if (poTotal.isZero()) {
      unalloc.accruedCost = unalloc.accruedCost.add(invNet);
      continue;
    }
    for (const pol of poLines2) {
      const share = new Prisma.Decimal(pol.lineSubtotal).div(poTotal).mul(invNet);
      const wbsId = pol.wbsNodeId;
      const costType = resolveLineCostType({ costType: pol.costType, apuCategory: null });
      if (wbsId && wbsNodeIds.has(wbsId)) {
        add(accMap, wbsId, "accruedCost", share);
        add(accMap, wbsId, "accruedLinkedCost", share);
        addTyped(typeAccMap, wbsId, costType, "accruedCost", share);
        addTyped(typeAccMap, wbsId, costType, "accruedLinkedCost", share);
      } else {
        unalloc.accruedCost = unalloc.accruedCost.add(share);
      }
    }
  }

  // F. Direct project invoices (no PO, no sub cert) — prefer line WBS ([D-055]); NOT linked to commitment
  for (const inv of unallocatedInvoices) {
    const linesWithWbs = inv.lines.filter((l) => l.wbsNodeId);
    if (linesWithWbs.length > 0) {
      for (const line of linesWithWbs) {
        const wbsId = line.wbsNodeId!;
        const amount = new Prisma.Decimal(line.lineSubtotal);
        if (wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "accruedCost", amount);
          addTyped(
            typeAccMap,
            wbsId,
            resolveLineCostType({ costType: line.costType, apuCategory: null }),
            "accruedCost",
            amount,
          );
        } else {
          unalloc.accruedCost = unalloc.accruedCost.add(amount);
        }
      }
      const linesWithoutWbs = inv.lines.filter((l) => !l.wbsNodeId);
      for (const line of linesWithoutWbs) {
        unalloc.accruedCost = unalloc.accruedCost.add(line.lineSubtotal);
      }
    } else {
      unalloc.accruedCost = unalloc.accruedCost.add(inv.totalAmount);
    }
  }
  const unallocWithoutLineWbs = unallocatedInvoices.filter(
    (inv) => inv.lines.every((l) => !l.wbsNodeId),
  );
  if (unallocWithoutLineWbs.length > 0) {
    warnings.push(`${unallocWithoutLineWbs.length} factura(s) de proveedor sin OC ni EDT en líneas — costo no asignado a partida EDT.`);
  }

  // G. Paid cost (CONFIRMED payments) — prefer invoice line → PO line WBS when present
  for (const pmt of payments) {
    const inv = pmt.payable?.supplierInvoice;
    if (!inv) { unalloc.paidCost = unalloc.paidCost.add(pmt.amount); continue; }

    const invLinesWithPo = inv.lines?.filter((l) => l.purchaseOrderLineId) ?? [];
    if (invLinesWithPo.length > 0) {
      const lineTotal = inv.lines.reduce((s, l) => s.add(l.lineTotal), ZERO);
      if (lineTotal.isZero()) { unalloc.paidCost = unalloc.paidCost.add(pmt.amount); continue; }
      for (const line of inv.lines) {
        const share = new Prisma.Decimal(line.lineTotal).div(lineTotal).mul(pmt.amount);
        const wbsId = line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId;
        const costType = resolveLineCostType({
          costType: line.costType ?? line.purchaseOrderLine?.costType ?? null,
          apuCategory: null,
        });
        if (wbsId && wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "paidCost", share);
          addTyped(typeAccMap, wbsId, costType, "paidCost", share);
        } else unalloc.paidCost = unalloc.paidCost.add(share);
      }
    } else if (inv.purchaseOrderId && inv.purchaseOrder) {
      const poLines2 = inv.purchaseOrder.lines;
      const poTotal  = poLines2.reduce((s, l) => s.add(l.lineTotal), ZERO);
      if (poTotal.isZero()) { unalloc.paidCost = unalloc.paidCost.add(pmt.amount); continue; }
      for (const pol of poLines2) {
        const share = new Prisma.Decimal(pol.lineTotal).div(poTotal).mul(pmt.amount);
        const wbsId = pol.wbsNodeId;
        const costType = resolveLineCostType({ costType: pol.costType, apuCategory: null });
        if (wbsId && wbsNodeIds.has(wbsId)) {
          add(accMap, wbsId, "paidCost", share);
          addTyped(typeAccMap, wbsId, costType, "paidCost", share);
        } else unalloc.paidCost = unalloc.paidCost.add(share);
      }
    } else if (inv.subcontractCertificationId) {
      const fracs = subCertWbsMap.get(inv.subcontractCertificationId);
      if (!fracs) { unalloc.paidCost = unalloc.paidCost.add(pmt.amount); continue; }
      const subType = subcontractCostType();
      for (const f of fracs) {
        const share = f.fraction.mul(pmt.amount);
        if (f.wbsNodeId && wbsNodeIds.has(f.wbsNodeId)) {
          add(accMap, f.wbsNodeId, "paidCost", share);
          addTyped(typeAccMap, f.wbsNodeId, subType, "paidCost", share);
        } else unalloc.paidCost = unalloc.paidCost.add(share);
      }
    } else if (inv.lines?.some((l) => l.wbsNodeId)) {
      const lineTotal = inv.lines.reduce((s, l) => s.add(l.lineTotal), ZERO);
      if (lineTotal.isZero()) { unalloc.paidCost = unalloc.paidCost.add(pmt.amount); continue; }
      for (const line of inv.lines) {
        const share = new Prisma.Decimal(line.lineTotal).div(lineTotal).mul(pmt.amount);
        const costType = resolveLineCostType({ costType: line.costType, apuCategory: null });
        if (line.wbsNodeId && wbsNodeIds.has(line.wbsNodeId)) {
          add(accMap, line.wbsNodeId, "paidCost", share);
          addTyped(typeAccMap, line.wbsNodeId, costType, "paidCost", share);
        } else unalloc.paidCost = unalloc.paidCost.add(share);
      }
    } else {
      unalloc.paidCost = unalloc.paidCost.add(pmt.amount);
    }
  }

  // H. Inventory consumption
  for (const sm of consumptions) {
    const cost = decOrZero(sm.totalCost).isZero()
      ? new Prisma.Decimal(sm.quantity).mul(decOrZero(sm.unitCost))
      : decOrZero(sm.totalCost);
    const wbsId = sm.wbsNodeId!;
    const matType = inventoryCostType();
    if (wbsNodeIds.has(wbsId)) {
      add(accMap, wbsId, "inventoryConsumedCost", cost);
      add(accMap, wbsId, "qtyConsumed", new Prisma.Decimal(sm.quantity));
      addTyped(typeAccMap, wbsId, matType, "inventoryConsumedCost", cost);
    } else unalloc.inventoryConsumedCost = unalloc.inventoryConsumedCost.add(cost);
  }

  // I. Operational progress (APPROVED logs)
  for (const p of approvedProgress) {
    if (wbsNodeIds.has(p.wbsNodeId)) add(accMap, p.wbsNodeId, "operationalProgressQty", p.quantityCompleted);
  }

  // J. Submitted progress (informational)
  for (const p of submittedProgress) {
    if (wbsNodeIds.has(p.wbsNodeId)) add(accMap, p.wbsNodeId, "submittedProgressQty", p.quantityCompleted);
  }

  // ─ Build rows ─
  const rows: CostControlRow[] = [];
  const totAcc = newAcc();
  let totBudgetCost = ZERO, totBudgetSale = ZERO;
  let totExpected = ZERO, totRemaining = ZERO, totVariance = ZERO, totMargin = ZERO;
  let totOpenCommitted = ZERO;

  for (const node of wbsNodes) {
    const acc    = accMap.get(node.id)!;
    const ci     = node.costItem;
    const bCost  = ci ? new Prisma.Decimal(ci.totalCostDirect) : ZERO;
    const bSale  = ci ? new Prisma.Decimal(ci.totalSalePrice)  : ZERO;
    const bQty   = ci ? new Prisma.Decimal(ci.quantity)        : ZERO;
    const bUCost = ci ? new Prisma.Decimal(ci.unitCostDirect)  : ZERO;
    const bUSale = ci ? new Prisma.Decimal(ci.unitSalePrice)   : ZERO;

    const committed = acc.committedCost;
    const received  = acc.receivedCost;
    const accrued   = acc.accruedCost;
    const accruedLinked = acc.accruedLinkedCost;

    // [BR-COS-002] / [D-065]: exposure = accrued + open_committed (not max / not committed+accrued)
    const { openCommitted, expectedCostExposure: expected } = computeCostExposureLayers({
      committed,
      accrued,
      accruedLinked,
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
      const tBudget = budgetByType.get(cat) ?? ZERO;
      const hasSignal =
        !tBudget.isZero() ||
        !tAcc.committedCost.isZero() ||
        !tAcc.accruedCost.isZero() ||
        !tAcc.paidCost.isZero() ||
        !tAcc.inventoryConsumedCost.isZero();
      if (!hasSignal) continue;
      const { openCommitted: tOpen, expectedCostExposure: tExpected } = computeCostExposureLayers({
        committed: tAcc.committedCost,
        accrued: tAcc.accruedCost,
        accruedLinked: tAcc.accruedLinkedCost,
      });
      byCostType.push({
        costType: cat,
        label: COST_TYPE_LABELS_ES[cat],
        budgetTotalCost: serializeMoneyDecimal(tBudget),
        committedCost: serializeMoneyDecimal(tAcc.committedCost),
        accruedCost: serializeMoneyDecimal(tAcc.accruedCost),
        paidCost: serializeMoneyDecimal(tAcc.paidCost),
        inventoryConsumedCost: serializeMoneyDecimal(tAcc.inventoryConsumedCost),
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
      inventoryConsumedCost: serializeMoneyDecimal(acc.inventoryConsumedCost),
      qtyCommitted: serializeQtyDecimal(acc.qtyCommitted),
      qtyReceived:  serializeQtyDecimal(acc.qtyReceived),
      qtyConsumed:  serializeQtyDecimal(acc.qtyConsumed),
      operationalProgressQty: serializeQtyDecimal(acc.operationalProgressQty),
      submittedProgressQty:   serializeQtyDecimal(acc.submittedProgressQty),
      openCommittedCost:    serializeMoneyDecimal(openCommitted),
      expectedCostExposure: serializeMoneyDecimal(expected),
      remainingBudgetCost:  serializeMoneyDecimal(remaining),
      costVariance:         serializeMoneyDecimal(variance),
      projectedMargin:      serializeMoneyDecimal(margin),
      pctPurchased: pctOfBudget(committed, bCost),
      pctPhysical:  pctOfBudget(acc.qtyReceived, bQty),
      pctEconomic:  pctOfBudget(accrued, bCost),
      pctExposure:  pctOfBudget(expected, bCost),
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
    inventoryConsumedCost: serializeMoneyDecimal(totAcc.inventoryConsumedCost),
    operationalProgressQty: serializeQtyDecimal(totAcc.operationalProgressQty),
    openCommittedCost:    serializeMoneyDecimal(totOpenCommitted),
    expectedCostExposure: serializeMoneyDecimal(totExpected),
    remainingBudgetCost:  serializeMoneyDecimal(totRemaining),
    costVariance:         serializeMoneyDecimal(totVariance),
    projectedMargin:      serializeMoneyDecimal(totMargin),
  };

  return {
    type: "REPORT",
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
    unallocatedInventoryConsumedCost: serializeMoneyDecimal(unalloc.inventoryConsumedCost),
    warnings,
    sectionsExcluded,
  };
}

// ─── WBS item drilldown ───────────────────────────────────────────────────────

export type WbsItemCostDetail = {
  wbsNodeId: string;
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

  const node = await prisma.wbsNode.findUnique({
    where: { id: wbsNodeId },
    include: { costItem: true, budget: { select: { projectId: true, tenantId: true } } },
  });
  if (!node) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");
  if (node.budget.tenantId !== ctx.tenantId || node.budget.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "Acceso denegado");
  }

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");

  const incCert = gate.isEnabled("CERTIFICATIONS");
  const incProc = gate.isEnabled("PROCUREMENT");
  const incSub = gate.isEnabled("SUBCONTRACTS");
  const incAp = gate.isEnabled("AP");
  const incInv = gate.isEnabled("INVENTORY");
  const incJl = gate.isEnabled("JOBSITE_LOG");

  const dateFrom = filters.dateFrom;
  const dateTo   = filters.dateTo;

  const [certLines, poLines, subLines, subCertLines2, stockMoves, logProgress, invoiceLinesDirect, invoiceLinesViaPo, invoicesViaPoHeader] =
    await Promise.all([
    incCert
      ? prisma.certificationLine.findMany({
          where: { wbsNodeId, certification: { projectId, tenantId: ctx.tenantId, status: { in: ["ISSUED", "APPROVED"] } } },
          include: { certification: { select: { number: true, status: true, periodStart: true, periodEnd: true } } },
          orderBy: { certification: { periodStart: "desc" } },
        })
      : Promise.resolve([]),
    incProc
      ? prisma.purchaseOrderLine.findMany({
          where: { wbsNodeId, purchaseOrder: { projectId, tenantId: ctx.tenantId, status: { notIn: ["DRAFT", "CANCELLED"] } } },
          include: { purchaseOrder: { select: { id: true, number: true, status: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    incSub
      ? prisma.subcontractLine.findMany({
          where: { wbsNodeId, subcontract: { projectId, tenantId: ctx.tenantId, status: { notIn: ["CANCELLED"] } } },
          include: { subcontract: { select: { id: true, number: true, title: true, status: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    incSub
      ? prisma.subcontractCertificationLine.findMany({
          where: {
            subcontractLine: { wbsNodeId },
            certification: { projectId, tenantId: ctx.tenantId, status: { in: ["ISSUED", "APPROVED"] } },
          },
          include: {
            certification: {
              select: { id: true, number: true, status: true, certificationDate: true, subcontractId: true },
            },
          },
          orderBy: { certification: { certificationDate: "desc" } },
        })
      : Promise.resolve([]),
    incInv
      ? prisma.stockMovement.findMany({
          where: {
            wbsNodeId, projectId, tenantId: ctx.tenantId,
            status: "CONFIRMED", type: "OUT", sourceType: "CONSUMPTION",
          },
          orderBy: { movementDate: "desc" },
        })
      : Promise.resolve([]),
    incJl
      ? prisma.jobsiteLogProgress.findMany({
          where: { wbsNodeId, jobsiteLog: { projectId, tenantId: ctx.tenantId, status: { in: ["SUBMITTED", "APPROVED"] } } },
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
              tenantId: ctx.tenantId,
              status: "ISSUED",
              ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          include: {
            invoice: {
              select: {
                id: true, number: true, status: true, issueDate: true, totalAmount: true, purchaseOrderId: true,
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
              tenantId: ctx.tenantId,
              status: "ISSUED",
              ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
            },
          },
          include: {
            invoice: {
              select: {
                id: true, number: true, status: true, issueDate: true, totalAmount: true, purchaseOrderId: true,
              },
            },
          },
          orderBy: { invoice: { issueDate: "desc" } },
        })
      : Promise.resolve([]),
    // Legacy PO-header invoices without line WBS / PO-line FK for this partida (proportional case).
    incAp
      ? prisma.supplierInvoice.findMany({
          where: {
            projectId,
            tenantId: ctx.tenantId,
            status: "ISSUED",
            purchaseOrder: { lines: { some: { wbsNodeId } } },
            lines: {
              none: {
                OR: [
                  { wbsNodeId },
                  { purchaseOrderLine: { wbsNodeId } },
                ],
              },
            },
            ...(dateWhere(dateFrom, dateTo) ? { issueDate: dateWhere(dateFrom, dateTo) } : {}),
          },
          select: {
            id: true, number: true, status: true, issueDate: true, totalAmount: true, purchaseOrderId: true,
          },
          orderBy: { issueDate: "desc" },
        })
      : Promise.resolve([]),
  ]);

  // Deduplicate invoices by id (direct WBS line + via PO line FK + via PO header)
  const invoiceById = new Map<string, {
    invoiceId: string; invoiceNumber: number; status: string;
    issueDate: Date; totalAmount: string; purchaseOrderId: string | null;
  }>();
  for (const row of [...invoiceLinesDirect, ...invoiceLinesViaPo]) {
    if (!invoiceById.has(row.invoice.id)) {
      invoiceById.set(row.invoice.id, {
        invoiceId: row.invoice.id,
        invoiceNumber: row.invoice.number,
        status: row.invoice.status,
        issueDate: row.invoice.issueDate,
        totalAmount: serializeMoneyDecimal(row.invoice.totalAmount),
        purchaseOrderId: row.invoice.purchaseOrderId,
      });
    }
  }
  for (const inv of invoicesViaPoHeader) {
    if (!invoiceById.has(inv.id)) {
      invoiceById.set(inv.id, {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        status: inv.status,
        issueDate: inv.issueDate,
        totalAmount: serializeMoneyDecimal(inv.totalAmount),
        purchaseOrderId: inv.purchaseOrderId,
      });
    }
  }
  const supplierInvoices = Array.from(invoiceById.values());

  const invoiceIds = supplierInvoices.map((i) => i.invoiceId);
  const paymentRows = incAp && invoiceIds.length > 0
    ? await prisma.payment.findMany({
        where: {
          tenantId: ctx.tenantId,
          projectId,
          status: "CONFIRMED",
          supplierInvoiceId: { in: invoiceIds },
          ...(dateWhere(dateFrom, dateTo) ? { paymentDate: dateWhere(dateFrom, dateTo) } : {}),
        },
        include: {
          supplierInvoice: { select: { id: true, number: true } },
        },
        orderBy: { paymentDate: "desc" },
      })
    : [];

  const ci = node.costItem;
  const materialCommitments = await loadMaterialApuCommitments(projectId, ctx.tenantId, {
    wbsNodeIds: [wbsNodeId],
  });

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

  // Cost layers D-021 — all-time (no date filter) so the triad matches physical/economic.
  // Soft-fail ServiceError only: never let cost-control resolution break the drilldown.
  let committedCost: Prisma.Decimal | null = null;
  let accruedCost: Prisma.Decimal | null = null;
  let expectedCostExposure: Prisma.Decimal | null = null;
  let byCostType: CostTypeBucket[] = [];
  try {
    const cc = await getProjectCostControl(
      projectId,
      { budgetId: filters.budgetId ?? node.budgetId },
      ctx,
    );
    if (cc.type === "REPORT") {
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
      unitCost: sm.unitCost != null ? serializeUnitPriceDecimal(sm.unitCost) : null,
      totalCost: sm.totalCost != null ? serializeMoneyDecimal(sm.totalCost) : null,
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
    progressSummary,
    byCostType,
  };
}
