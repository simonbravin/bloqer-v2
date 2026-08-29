import { effectiveUnitPriceNet } from "@bloqer/utils";
import { loadWbsDominantCostTypes, resolveLineCostType } from "../cost-control/cost-type";
import { parseDiscountPct } from "../finance/invoice-line-money";
import { Prisma, prisma, PurchaseOrderStatus } from "@bloqer/database";
import { auditProcurement } from "./procurement-audit";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canEditPurchaseOrders } from "./procurement-access";
import { getCompanyProcurementSettings } from "./company-procurement-settings.service";
import { recalcPurchaseOrderTotals } from "./purchase-order-calc.service";

export async function selectProcurementQuoteAndCreatePo(
  procurementQuoteId: string,
  ctx: ServiceContext,
): Promise<{ purchaseOrderId: string }> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para generar órdenes de compra");
  }

  const quote = await prisma.procurementQuote.findUnique({
    where: { id: procurementQuoteId },
    include: {
      lines: { include: { purchaseRequestLine: true } },
      purchaseRequest: true,
    },
  });
  if (!quote || quote.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Cotización no encontrada");
  }
  if (quote.status !== "RECEIVED") {
    throw new ServiceError("CONFLICT", "Solo se pueden seleccionar cotizaciones recibidas");
  }
  const pr = quote.purchaseRequest;
  if (!["SUBMITTED", "QUOTE_SELECTED"].includes(pr.status)) {
    throw new ServiceError("CONFLICT", "Estado de solicitud incompatible");
  }

  const settings = await getCompanyProcurementSettings(pr.companyId, ctx);
  const receivedCount = await prisma.procurementQuote.count({
    where: { purchaseRequestId: pr.id, status: "RECEIVED" },
  });
  if (receivedCount < settings.minQuotesRequired) {
    throw new ServiceError(
      "CONFLICT",
      `Se requieren al menos ${settings.minQuotesRequired} cotizaciones recibidas antes de seleccionar`,
    );
  }

  if (quote.validUntil && quote.validUntil < new Date()) {
    throw new ServiceError("CONFLICT", "La cotización está vencida");
  }

  const wbsIdsForDominant = Array.from(
    new Set(
      quote.lines
        .map((ql) => ql.purchaseRequestLine.wbsNodeId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const wbsDominant = await loadWbsDominantCostTypes(wbsIdsForDominant, ctx.tenantId);

  const poId = await prisma.$transaction(async (tx) => {
    // Serialize selection on the SC row so concurrent selects cannot create two OCs.
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${pr.id} FOR UPDATE`;

    const activePo = await tx.purchaseOrder.count({
      where: {
        purchaseRequestId: pr.id,
        status: { notIn: ["CANCELLED"] },
      },
    });
    if (activePo > 0) {
      throw new ServiceError("CONFLICT", "Ya existe una orden de compra activa para esta solicitud");
    }

    const quoteFlip = await tx.procurementQuote.updateMany({
      where: { id: quote.id, tenantId: ctx.tenantId, status: "RECEIVED" },
      data: { status: "SELECTED" },
    });
    assertOptimisticRowUpdate(
      quoteFlip.count,
      "La cotización ya no está disponible. Recargá e intentá de nuevo.",
    );

    const prFlip = await tx.purchaseRequest.updateMany({
      where: {
        id: pr.id,
        tenantId: ctx.tenantId,
        status: { in: ["SUBMITTED", "QUOTE_SELECTED"] },
      },
      data: { status: "QUOTE_SELECTED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      prFlip.count,
      "La solicitud cambió de estado. Recargá e intentá de nuevo.",
    );

    const maxNum = await tx.purchaseOrder.aggregate({
      where: { tenantId: ctx.tenantId, companyId: pr.companyId },
      _max: { number: true },
    });
    const number = (maxNum._max.number ?? 0) + 1;

    const po = await tx.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: pr.companyId,
        projectId: pr.projectId,
        supplierContactId: quote.supplierContactId,
        purchaseRequestId: pr.id,
        selectedProcurementQuoteId: quote.id,
        originRequestedByUserId: pr.requestedByUserId,
        number,
        issueDate: new Date(),
        currency: quote.currency,
        status: PurchaseOrderStatus.DRAFT,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    for (const ql of quote.lines) {
      const prl = ql.purchaseRequestLine;
      await tx.purchaseOrderLine.create({
        data: {
          purchaseOrderId: po.id,
          wbsNodeId: prl.wbsNodeId,
          costAnalysisLineId: prl.costAnalysisLineId,
          productId: prl.productId,
          costType: resolveLineCostType({
            costType: prl.costType,
            apuCategory: null,
            wbsDominantCostType: prl.wbsNodeId ? wbsDominant.get(prl.wbsNodeId) ?? null : null,
          }),
          description: prl.description,
          unit: prl.unit,
          quantity: prl.quantity,
          unitPrice: ql.unitPrice,
          taxRate: ql.taxRate,
          discountPct: ql.discountPct,
          lineSubtotal: ql.lineSubtotal,
          lineTax: ql.lineTax,
          lineTotal: ql.lineTotal,
          budgetUnitCostSnapshot: prl.budgetUnitCostSnapshot,
          sortOrder: prl.sortOrder,
        },
      });
    }

    await recalcPurchaseOrderTotals(tx, po.id);

    await tx.procurementQuote.updateMany({
      where: {
        purchaseRequestId: pr.id,
        id: { not: quote.id },
        status: "RECEIVED",
      },
      data: { status: "REJECTED" },
    });

    await auditProcurement(
      ctx,
      "procurement_quote.selected",
      "ProcurementQuote",
      quote.id,
      { projectId: pr.projectId, companyId: pr.companyId },
      { after: { purchaseOrderId: po.id }, tx },
    );

    return po.id;
  });

  return { purchaseOrderId: poId };
}

export async function onPurchaseOrderConfirmed(
  purchaseOrderId: string,
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { purchaseRequestId: true, projectId: true, companyId: true },
  });
  if (!po?.purchaseRequestId) return;

  await tx.purchaseRequest.updateMany({
    where: {
      id: po.purchaseRequestId,
      status: { in: ["QUOTE_SELECTED", "SUBMITTED"] },
    },
    data: { status: "COMPLETED", updatedBy: ctx.actorUserId },
  });
}

/**
 * When a linked OC is cancelled (draft or later, if still allowed), rewind SC/quote
 * so Compras can seleccionar de nuevo. Only when no other active OC remains.
 */
export async function onPurchaseOrderCancelledLinkedToRequest(
  purchaseOrderId: string,
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { purchaseRequestId: true, selectedProcurementQuoteId: true },
  });
  if (!po?.purchaseRequestId) return;

  const otherActive = await tx.purchaseOrder.count({
    where: {
      purchaseRequestId: po.purchaseRequestId,
      id: { not: purchaseOrderId },
      status: { notIn: ["CANCELLED"] },
    },
  });
  if (otherActive > 0) return;

  if (po.selectedProcurementQuoteId) {
    await tx.procurementQuote.updateMany({
      where: { id: po.selectedProcurementQuoteId, status: "SELECTED" },
      data: { status: "RECEIVED" },
    });
  }

  // Restore quotes rejected when this selection won so minQuotesRequired can be met again.
  await tx.procurementQuote.updateMany({
    where: {
      purchaseRequestId: po.purchaseRequestId,
      status: "REJECTED",
    },
    data: { status: "RECEIVED" },
  });

  await tx.purchaseRequest.updateMany({
    where: {
      id: po.purchaseRequestId,
      status: { in: ["QUOTE_SELECTED", "COMPLETED"] },
    },
    data: { status: "SUBMITTED", updatedBy: ctx.actorUserId },
  });
}

/** @deprecated Use onPurchaseOrderCancelledLinkedToRequest */
export async function onPurchaseOrderDraftCancelled(
  purchaseOrderId: string,
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
): Promise<void> {
  return onPurchaseOrderCancelledLinkedToRequest(purchaseOrderId, ctx, tx);
}

/**
 * Quote-sourced OC: qty/price cannot exceed the selected competitive quote / SC lines.
 * Matches by sortOrder (preserved when generating the draft).
 */
export async function assertPoLinesWithinSelectedQuote(
  purchaseOrderId: string,
  lines: Array<{
    description: string;
    wbsNodeId: string | null;
    quantity: string | Prisma.Decimal;
    unitPrice: string | Prisma.Decimal;
    discountPct?: string | Prisma.Decimal;
    sortOrder?: number;
  }>,
  tenantId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { selectedProcurementQuoteId: true, tenantId: true },
  });
  if (!po || po.tenantId !== tenantId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  }
  if (!po.selectedProcurementQuoteId) return;

  const quote = await db.procurementQuote.findUnique({
    where: { id: po.selectedProcurementQuoteId },
    include: {
      lines: {
        include: { purchaseRequestLine: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!quote) {
    throw new ServiceError("CONFLICT", "La cotización seleccionada ya no existe");
  }

  const sorted = [...lines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (sorted.length !== quote.lines.length) {
    throw new ServiceError(
      "CONFLICT",
      "La OC proveniente de cotización debe conservar las mismas líneas que la cotización seleccionada",
    );
  }

  for (let i = 0; i < quote.lines.length; i++) {
    const ql = quote.lines[i]!;
    const prl = ql.purchaseRequestLine;
    const line = sorted[i]!;
    const qty = new Prisma.Decimal(line.quantity);
    const price = new Prisma.Decimal(line.unitPrice);
    const discountPct = parseDiscountPct(
      line.discountPct == null ? undefined : String(line.discountPct),
    );

    if (line.wbsNodeId && prl.wbsNodeId && line.wbsNodeId !== prl.wbsNodeId) {
      throw new ServiceError(
        "CONFLICT",
        `La línea "${line.description}" no puede cambiar de partida EDT respecto de la solicitud`,
      );
    }
    if (qty.greaterThan(prl.quantity)) {
      throw new ServiceError(
        "CONFLICT",
        `La cantidad de "${line.description}" no puede superar la solicitada (${prl.quantity})`,
      );
    }
    if (price.greaterThan(ql.unitPrice)) {
      throw new ServiceError(
        "CONFLICT",
        `El precio de "${line.description}" no puede superar el de la cotización seleccionada (${ql.unitPrice})`,
      );
    }
    const quoteEffective = effectiveUnitPriceNet({
      quantity: qty.toString(),
      unitPriceNet: ql.unitPrice.toString(),
      discountPct: ql.discountPct.toString(),
    });
    const poEffective = effectiveUnitPriceNet({
      quantity: qty.toString(),
      unitPriceNet: price.toString(),
      discountPct: discountPct.toString(),
    });
    if (new Prisma.Decimal(poEffective).greaterThan(new Prisma.Decimal(quoteEffective))) {
      throw new ServiceError(
        "CONFLICT",
        `El precio con descuento de "${line.description}" no puede superar el de la cotización seleccionada`,
      );
    }
  }
}
