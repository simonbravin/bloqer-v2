import { prisma, PurchaseOrderStatus } from "@bloqer/database";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

export type PurchaseOrderVarianceRow = {
  purchaseOrderId: string;
  purchaseOrderCode: string;
  purchaseOrderStatus: PurchaseOrderStatus;
  lineId: string;
  description: string;
  wbsCode: string | null;
  unit: string;
  unitPrice: string;
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
  filters?: { status?: PurchaseOrderStatus[] },
): Promise<PurchaseOrderVarianceReport> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }

  const statuses = filters?.status ?? ["SUBMITTED", "APPROVED", "CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"];

  const lines = await prisma.purchaseOrderLine.findMany({
    where: {
      purchaseOrder: {
        projectId,
        tenantId: ctx.tenantId,
        status: { in: statuses },
      },
      varianceTier: { in: [...VARIANCE_TIERS_OF_INTEREST] },
    },
    include: {
      purchaseOrder: { select: { id: true, number: true, status: true } },
      wbsNode: { select: { code: true } },
    },
    orderBy: [{ purchaseOrder: { number: "desc" } }, { sortOrder: "asc" }],
  });

  return {
    projectId,
    rows: lines.map((l) => ({
      purchaseOrderId: l.purchaseOrderId,
      purchaseOrderCode: `OC-${String(l.purchaseOrder.number).padStart(3, "0")}`,
      purchaseOrderStatus: l.purchaseOrder.status,
      lineId: l.id,
      description: l.description,
      wbsCode: l.wbsNode?.code ?? null,
      unit: l.unit,
      unitPrice: l.unitPrice.toString(),
      budgetUnitCostSnapshot: l.budgetUnitCostSnapshot?.toString() ?? null,
      variancePct: l.variancePct?.toString() ?? null,
      varianceTier: l.varianceTier,
      varianceJustification: l.varianceJustification,
    })),
  };
}
