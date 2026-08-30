import { Prisma, prisma, PurchaseReceipt, PurchaseReceiptStatus, PurchaseOrderStatus } from "@bloqer/database";
import type { CreatePurchaseReceiptInput } from "@bloqer/validators";
import { auditProcurement } from "./procurement-audit";
import { assertPoEligibleForReceipt, assertReceiptQtyWithinRemaining } from "./purchase-receipt-guards";
import { getCompanyProcurementSettingsForProject } from "./company-procurement-settings.service";
import { createReceiptStockMovement, cancelReceiptStockMovements } from "../inventory/stock-movement.service";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import {
  canEditPurchaseReceipts,
  canViewProcurementProjectArea,
} from "./procurement-access";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { requireProjectInTenant } from "../project/require-project-in-tenant";
import { serializeQtyDecimal } from "../finance/money-decimal";
import {
  resolveUserDisplayNames,
  userDisplayNameFromMap,
} from "../user/resolve-user-display-names";
import {
  purchaseReceiptReplayMatches,
  requireIdempotencyKey,
  withIdempotentCreate,
} from "../idempotency/idempotency";
import { completeMilestonesFromPurchaseReceipt } from "../schedule/schedule-milestone-from-receipt";

/** Confirmer is stored on confirm as `updatedBy`; after cancel that field is the canceller. */
function receiptActorUserId(r: {
  status: string;
  createdBy: string | null;
  updatedBy: string | null;
}): string | null {
  if (r.status === PurchaseReceiptStatus.CONFIRMED) {
    return r.updatedBy ?? r.createdBy;
  }
  return r.createdBy;
}

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
  receivedByName: string | null;
  lines: PurchaseReceiptLineView[];
  /**
   * [D-108] Non-blocking warning when auto-draft AP failed after confirm.
   * Only set on the confirm mutation response (not on subsequent reads).
   */
  autoDraftApWarning?: string | null;
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
  receivedByName: string | null = null,
): PurchaseReceiptView {
  return {
    ...r,
    supplierName:      r.supplierContact.fantasyName ?? r.supplierContact.legalName,
    purchaseOrderCode: `OC-${String(r.purchaseOrder.number).padStart(3, "0")}`,
    receivedByName,
    lines: r.lines.map((l) => ({
      id:                  l.id,
      purchaseReceiptId:   l.purchaseReceiptId,
      purchaseOrderLineId: l.purchaseOrderLineId,
      lineDescription:     l.purchaseOrderLine.description,
      quantityReceived:    serializeQtyDecimal(l.quantityReceived),
      notes:               l.notes,
    })),
  };
}

async function toPurchaseReceiptView(
  r: Parameters<typeof serializeReceipt>[0],
): Promise<PurchaseReceiptView> {
  const actorId = receiptActorUserId(r);
  const nameById = await resolveUserDisplayNames([actorId]);
  return serializeReceipt(r, userDisplayNameFromMap(nameById, actorId));
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
      : PurchaseOrderStatus.CONFIRMED;

  // Never resurrect CANCELLED / DRAFT / SUBMITTED / APPROVED via receipt recompute.
  await tx.purchaseOrder.updateMany({
    where: {
      id: purchaseOrderId,
      status: {
        in: [
          PurchaseOrderStatus.CONFIRMED,
          PurchaseOrderStatus.PARTIALLY_RECEIVED,
          PurchaseOrderStatus.RECEIVED,
        ],
      },
    },
    data: { status: newStatus },
  });
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
  return toPurchaseReceiptView(r);
}

export async function listReceiptsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PurchaseReceiptView[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver recepciones");
  }
  await requireProjectInTenant(projectId, ctx.tenantId);

  const receipts = await prisma.purchaseReceipt.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: receiptInclude,
    orderBy: { receiptDate: "desc" },
  });
  const actorIds = receipts.map((row) => receiptActorUserId(row));
  const nameById = await resolveUserDisplayNames(actorIds);
  return receipts.map((row) =>
    serializeReceipt(row, userDisplayNameFromMap(nameById, receiptActorUserId(row))),
  );
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
  const actorIds = receipts.map((row) => receiptActorUserId(row));
  const nameById = await resolveUserDisplayNames(actorIds);
  return receipts.map((row) =>
    serializeReceipt(row, userDisplayNameFromMap(nameById, receiptActorUserId(row))),
  );
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPurchaseReceipt(
  input: CreatePurchaseReceiptInput,
  ctx: ServiceContext,
): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseReceipts(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear recepciones");
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    include: { lines: true },
  });
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(po.projectId, ctx.tenantId);

  // BR-PUR-004: receipt only allowed on CONFIRMED+
  assertPoEligibleForReceipt(po.status);

  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const existingByKey = await prisma.purchaseReceipt.findFirst({
    where: { tenantId: ctx.tenantId, idempotencyKey },
    include: receiptInclude,
  });
  if (existingByKey) {
    if (!purchaseReceiptReplayMatches(existingByKey, input)) {
      throw new ServiceError(
        "CONFLICT",
        "Esta operación ya se registró con datos distintos. Recargá e intentá de nuevo.",
      );
    }
    return toPurchaseReceiptView(existingByKey);
  }

  const settings = await getCompanyProcurementSettingsForProject(po.projectId, ctx);
  const tolerancePct = new Prisma.Decimal(settings.overReceiptTolerancePct);

  if (input.warehouseId) {
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: input.warehouseId,
        tenantId: ctx.tenantId,
        status: "ACTIVE",
      },
      select: { id: true, companyId: true, projectId: true },
    });
    if (!warehouse) {
      throw new ServiceError("NOT_FOUND", "Depósito no encontrado o inactivo");
    }
    if (warehouse.companyId !== po.companyId) {
      throw new ServiceError("CONFLICT", "El depósito no pertenece a la misma empresa que la orden");
    }
    if (warehouse.projectId && warehouse.projectId !== po.projectId) {
      throw new ServiceError("CONFLICT", "El depósito está asignado a otra obra");
    }
  }

  // Count qty already reserved on other DRAFT receipts so create cannot over-allocate.
  const draftReservedRows = await prisma.purchaseReceiptLine.findMany({
    where: {
      purchaseOrderLineId: { in: po.lines.map((l) => l.id) },
      purchaseReceipt: {
        purchaseOrderId: po.id,
        status: "DRAFT",
        tenantId: ctx.tenantId,
      },
    },
    select: { purchaseOrderLineId: true, quantityReceived: true },
  });
  const draftReservedByLine = new Map<string, Prisma.Decimal>();
  for (const row of draftReservedRows) {
    const prev = draftReservedByLine.get(row.purchaseOrderLineId) ?? new Prisma.Decimal(0);
    draftReservedByLine.set(row.purchaseOrderLineId, prev.plus(row.quantityReceived));
  }

  // Validate each line exists on PO and quantity > 0 within remaining + over-receipt tolerance ([D-067])
  for (const inputLine of input.lines) {
    const poLine = po.lines.find((l) => l.id === inputLine.purchaseOrderLineId);
    if (!poLine) {
      throw new ServiceError("NOT_FOUND", `Línea de OC no encontrada: ${inputLine.purchaseOrderLineId}`);
    }
    const qtyReceived = new Prisma.Decimal(inputLine.quantityReceived);
    const draftReserved = draftReservedByLine.get(poLine.id) ?? new Prisma.Decimal(0);
    const alreadyReceived = poLine.receivedQuantity.plus(draftReserved);
    const remaining = poLine.quantity.minus(alreadyReceived);
    assertReceiptQtyWithinRemaining(qtyReceived, remaining, poLine.description, {
      orderQuantity: poLine.quantity,
      alreadyReceived,
      tolerancePct,
    });
  }

  const receipt = await withIdempotentCreate({
    findExisting: () =>
      prisma.purchaseReceipt.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey },
        include: receiptInclude,
      }),
    payloadsMatch: (existing) => purchaseReceiptReplayMatches(existing, input),
    create: async () => {
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.purchaseReceipt.create({
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
            idempotencyKey,
            createdBy:        ctx.actorUserId,
            updatedBy:        ctx.actorUserId,
          },
        });

        for (const inputLine of input.lines) {
          await tx.purchaseReceiptLine.create({
            data: {
              purchaseReceiptId:   row.id,
              purchaseOrderLineId: inputLine.purchaseOrderLineId,
              quantityReceived:    new Prisma.Decimal(inputLine.quantityReceived),
              notes:               inputLine.notes ?? null,
            },
          });
        }

        const full = await tx.purchaseReceipt.findUniqueOrThrow({
          where: { id: row.id },
          include: receiptInclude,
        });
        await auditProcurement(
          ctx,
          "purchase_receipt.created",
          "PurchaseReceipt",
          full.id,
          { projectId: full.projectId, companyId: full.companyId },
          { after: { purchaseOrderId: po.id, number: po.number }, tx },
        );
        return full;
      });
      return created;
    },
  });

  return toPurchaseReceiptView(receipt);
}

export async function confirmPurchaseReceipt(id: string, ctx: ServiceContext): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseReceipts(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para confirmar recepciones");
  }

  const existing = await prisma.purchaseReceipt.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          purchaseOrderLine: {
            select: {
              id: true,
              productId: true,
              unitPrice: true,
              wbsNodeId: true,
              description: true,
              quantity: true,
              receivedQuantity: true,
            },
          },
        },
      },
    },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `La recepción en estado "${existing.status}" no puede confirmarse.`);
  }

  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, ctx);
  const tolerancePct = new Prisma.Decimal(settings.overReceiptTolerancePct);

  const receipt = await prisma.$transaction(async (tx) => {
    // Claim DRAFT first so concurrent cancel cannot race after stock/PO mutations.
    await tx.$queryRaw`
      SELECT id FROM purchase_receipts
      WHERE id = ${id} AND "tenantId" = ${ctx.tenantId}
      FOR UPDATE
    `;
    const confirmed = await tx.purchaseReceipt.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: { status: PurchaseReceiptStatus.CONFIRMED, updatedBy: ctx.actorUserId },
    });
    if (confirmed.count !== 1) {
      throw new ServiceError("CONFLICT", "La recepción ya no está en borrador");
    }

    // Lock PO lines then re-assert remaining (closes concurrent confirm race) [BR-PUR-006].
    for (const line of existing.lines) {
      await tx.$queryRaw`
        SELECT id FROM purchase_order_lines WHERE id = ${line.purchaseOrderLineId} FOR UPDATE
      `;
      const poLine = await tx.purchaseOrderLine.findUniqueOrThrow({
        where: { id: line.purchaseOrderLineId },
        select: {
          id: true,
          description: true,
          quantity: true,
          receivedQuantity: true,
        },
      });
      const remaining = poLine.quantity.minus(poLine.receivedQuantity);
      assertReceiptQtyWithinRemaining(line.quantityReceived, remaining, poLine.description, {
        orderQuantity: poLine.quantity,
        alreadyReceived: poLine.receivedQuantity,
        tolerancePct,
      });
    }

    // Increment receivedQuantity on each PO line
    for (const line of existing.lines) {
      await tx.purchaseOrderLine.update({
        where: { id: line.purchaseOrderLineId },
        data: { receivedQuantity: { increment: line.quantityReceived } },
      });
    }

    // D-104 / BR-SCH-005 — complete linked milestones after quantities land
    const receiptWbsIds = existing.lines
      .map((l) => l.purchaseOrderLine.wbsNodeId)
      .filter((id): id is string => Boolean(id));
    if (receiptWbsIds.length > 0) {
      await completeMilestonesFromPurchaseReceipt({
        projectId: existing.projectId,
        wbsNodeIds: receiptWbsIds,
        receiptId: existing.id,
        receiptDate: existing.receiptDate,
        ctx,
        tx,
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
          wbsNodeId:             line.purchaseOrderLine.wbsNodeId,
          purchaseReceiptId:     existing.id,
          purchaseReceiptLineId: line.id,
          quantity:              line.quantityReceived,
          unitCost:              line.purchaseOrderLine.unitPrice,
          movementDate:          existing.receiptDate,
          createdBy:             ctx.actorUserId,
        });
      }
    }

    const receipt = await tx.purchaseReceipt.findUniqueOrThrow({
      where: { id },
      include: receiptInclude,
    });

    const po = await tx.purchaseOrder.findUnique({
      where: { id: existing.purchaseOrderId },
      select: { number: true },
    });
    await auditProcurement(
      ctx,
      "purchase_receipt.confirmed",
      "PurchaseReceipt",
      id,
      { projectId: existing.projectId, companyId: existing.companyId },
      { after: { purchaseOrderId: existing.purchaseOrderId, number: po?.number ?? null }, tx },
    );
    return receipt;
  });

  // [D-108] Best-effort AP draft after confirm — never rolls back the receipt.
  let autoDraftApWarning: string | null = null;
  if (settings.autoDraftApInvoiceOnReceipt) {
    try {
      const { isTenantModuleEnabled } = await import("../tenant-modules/tenant-module.service");
      const apEnabled = await isTenantModuleEnabled(ctx, "AP");
      if (!apEnabled) {
        autoDraftApWarning =
          "La recepción quedó confirmada, pero el módulo CxP está deshabilitado: no se creó el borrador de factura.";
      } else {
        const { createSupplierInvoiceDraftFromPurchaseOrder, getPurchaseOrderBillingSummary } =
          await import("../ap/supplier-invoice-from-po.service");
        const billing = await getPurchaseOrderBillingSummary(existing.purchaseOrderId, ctx);
        const pending = new Prisma.Decimal(billing.pendingToInvoice);
        if (billing.hasReceivedQuantity && pending.greaterThan(0)) {
          await createSupplierInvoiceDraftFromPurchaseOrder(
            {
              projectId: existing.projectId,
              purchaseOrderId: existing.purchaseOrderId,
              purchaseReceiptId: id,
              basis: "received",
            },
            ctx,
            { asSystemFromReceiptPolicy: true },
          );
        }
      }
    } catch (err) {
      // Receipt already confirmed; Finance can still use Pendientes / panel billing.
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[D-108] auto-draft AP after receipt failed", {
        receiptId: id,
        purchaseOrderId: existing.purchaseOrderId,
        message,
      });
      autoDraftApWarning = `La recepción quedó confirmada, pero no se pudo crear el borrador de factura: ${message}`;
    }
  }

  const view = await toPurchaseReceiptView(receipt);
  return autoDraftApWarning ? { ...view, autoDraftApWarning } : view;
}

export async function cancelPurchaseReceipt(id: string, ctx: ServiceContext): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseReceipts(ctx.roles)) {
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
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);

  const receipt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_receipts WHERE id = ${id} FOR UPDATE`;
    const before = await tx.purchaseReceipt.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (before.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La recepción ya está anulada");
    }

    const cancelled = await tx.purchaseReceipt.updateMany({
      where: { id, tenantId: ctx.tenantId, status: before.status },
      data: { status: PurchaseReceiptStatus.CANCELLED, updatedBy: ctx.actorUserId },
    });
    if (cancelled.count !== 1) {
      throw new ServiceError("CONFLICT", "La recepción ya no se puede anular (estado cambió)");
    }

    if (before.status === "CONFIRMED") {
      for (const line of existing.lines) {
        await tx.$queryRaw`
          SELECT id FROM purchase_order_lines WHERE id = ${line.purchaseOrderLineId} FOR UPDATE
        `;
        const poLine = await tx.purchaseOrderLine.findUniqueOrThrow({
          where: { id: line.purchaseOrderLineId },
        });
        const newQty = poLine.receivedQuantity.minus(line.quantityReceived);
        if (newQty.lessThan(0)) {
          throw new ServiceError(
            "CONFLICT",
            `Error de integridad: la reversión de cantidades resultaría en valor negativo para "${poLine.description}". Contacte soporte.`,
          );
        }
        await tx.purchaseOrderLine.update({
          where: { id: line.purchaseOrderLineId },
          data: { receivedQuantity: { decrement: line.quantityReceived } },
        });
      }
      await recomputePOStatus(tx, existing.purchaseOrderId);
      await cancelReceiptStockMovements(tx, existing.id, existing.tenantId);
    }

    const receipt = await tx.purchaseReceipt.findUniqueOrThrow({
      where: { id },
      include: receiptInclude,
    });

    const po = await tx.purchaseOrder.findUnique({
      where: { id: existing.purchaseOrderId },
      select: { number: true },
    });
    await auditProcurement(
      ctx,
      "purchase_receipt.cancelled",
      "PurchaseReceipt",
      id,
      { projectId: existing.projectId, companyId: existing.companyId },
      {
        after: {
          purchaseOrderId: existing.purchaseOrderId,
          number: po?.number ?? null,
          wasConfirmed: before.status === "CONFIRMED",
        },
        tx,
      },
    );
    return receipt;
  });

  return toPurchaseReceiptView(receipt);
}
