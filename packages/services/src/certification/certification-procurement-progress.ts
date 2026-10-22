import { Prisma, prisma } from "@bloqer/database";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";
import { certificationQtyPct } from "./certification-measurement-pure";

/** Read-only cost ratios. No conversion of resource quantities into physical work. */
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
  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROCUREMENT")) return result;
  const lines = await prisma.purchaseOrderLine.findMany({
    where: {
      wbsNodeId: { in: input.items.map((item) => item.id) },
      purchaseOrder: {
        tenantId: ctx.tenantId,
        projectId: input.projectId,
        status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        issueDate: { lte: input.periodEnd },
      },
    },
    select: {
      wbsNodeId: true,
      quantity: true,
      lineSubtotal: true,
      purchaseOrder: { select: { currency: true } },
      receiptLines: {
        where: {
          purchaseReceipt: {
            tenantId: ctx.tenantId,
            projectId: input.projectId,
            status: "CONFIRMED",
            receiptDate: { lte: input.periodEnd },
          },
        },
        select: { quantityReceived: true },
      },
    },
  });
  const totals = new Map<
    string,
    { purchased: Prisma.Decimal; received: Prisma.Decimal; mixedCurrency: boolean }
  >();
  for (const line of lines) {
    if (!line.wbsNodeId) continue;
    const total = totals.get(line.wbsNodeId) ?? {
      purchased: new Prisma.Decimal(0),
      received: new Prisma.Decimal(0),
      mixedCurrency: false,
    };
    total.mixedCurrency ||= line.purchaseOrder.currency !== input.currency;
    total.purchased = total.purchased.plus(line.lineSubtotal);
    if (!line.quantity.isZero()) {
      const receivedQty = line.receiptLines.reduce(
        (sum, receipt) => sum.plus(receipt.quantityReceived),
        new Prisma.Decimal(0),
      );
      total.received = total.received.plus(line.lineSubtotal.div(line.quantity).times(receivedQty));
    }
    totals.set(line.wbsNodeId, total);
  }
  for (const item of input.items) {
    const total = totals.get(item.id);
    // Do not invent an FX conversion from the budget (which has no historical FX).
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
