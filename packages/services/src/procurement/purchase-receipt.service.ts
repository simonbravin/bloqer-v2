import { Prisma, prisma, PurchaseReceipt, PurchaseReceiptStatus, PurchaseOrderStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreatePurchaseReceiptInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { createReceiptStockMovement, cancelReceiptStockMovements } from "../inventory/stock-movement.service";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canViewProcurementProjectArea } from "./procurement-access";

// ─── View types ───────────────────────────────────────────────────────────────

export type PurchaseReceiptLineView = {
  id: string;
  purchaseReceiptId: string;
  purchaseOrderLineId: string;
  lineDescription: string;
  quantityReceived: string;
  notes: string | null;
};

export type PurchaseReceiptView = Omit<PurchaseReceipt, never> & {
  supplierName: string;
  purchaseOrderCode: string;
  lines: PurchaseReceiptLineView[];
};

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeReceipt(
  r: PurchaseReceipt & {
    supplierContact: { legalName: string; fantasyName: string | null };
    purchaseOrder: { number: number };
    lines: Array<{
      id: string; purchaseReceiptId: string; purchaseOrderLineId: string;
      quantityReceived: Prisma.Decimal; notes: string | null;
      purchaseOrderLine: { description: string };
    }>;
  },
): PurchaseReceiptView {
  return {
    ...r,
    supplierName:      r.supplierContact.fantasyName ?? r.supplierContact.legalName,
    purchaseOrderCode: `OC-${String(r.purchaseOrder.number).padStart(3, "0")}`,
    lines: r.lines.map((l) => ({
      id:                  l.id,
      purchaseReceiptId:   l.purchaseReceiptId,
      purchaseOrderLineId: l.purchaseOrderLineId,
      lineDescription:     l.purchaseOrderLine.description,
      quantityReceived:    l.quantityReceived.toString(),
      notes:               l.notes,
    })),
  };
}

const receiptInclude = {
  supplierContact: { select: { legalName: true, fantasyName: true } },
  purchaseOrder:   { select: { number: true } },
  lines: {
    include: { purchaseOrderLine: { select: { description: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

// ─── Status recompute ─────────────────────────────────────────────────────────

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

async function recomputePOStatus(tx: TxClient, purchaseOrderId: string): Promise<void> {
  const lines = await tx.purchaseOrderLine.findMany({
    where: { purchaseOrderId },
    select: { quantity: true, receivedQuantity: true },
  });

  const allReceived   = lines.every((l) => l.receivedQuantity.greaterThanOrEqualTo(l.quantity));
  const anyReceived   = lines.some((l) => l.receivedQuantity.greaterThan(0));
  const newStatus: PurchaseOrderStatus = allReceived
    ? PurchaseOrderStatus.RECEIVED
    : anyReceived
      ? PurchaseOrderStatus.PARTIALLY_RECEIVED
      : PurchaseOrderStatus.ISSUED;

  await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: newStatus } });
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getPurchaseReceiptById(id: string, ctx: ServiceContext): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver recepciones");
  }
  const r = await prisma.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
  if (!r) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
  if (r.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializeReceipt(r);
}

export async function listReceiptsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PurchaseReceiptView[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver recepciones");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const receipts = await prisma.purchaseReceipt.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: receiptInclude,
    orderBy: { receiptDate: "desc" },
  });
  return receipts.map(serializeReceipt);
}

export async function listReceiptsByPurchaseOrder(
  purchaseOrderId: string,
  ctx: ServiceContext,
): Promise<PurchaseReceiptView[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver recepciones");
  }
  const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const receipts = await prisma.purchaseReceipt.findMany({
    where: { purchaseOrderId, tenantId: ctx.tenantId },
    include: receiptInclude,
    orderBy: { receiptDate: "desc" },
  });
  return receipts.map(serializeReceipt);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPurchaseReceipt(
  input: CreatePurchaseReceiptInput,
  ctx: ServiceContext,
): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "PROCUREMENT")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear recepciones");
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    include: { lines: true },
  });
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  // BR-PUR-004: receipt only allowed on ISSUED / PARTIALLY_RECEIVED / RECEIVED
  if (!["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(po.status)) {
    throw new ServiceError(
      "CONFLICT",
      `No se puede registrar recepción en una orden con estado "${po.status}". Primero emita la orden.`,
    );
  }

  // Validate each line exists on PO and quantity > 0 and doesn't exceed remaining
  for (const inputLine of input.lines) {
    const poLine = po.lines.find((l) => l.id === inputLine.purchaseOrderLineId);
    if (!poLine) {
      throw new ServiceError("NOT_FOUND", `Línea de OC no encontrada: ${inputLine.purchaseOrderLineId}`);
    }
    const qtyReceived = new Prisma.Decimal(inputLine.quantityReceived);
    if (qtyReceived.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", `La cantidad recibida debe ser mayor a cero: ${poLine.description}`);
    }
    const remaining = poLine.quantity.minus(poLine.receivedQuantity);
    if (qtyReceived.greaterThan(remaining)) {
      throw new ServiceError(
        "CONFLICT",
        `La cantidad recibida (${qtyReceived}) excede la cantidad pendiente (${remaining}) para: ${poLine.description}`,
      );
    }
  }

  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseReceipt.create({
      data: {
        tenantId:         ctx.tenantId,
        companyId:        po.companyId,
        projectId:        po.projectId,
        purchaseOrderId:  po.id,
        supplierContactId: po.supplierContactId,
        warehouseId:      input.warehouseId ?? null,
        receiptDate:      new Date(input.receiptDate),
        status:           PurchaseReceiptStatus.DRAFT,
        notes:            input.notes ?? null,
        createdBy:        ctx.actorUserId,
        updatedBy:        ctx.actorUserId,
      },
    });

    for (const inputLine of input.lines) {
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId:   created.id,
          purchaseOrderLineId: inputLine.purchaseOrderLineId,
          quantityReceived:    new Prisma.Decimal(inputLine.quantityReceived),
          notes:               inputLine.notes ?? null,
        },
      });
    }

    return tx.purchaseReceipt.findUniqueOrThrow({ where: { id: created.id }, include: receiptInclude });
  });

  await log({
    tenantId:   ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:     "PURCHASE_RECEIPT_CREATED",
    entityType: "PurchaseReceipt",
    entityId:   receipt.id,
    after:      { purchaseOrderId: po.id },
  });

  return serializeReceipt(receipt);
}

export async function confirmPurchaseReceipt(id: string, ctx: ServiceContext): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "PROCUREMENT")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para confirmar recepciones");
  }

  const existing = await prisma.purchaseReceipt.findUnique({
    where: { id },
    include: {
      lines: {
        include: { purchaseOrderLine: { select: { productId: true, unitPrice: true } } },
      },
    },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `La recepción en estado "${existing.status}" no puede confirmarse.`);
  }

  const receipt = await prisma.$transaction(async (tx) => {
    // Increment receivedQuantity on each PO line
    for (const line of existing.lines) {
      await tx.purchaseOrderLine.update({
        where: { id: line.purchaseOrderLineId },
        data: { receivedQuantity: { increment: line.quantityReceived } },
      });
    }

    // Recompute PO status
    await recomputePOStatus(tx, existing.purchaseOrderId);

    // Create StockMovement IN for product-linked lines when warehouseId is set
    if (existing.warehouseId) {
      for (const line of existing.lines) {
        const productId = line.purchaseOrderLine.productId;
        if (!productId) continue;
        await createReceiptStockMovement(tx, {
          tenantId:              existing.tenantId,
          companyId:             existing.companyId,
          warehouseId:           existing.warehouseId,
          productId,
          projectId:             existing.projectId ?? null,
          purchaseReceiptId:     existing.id,
          purchaseReceiptLineId: line.id,
          quantity:              line.quantityReceived,
          unitCost:              line.purchaseOrderLine.unitPrice,
          movementDate:          existing.receiptDate,
          createdBy:             ctx.actorUserId,
        });
      }
    }

    return tx.purchaseReceipt.update({
      where: { id },
      data: { status: PurchaseReceiptStatus.CONFIRMED, updatedBy: ctx.actorUserId },
      include: receiptInclude,
    });
  });

  await log({
    tenantId:   ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:     "PURCHASE_RECEIPT_CONFIRMED",
    entityType: "PurchaseReceipt",
    entityId:   id,
    after:      { purchaseOrderId: existing.purchaseOrderId },
  });

  return serializeReceipt(receipt);
}

export async function cancelPurchaseReceipt(id: string, ctx: ServiceContext): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "PROCUREMENT")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para anular recepciones");
  }

  const existing = await prisma.purchaseReceipt.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  if (existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "La recepción ya está anulada");
  }

  const receipt = await prisma.$transaction(async (tx) => {
    if (existing.status === "CONFIRMED") {
      // Reverse exact quantities — no silent clamp per user spec
      for (const line of existing.lines) {
        const poLine = await tx.purchaseOrderLine.findUnique({ where: { id: line.purchaseOrderLineId } });
        if (!poLine) throw new ServiceError("NOT_FOUND", "Línea de OC no encontrada al revertir recepción");
        const newQty = poLine.receivedQuantity.minus(line.quantityReceived);
        if (newQty.lessThan(0)) {
          throw new ServiceError(
            "CONFLICT",
            `Error de integridad: la reversión de cantidades resultaría en valor negativo para "${poLine.description}". Contacte soporte.`,
          );
        }
        await tx.purchaseOrderLine.update({
          where: { id: line.purchaseOrderLineId },
          data: { receivedQuantity: newQty },
        });
      }
      await recomputePOStatus(tx, existing.purchaseOrderId);
      // Cancel linked stock movements atomically
      await cancelReceiptStockMovements(tx, existing.id);
    }

    return tx.purchaseReceipt.update({
      where: { id },
      data: { status: PurchaseReceiptStatus.CANCELLED, updatedBy: ctx.actorUserId },
      include: receiptInclude,
    });
  });

  await log({
    tenantId:   ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:     "PURCHASE_RECEIPT_CANCELLED",
    entityType: "PurchaseReceipt",
    entityId:   id,
    after:      { wasConfirmed: existing.status === "CONFIRMED" },
  });

  return serializeReceipt(receipt);
}
