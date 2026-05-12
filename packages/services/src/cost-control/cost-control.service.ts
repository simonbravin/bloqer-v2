import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";

/** Project-scoped cost control (Phase 7D): VIEW PROJECTS or VIEW BUDGETS. */
export function canViewProjectCostControlReport(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "PROJECTS") || can(roles, "VIEW", "BUDGETS");
}

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
  committedCost: string;         // ISSUED POs + ACTIVE subcontracts
  receivedCost: string;          // CONFIRMED receipts (qty × unit price via POLine)
  accruedCost: string;           // ISSUED SupplierInvoices (PO-linked proportional) + APPROVED SubcontractCertifications
  paidCost: string;              // CONFIRMED Payments traceable to WBS
  inventoryConsumedCost: string; // StockMovement OUT CONSUMPTION with wbsNodeId
  // ─ Progress ─
  operationalProgressQty: string;   // APPROVED logs only
  submittedProgressQty: string;     // SUBMITTED logs (informational)
  // ─ Derived ─
  // Assumption: expectedCostExposure = max(committed, received, accrued) per user decision.
  // openCommittedCost = max(0, committed - accrued) — simplified; does not chase individual line links.
  openCommittedCost: string;
  expectedCostExposure: string;
  remainingBudgetCost: string; // budgetTotalCost - expectedCostExposure
  costVariance: string;        // same; positive = saving, negative = overrun
  projectedMargin: string;     // budgetTotalSale - expectedCostExposure
  flags: CostControlRowFlags;
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

export type CostControlResult = ProjectCostControlReport | BudgetSelectionRequired;

// ─── Internal accumulators ────────────────────────────────────────────────────

type WbsAcc = {
  certifiedIssued: Prisma.Decimal;
  certifiedApproved: Prisma.Decimal;
  committedCost: Prisma.Decimal;
  receivedCost: Prisma.Decimal;
  accruedCost: Prisma.Decimal;
  paidCost: Prisma.Decimal;
  inventoryConsumedCost: Prisma.Decimal;
  operationalProgressQty: Prisma.Decimal;
  submittedProgressQty: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);
function newAcc(): WbsAcc {
  return {
    certifiedIssued: ZERO, certifiedApproved: ZERO,
    committedCost: ZERO, receivedCost: ZERO, accruedCost: ZERO,
    paidCost: ZERO, inventoryConsumedCost: ZERO,
    operationalProgressQty: ZERO, submittedProgressQty: ZERO,
  };
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
    ...(from ? { gte: new Date(from) } : {}),
    ...(to   ? { lte: new Date(to)   } : {}),
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

// ─── Main function ────────────────────────────────────────────────────────────

export async function getProjectCostControl(
  projectId: string,
  filters: CostControlFilters,
  ctx: ServiceContext,
): Promise<CostControlResult> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver control de costos");
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

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
    throw new ServiceError("CONFLICT", "El proyecto no tiene presupuestos aprobados o cerrados");
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
    warnings.push("Inventario deshabilitado: se excluye consumo de stock por WBS.");
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
    include: { costItem: true },
    orderBy: { code: "asc" },
  });

  const wbsNodeIds = new Set(wbsNodes.map((n) => n.id));

  // Pre-populate accumulator map for all budget WBS ITEM nodes
  const accMap = new Map<string, WbsAcc>(wbsNodes.map((n) => [n.id, newAcc()]));
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
              status: { in: ["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED"] },
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
          select: { wbsNodeId: true, lineTotal: true },
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
            purchaseOrder: { select: { id: true, totalAmount: true, lines: { select: { wbsNodeId: true, lineTotal: true } } } },
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
          select: { totalAmount: true },
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
                    purchaseOrder: { select: { totalAmount: true, lines: { select: { wbsNodeId: true, lineTotal: true } } } },
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
  // poWbsMap: poId → [{ wbsNodeId: string | null, fraction: Decimal }]
  const poWbsMap = new Map<string, Array<{ wbsNodeId: string | null; fraction: Prisma.Decimal }>>();
  for (const inv of poLinkedInvoices) {
    if (!inv.purchaseOrder || poWbsMap.has(inv.purchaseOrder.id)) continue;
    const lines = inv.purchaseOrder.lines;
    const poTotal = lines.reduce((s, l) => s.add(l.lineTotal), ZERO);
    if (poTotal.isZero()) continue;
    poWbsMap.set(inv.purchaseOrder.id, lines.map((l) => ({
      wbsNodeId: l.wbsNodeId,
      fraction: new Prisma.Decimal(l.lineTotal).div(poTotal),
    })));
  }

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
    // Committed
    if (inBudget) {
      add(accMap, wbsId!, "committedCost", new Prisma.Decimal(pol.lineTotal));
    } else {
      unalloc.committedCost = unalloc.committedCost.add(pol.lineTotal);
    }
    // Received (via CONFIRMED receipts)
    const unitCostWithTax = pol.quantity.isZero()
      ? ZERO
      : new Prisma.Decimal(pol.lineTotal).div(pol.quantity);
    for (const rl of pol.receiptLines) {
      if (rl.purchaseReceipt.status !== "CONFIRMED") continue;
      const cost = unitCostWithTax.mul(rl.quantityReceived);
      if (inBudget) {
        add(accMap, wbsId!, "receivedCost", cost);
      } else {
        unalloc.receivedCost = unalloc.receivedCost.add(cost);
      }
    }
  }

  // C. Committed from ACTIVE subcontract lines
  for (const sl of activeSubLines) {
    const wbsId = sl.wbsNodeId;
    if (wbsId && wbsNodeIds.has(wbsId)) {
      add(accMap, wbsId, "committedCost", new Prisma.Decimal(sl.lineTotal));
    } else {
      unalloc.committedCost = unalloc.committedCost.add(sl.lineTotal);
    }
  }

  // D. Accrued from APPROVED sub cert lines
  for (const scl of subCertLines) {
    const wbsId = scl.subcontractLine.wbsNodeId;
    if (wbsId && wbsNodeIds.has(wbsId)) {
      add(accMap, wbsId, "accruedCost", new Prisma.Decimal(scl.lineTotal));
    } else {
      unalloc.accruedCost = unalloc.accruedCost.add(scl.lineTotal);
    }
  }

  // E. Accrued from ISSUED SupplierInvoices (PO-linked, proportional allocation)
  // Assumption: invoice amount allocated proportionally by PO line WBS weights.
  for (const inv of poLinkedInvoices) {
    if (!inv.purchaseOrder) continue;
    const poLines2 = inv.purchaseOrder.lines;
    const poTotal  = poLines2.reduce((s, l) => s.add(l.lineTotal), ZERO);
    if (poTotal.isZero()) {
      unalloc.accruedCost = unalloc.accruedCost.add(inv.totalAmount);
      continue;
    }
    for (const pol of poLines2) {
      const share = new Prisma.Decimal(pol.lineTotal).div(poTotal).mul(inv.totalAmount);
      const wbsId = pol.wbsNodeId;
      if (wbsId && wbsNodeIds.has(wbsId)) {
        add(accMap, wbsId, "accruedCost", share);
      } else {
        unalloc.accruedCost = unalloc.accruedCost.add(share);
      }
    }
  }

  // F. Unallocated invoices (no PO, no sub cert)
  for (const inv of unallocatedInvoices) {
    unalloc.accruedCost = unalloc.accruedCost.add(inv.totalAmount);
  }
  if (unallocatedInvoices.length > 0) {
    warnings.push(`${unallocatedInvoices.length} factura(s) de proveedor sin OC ni certificación de subcontrato vinculada — costo no asignado a WBS.`);
  }

  // G. Paid cost (CONFIRMED payments, proportional WBS allocation via invoice chain)
  for (const pmt of payments) {
    const inv = pmt.payable?.supplierInvoice;
    if (!inv) { unalloc.paidCost = unalloc.paidCost.add(pmt.amount); continue; }

    if (inv.purchaseOrderId && inv.purchaseOrder) {
      // Allocate via PO line WBS fractions
      const poLines2 = inv.purchaseOrder.lines;
      const poTotal  = poLines2.reduce((s, l) => s.add(l.lineTotal), ZERO);
      if (poTotal.isZero()) { unalloc.paidCost = unalloc.paidCost.add(pmt.amount); continue; }
      for (const pol of poLines2) {
        const share = new Prisma.Decimal(pol.lineTotal).div(poTotal).mul(pmt.amount);
        const wbsId = pol.wbsNodeId;
        if (wbsId && wbsNodeIds.has(wbsId)) add(accMap, wbsId, "paidCost", share);
        else unalloc.paidCost = unalloc.paidCost.add(share);
      }
    } else if (inv.subcontractCertificationId) {
      const fracs = subCertWbsMap.get(inv.subcontractCertificationId);
      if (!fracs) { unalloc.paidCost = unalloc.paidCost.add(pmt.amount); continue; }
      for (const f of fracs) {
        const share = f.fraction.mul(pmt.amount);
        if (f.wbsNodeId && wbsNodeIds.has(f.wbsNodeId)) add(accMap, f.wbsNodeId, "paidCost", share);
        else unalloc.paidCost = unalloc.paidCost.add(share);
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
    if (wbsNodeIds.has(wbsId)) add(accMap, wbsId, "inventoryConsumedCost", cost);
    else unalloc.inventoryConsumedCost = unalloc.inventoryConsumedCost.add(cost);
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

    // expectedCostExposure = max(committed, received, accrued) per user decision
    const expected = Prisma.Decimal.max(committed, received, accrued);
    const openCommitted = Prisma.Decimal.max(ZERO, committed.sub(accrued));
    const remaining = bCost.sub(expected);
    const variance  = remaining; // positive = saving
    const margin    = bSale.sub(expected);

    const flags: CostControlRowFlags = {
      overBudget:    expected.gt(bCost) && !bCost.isZero(),
      overCertified: acc.certifiedApproved.gt(bSale) && !bSale.isZero(),
      missingBudget: ci === null,
    };

    rows.push({
      wbsNodeId: node.id,
      wbsCode:   node.code,
      wbsName:   node.name,
      unit:      ci?.unit ?? "",
      budgetQty:       bQty.toFixed(4),
      budgetUnitCost:  bUCost.toFixed(4),
      budgetTotalCost: bCost.toFixed(2),
      budgetUnitSale:  bUSale.toFixed(4),
      budgetTotalSale: bSale.toFixed(2),
      certifiedIssued:   acc.certifiedIssued.toFixed(2),
      certifiedApproved: acc.certifiedApproved.toFixed(2),
      committedCost:         committed.toFixed(2),
      receivedCost:          received.toFixed(2),
      accruedCost:           accrued.toFixed(2),
      paidCost:              acc.paidCost.toFixed(2),
      inventoryConsumedCost: acc.inventoryConsumedCost.toFixed(2),
      operationalProgressQty: acc.operationalProgressQty.toFixed(4),
      submittedProgressQty:   acc.submittedProgressQty.toFixed(4),
      openCommittedCost:    openCommitted.toFixed(2),
      expectedCostExposure: expected.toFixed(2),
      remainingBudgetCost:  remaining.toFixed(2),
      costVariance:         variance.toFixed(2),
      projectedMargin:      margin.toFixed(2),
      flags,
    });

    // Accumulate totals
    totBudgetCost = totBudgetCost.add(bCost);
    totBudgetSale = totBudgetSale.add(bSale);
    totExpected   = totExpected.add(expected);
    totRemaining  = totRemaining.add(remaining);
    totVariance   = totVariance.add(variance);
    totMargin     = totMargin.add(margin);
    for (const k of Object.keys(acc) as (keyof WbsAcc)[]) {
      (totAcc[k] as Prisma.Decimal) = (totAcc[k] as Prisma.Decimal).add(acc[k] as Prisma.Decimal);
    }
  }

  const totals: CostControlTotals = {
    budgetTotalCost:      totBudgetCost.toFixed(2),
    budgetTotalSale:      totBudgetSale.toFixed(2),
    certifiedIssued:      totAcc.certifiedIssued.toFixed(2),
    certifiedApproved:    totAcc.certifiedApproved.toFixed(2),
    committedCost:        totAcc.committedCost.toFixed(2),
    receivedCost:         totAcc.receivedCost.toFixed(2),
    accruedCost:          totAcc.accruedCost.toFixed(2),
    paidCost:             totAcc.paidCost.toFixed(2),
    inventoryConsumedCost: totAcc.inventoryConsumedCost.toFixed(2),
    operationalProgressQty: totAcc.operationalProgressQty.toFixed(4),
    expectedCostExposure: totExpected.toFixed(2),
    remainingBudgetCost:  totRemaining.toFixed(2),
    costVariance:         totVariance.toFixed(2),
    projectedMargin:      totMargin.toFixed(2),
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
    unallocatedCommittedCost:        unalloc.committedCost.toFixed(2),
    unallocatedReceivedCost:         unalloc.receivedCost.toFixed(2),
    unallocatedAccruedCost:          unalloc.accruedCost.toFixed(2),
    unallocatedPaidCost:             unalloc.paidCost.toFixed(2),
    unallocatedInventoryConsumedCost: unalloc.inventoryConsumedCost.toFixed(2),
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
    certId: string; certNumber: number; certStatus: string;
    currentQty: string; lineTotal: string; certificationDate: Date;
  }>;
  stockMovements: Array<{
    id: string; movementDate: Date; quantity: string;
    unitCost: string | null; totalCost: string | null; sourceType: string;
  }>;
  jobsiteProgress: Array<{
    logId: string; logDate: Date; logStatus: string;
    quantityCompleted: string; physicalPct: string | null;
  }>;
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
  if (!node) throw new ServiceError("NOT_FOUND", "Nodo WBS no encontrado");
  if (node.budget.tenantId !== ctx.tenantId || node.budget.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "Acceso denegado");
  }

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");

  const incCert = gate.isEnabled("CERTIFICATIONS");
  const incProc = gate.isEnabled("PROCUREMENT");
  const incSub = gate.isEnabled("SUBCONTRACTS");
  const incInv = gate.isEnabled("INVENTORY");
  const incJl = gate.isEnabled("JOBSITE_LOG");

  const dateFrom = filters.dateFrom;
  const dateTo   = filters.dateTo;

  const [certLines, poLines, subLines, subCertLines2, stockMoves, logProgress] = await Promise.all([
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
          include: { certification: { select: { id: true, number: true, status: true, certificationDate: true } } },
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
  ]);

  const ci = node.costItem;
  return {
    wbsNodeId, wbsCode: node.code, wbsName: node.name,
    budgetItem: ci ? {
      unit: ci.unit,
      quantity: ci.quantity.toFixed(4),
      unitCostDirect: ci.unitCostDirect.toFixed(4),
      totalCostDirect: ci.totalCostDirect.toFixed(2),
      unitSalePrice: ci.unitSalePrice.toFixed(4),
      totalSalePrice: ci.totalSalePrice.toFixed(2),
    } : null,
    certificationLines: certLines.map((cl) => ({
      certNumber: cl.certification.number,
      certStatus: cl.certification.status,
      periodAmount: cl.periodAmount.toFixed(2),
      periodStart: cl.certification.periodStart,
      periodEnd: cl.certification.periodEnd,
    })),
    purchaseOrderLines: poLines.map((pol) => ({
      poId: pol.purchaseOrder.id,
      poNumber: pol.purchaseOrder.number,
      poStatus: pol.purchaseOrder.status,
      description: pol.description,
      quantity: pol.quantity.toFixed(4),
      unitPrice: pol.unitPrice.toFixed(4),
      lineTotal: pol.lineTotal.toFixed(2),
      receivedQty: pol.receivedQuantity.toFixed(4),
    })),
    subcontractLines: subLines.map((sl) => ({
      subcontractId: sl.subcontract.id,
      subcontractNumber: sl.subcontract.number,
      subcontractTitle: sl.subcontract.title,
      subcontractStatus: sl.subcontract.status,
      description: sl.description,
      quantity: sl.quantity.toFixed(4),
      unitPrice: sl.unitPrice.toFixed(4),
      lineTotal: sl.lineTotal.toFixed(2),
      certifiedQuantity: sl.certifiedQuantity.toFixed(4),
    })),
    subcontractCertLines: subCertLines2.map((scl) => ({
      certId: scl.certification.id,
      certNumber: scl.certification.number,
      certStatus: scl.certification.status,
      currentQty: scl.currentQty.toFixed(4),
      lineTotal: scl.lineTotal.toFixed(2),
      certificationDate: scl.certification.certificationDate,
    })),
    stockMovements: stockMoves.map((sm) => ({
      id: sm.id,
      movementDate: sm.movementDate,
      quantity: sm.quantity.toFixed(4),
      unitCost: sm.unitCost?.toFixed(4) ?? null,
      totalCost: sm.totalCost?.toFixed(2) ?? null,
      sourceType: sm.sourceType,
    })),
    jobsiteProgress: logProgress.map((p) => ({
      logId: p.jobsiteLog.id,
      logDate: p.jobsiteLog.logDate,
      logStatus: p.jobsiteLog.status,
      quantityCompleted: p.quantityCompleted.toFixed(4),
      physicalPct: p.physicalPct?.toFixed(2) ?? null,
    })),
  };
}
