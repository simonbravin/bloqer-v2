import { Prisma, prisma, PurchaseOrderStatus } from "@bloqer/database";
import { auditProcurement } from "./procurement-audit";
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

  const poId = await prisma.$transaction(async (tx) => {
    const activePo = await tx.purchaseOrder.count({
      where: {
        purchaseRequestId: pr.id,
        status: { notIn: ["CANCELLED"] },
      },
    });
    if (activePo > 0) {
      throw new ServiceError("CONFLICT", "Ya existe una orden de compra activa para esta solicitud");
    }

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
          productId: prl.productId,
          description: prl.description,
          unit: prl.unit,
          quantity: prl.quantity,
          unitPrice: ql.unitPrice,
          taxRate: ql.taxRate,
          lineSubtotal: ql.lineSubtotal,
          lineTax: ql.lineTax,
          lineTotal: ql.lineTotal,
          budgetUnitCostSnapshot: prl.budgetUnitCostSnapshot,
          sortOrder: prl.sortOrder,
        },
      });
    }

    await recalcPurchaseOrderTotals(tx, po.id);

    await tx.procurementQuote.update({
      where: { id: quote.id },
      data: { status: "SELECTED" },
    });
    await tx.procurementQuote.updateMany({
      where: {
        purchaseRequestId: pr.id,
        id: { not: quote.id },
        status: "RECEIVED",
      },
      data: { status: "REJECTED" },
    });

    await tx.purchaseRequest.update({
      where: { id: pr.id },
      data: { status: "QUOTE_SELECTED", updatedBy: ctx.actorUserId },
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

  await tx.purchaseRequest.update({
    where: { id: po.purchaseRequestId },
    data: { status: "COMPLETED", updatedBy: ctx.actorUserId },
  });
}

export async function onPurchaseOrderDraftCancelled(
  purchaseOrderId: string,
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { purchaseRequestId: true, selectedProcurementQuoteId: true },
  });
  if (!po?.purchaseRequestId) return;

  if (po.selectedProcurementQuoteId) {
    await tx.procurementQuote.update({
      where: { id: po.selectedProcurementQuoteId },
      data: { status: "RECEIVED" },
    });
  }

  await tx.purchaseRequest.update({
    where: { id: po.purchaseRequestId },
    data: { status: "SUBMITTED", updatedBy: ctx.actorUserId },
  });
}
