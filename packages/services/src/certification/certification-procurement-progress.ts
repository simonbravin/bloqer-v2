import { Prisma, prisma } from "@bloqer/database";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import {
  assertPurchaseOrderRelations,
  procurementOrderParentScopeInclude,
} from "../procurement/procurement-wbs";
import { requireProjectAccess } from "../security/access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceError, type ServiceContext } from "../types";
import { certificationQtyPct } from "./certification-measurement-pure";

/** Native cost ratios; document scope and parents are checked before using a contribution. */
export async function getCertificationProcurementProgress(
  input: {
    projectId: string;
    periodEnd: Date;
    currency: string;
    items: Array<{ id: string; budgetCost: Prisma.Decimal }>;
  },
  ctx: ServiceContext,
) {
  const result = new Map<string, { purchasedPct: string | null; receivedPct: string | null }>();
  if (!canViewProcurementProjectArea(ctx.roles)) return result;
  if (!(await getTenantModuleGate(ctx)).isEnabled("PROCUREMENT")) return result;
  await requireProjectAccess(input.projectId, ctx);
  const itemIds = new Set(input.items.map((item) => item.id));
  if (!itemIds.size) return result;
  const companyWhere = ctx.companyId ? { companyId: ctx.companyId } : {};
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId: ctx.tenantId,
      projectId: input.projectId,
      ...companyWhere,
      status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
      issueDate: { lte: input.periodEnd },
      lines: { some: { wbsNodeId: { in: [...itemIds] } } },
    },
    include: procurementOrderParentScopeInclude,
  });
  for (const order of orders) assertPurchaseOrderRelations(order);
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const receiptLines = orders.length
    ? await prisma.purchaseReceiptLine.findMany({
        where: {
          purchaseOrderLine: {
            purchaseOrderId: { in: [...ordersById.keys()] },
            wbsNodeId: { in: [...itemIds] },
          },
          purchaseReceipt: {
            tenantId: ctx.tenantId,
            projectId: input.projectId,
            ...companyWhere,
            status: "CONFIRMED",
            receiptDate: { lte: input.periodEnd },
          },
        },
        select: {
          purchaseOrderLineId: true,
          quantityReceived: true,
          purchaseOrderLine: { select: { purchaseOrderId: true } },
          purchaseReceipt: {
            select: { tenantId: true, companyId: true, projectId: true, purchaseOrderId: true },
          },
        },
      })
    : [];
  const receivedByLine = new Map<string, Prisma.Decimal>();
  for (const line of receiptLines) {
    const order = ordersById.get(line.purchaseOrderLine.purchaseOrderId);
    if (
      !order ||
      line.purchaseReceipt.purchaseOrderId !== order.id ||
      line.purchaseReceipt.tenantId !== order.tenantId ||
      line.purchaseReceipt.projectId !== order.projectId ||
      line.purchaseReceipt.companyId !== order.companyId ||
      !line.quantityReceived.isFinite() ||
      line.quantityReceived.isNegative()
    )
      throw new ServiceError(
        "CONFLICT",
        "La recepción usada para medir tiene relaciones o cantidades inconsistentes",
      );
    receivedByLine.set(
      line.purchaseOrderLineId,
      (receivedByLine.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0)).plus(
        line.quantityReceived,
      ),
    );
  }
  const totals = new Map<
    string,
    { purchased: Prisma.Decimal; received: Prisma.Decimal; mixedCurrency: boolean }
  >();
  for (const order of orders)
    for (const line of order.lines) {
      if (!line.wbsNodeId || !itemIds.has(line.wbsNodeId)) continue;
      if (
        !line.quantity.isFinite() ||
        !line.quantity.greaterThan(0) ||
        !line.lineSubtotal.isFinite() ||
        line.lineSubtotal.isNegative()
      )
        throw new ServiceError(
          "CONFLICT",
          "La compra usada para medir tiene cantidades o importes inconsistentes",
        );
      const total = totals.get(line.wbsNodeId) ?? {
        purchased: new Prisma.Decimal(0),
        received: new Prisma.Decimal(0),
        mixedCurrency: false,
      };
      total.mixedCurrency ||= order.currency !== input.currency;
      total.purchased = total.purchased.plus(line.lineSubtotal);
      total.received = total.received.plus(
        line.lineSubtotal
          .div(line.quantity)
          .times(receivedByLine.get(line.id) ?? new Prisma.Decimal(0)),
      );
      totals.set(line.wbsNodeId, total);
    }
  for (const item of input.items) {
    const total = totals.get(item.id);
    result.set(item.id, {
      purchasedPct: total?.mixedCurrency
        ? null
        : certificationQtyPct(
            (total?.purchased ?? new Prisma.Decimal(0)).toString(),
            item.budgetCost.toString(),
          ),
      receivedPct: total?.mixedCurrency
        ? null
        : certificationQtyPct(
            (total?.received ?? new Prisma.Decimal(0)).toString(),
            item.budgetCost.toString(),
          ),
    });
  }
  return result;
}
