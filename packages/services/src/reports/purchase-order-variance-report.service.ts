import { prisma, PurchaseOrderStatus } from "@bloqer/database";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { isCrossCompany } from "../company-scope";
import { requireProjectAccess } from "../security/access";
import { ServiceContext, ServiceError } from "../types";
import { serializeRatePctDecimal, serializeUnitPriceDecimal } from "../finance/money-decimal";
import { validateResourceVarianceDates } from "../resources/resource-variance-filters";
import { parseFilterDate } from "./report-month";

export type PurchaseOrderVarianceRow = {
  purchaseOrderId: string;
  purchaseOrderCode: string;
  purchaseOrderStatus: PurchaseOrderStatus;
  currency: string;
  lineId: string;
  description: string;
  wbsCode: string | null;
  unit: string;
  unitPrice: string;
  discountPct: string;
  budgetUnitCostSnapshot: string | null;
  variancePct: string | null;
  varianceTier: string;
  varianceJustification: string | null;
};

export type PurchaseOrderVarianceReport = {
  projectId: string;
  rows: PurchaseOrderVarianceRow[];
};

const VARIANCE_TIERS_OF_INTEREST = [
  "NOTE_REQUIRED",
  "EXTRA_APPROVAL",
  "UNIT_MISMATCH",
  "NO_BUDGET_BASELINE",
] as const;

export async function getPurchaseOrderVarianceReport(
  projectId: string,
  ctx: ServiceContext,
  filters: { status?: PurchaseOrderStatus[]; dateFrom?: string; dateTo?: string } = {},
): Promise<PurchaseOrderVarianceReport> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const project = await requireProjectAccess(projectId, ctx);
  const companyId = project.companyId ?? ctx.companyId;
  validateResourceVarianceDates(filters);

  const statuses = filters.status ?? ["SUBMITTED", "APPROVED", "CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"];
  const issueDate = {
    ...(filters.dateFrom ? { gte: parseFilterDate(filters.dateFrom, false) } : {}),
    ...(filters.dateTo ? { lte: parseFilterDate(filters.dateTo, true) } : {}),
  };

  const lines = await prisma.purchaseOrderLine.findMany({
    where: {
      purchaseOrder: {
        projectId,
        tenantId: ctx.tenantId,
        ...(companyId ? { companyId } : {}),
        status: { in: statuses },
        issueDate,
      },
      varianceTier: { in: [...VARIANCE_TIERS_OF_INTEREST] },
    },
    include: {
      purchaseOrder: { select: { number: true, status: true, companyId: true, currency: true } },
      wbsNode: {
        select: {
          code: true,
          budget: { select: { tenantId: true, projectId: true, companyId: true } },
        },
      },
    },
    orderBy: [{ purchaseOrder: { number: "desc" } }, { sortOrder: "asc" }],
  });

  return {
    projectId,
    rows: lines.map((l) => ({
      purchaseOrderId: l.purchaseOrderId,
      purchaseOrderCode: `OC-${String(l.purchaseOrder.number).padStart(3, "0")}`,
      purchaseOrderStatus: l.purchaseOrder.status,
      currency: l.purchaseOrder.currency,
      lineId: l.id,
      description: l.description,
      wbsCode: l.wbsNode?.budget.tenantId === ctx.tenantId &&
        l.wbsNode.budget.projectId === projectId &&
        !isCrossCompany(l.wbsNode.budget.companyId, { ...ctx, companyId: l.purchaseOrder.companyId })
        ? l.wbsNode.code : null,
      unit: l.unit,
      unitPrice: serializeUnitPriceDecimal(l.unitPrice),
      discountPct: serializeRatePctDecimal(l.discountPct),
      budgetUnitCostSnapshot: l.budgetUnitCostSnapshot != null
        ? serializeUnitPriceDecimal(l.budgetUnitCostSnapshot)
        : null,
      variancePct: l.variancePct != null ? serializeRatePctDecimal(l.variancePct) : null,
      varianceTier: l.varianceTier,
      varianceJustification: l.varianceJustification,
    })),
  };
}
