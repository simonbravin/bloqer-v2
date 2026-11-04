import { Prisma, prisma, PurchaseReceipt, PurchaseReceiptStatus, PurchaseOrderStatus } from "@bloqer/database";
import type { CreatePurchaseReceiptInput, UpdatePurchaseReceiptInput } from "@bloqer/validators";
import { auditProcurement } from "./procurement-audit";
import { assertPoEligibleForReceipt, assertReceiptQtyWithinRemaining } from "./purchase-receipt-guards";
import { getCompanyProcurementSettingsForProject } from "./company-procurement-settings.service";
import { createReceiptStockMovement, cancelReceiptStockMovements } from "../inventory/stock-movement.service";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { isCrossCompany } from "../company-scope";
import { assertPurchaseOrderRelations, lockProcurementCompanyForNumbering, procurementOrderParentScopeInclude } from "./procurement-wbs";
import {
  canEditPurchaseReceipts,
  canViewProcurementProjectArea,
} from "./procurement-access";
import { assertProjectAllowsOperationalMutation, lockProjectForOperationalMutation } from "../project/project-operational-guard";
import { requireProjectAccess, requireProjectAccessIfPresent } from "../security/access";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";

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
import type { PurchaseOrderLineView } from "./purchase-order.service";

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
  /** Null for historical receipts, which keep their UUID without backfilling a number (D-127). */
  number: number | null;
  code: string;
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
  r: Prisma.PurchaseReceiptGetPayload<{ include: typeof receiptInclude }>,
  receivedByName: string | null = null,
): PurchaseReceiptView {
  assertReceiptRelations(r);
  const { supplierContact, purchaseOrder, lines, warehouse, ...header } = r;
  void warehouse; // Checked relation metadata is deliberately excluded from the DTO.
  return {
    ...header,
    number: r.number ?? null,
    code: r.number != null ? `RC-${String(r.number).padStart(3, "0")}` : `Recepción histórica ${r.id}`,
    supplierName:      supplierContact.fantasyName ?? supplierContact.legalName,
    purchaseOrderCode: `OC-${String(purchaseOrder.number).padStart(3, "0")}`,
    receivedByName,
    lines: lines.map((l) => ({
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
  assertReceiptRelations(r);
  const actorId = receiptActorUserId(r);
  const nameById = await resolveUserDisplayNames([actorId]);
  return serializeReceipt(r, userDisplayNameFromMap(nameById, actorId));
}

const receiptInclude = {
  supplierContact: { select: { legalName: true, fantasyName: true, tenantId: true } },
  purchaseOrder: { include: procurementOrderParentScopeInclude },
  warehouse: { select: { tenantId: true, companyId: true, projectId: true } },
  lines: {
    include: { purchaseOrderLine: true },
    orderBy: { createdAt: "asc" as const },
  },
};

function assertReceiptRelations(receipt: Prisma.PurchaseReceiptGetPayload<{ include: typeof receiptInclude }>): void {
  const order = receipt.purchaseOrder;
  if (order.tenantId !== receipt.tenantId || order.companyId !== receipt.companyId || order.projectId !== receipt.projectId ||
      order.supplierContactId !== receipt.supplierContactId || receipt.supplierContact.tenantId !== receipt.tenantId ||
      receipt.lines.some((line) => !order.lines.some((orderLine) => orderLine.id === line.purchaseOrderLineId)) ||
      (receipt.warehouse && (receipt.warehouse.tenantId !== receipt.tenantId || receipt.warehouse.companyId !== receipt.companyId ||
        (receipt.warehouse.projectId && receipt.warehouse.projectId !== receipt.projectId)))) {
    throw new ServiceError("CONFLICT", "La recepción contiene relaciones inconsistentes con su orden, empresa u obra");
  }
  assertPurchaseOrderRelations(order);
}

async function orderForReceiptRead(id: string, ctx: ServiceContext) {
  const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: procurementOrderParentScopeInclude });
  if (!order || order.tenantId !== ctx.tenantId || isCrossCompany(order.companyId, ctx)) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  await requireProjectAccessIfPresent(order.projectId, ctx);
  assertPurchaseOrderRelations(order);
  return order;
}

/** Duplicate PO-line entries are valid only when their aggregate fits BR-PUR-006. */
function assertReceiptLinesFit(
  inputLines: Array<{ purchaseOrderLineId: string; quantityReceived: string | Prisma.Decimal }>,
  orderLines: Array<{ id: string; description: string; quantity: Prisma.Decimal; receivedQuantity: Prisma.Decimal }>,
  tolerancePct: Prisma.Decimal,
  reserved = new Map<string, Prisma.Decimal>(),
): void {
  if (inputLines.length === 0) throw new ServiceError("VALIDATION", "Debe incluir al menos una línea");
  const totals = new Map<string, Prisma.Decimal>();
  for (const input of inputLines) {
    const quantity = new Prisma.Decimal(serializeQtyDecimal(input.quantityReceived));
    if (!quantity.isFinite() || quantity.lte(0)) throw new ServiceError("VALIDATION", "La cantidad recibida debe ser mayor a cero");
    totals.set(input.purchaseOrderLineId, (totals.get(input.purchaseOrderLineId) ?? new Prisma.Decimal(0)).plus(quantity));
  }
  for (const [id, total] of totals) {
    const line = orderLines.find((row) => row.id === id);
    if (!line) throw new ServiceError("CONFLICT", "Una línea de recepción no pertenece a la orden de compra");
    const alreadyReceived = line.receivedQuantity.plus(reserved.get(id) ?? 0);
    assertReceiptQtyWithinRemaining(total, line.quantity.minus(alreadyReceived), line.description, { orderQuantity: line.quantity, alreadyReceived, tolerancePct });
  }
}

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

// ─── Draft reservation helpers ────────────────────────────────────────────────

async function loadDraftReservedByLine(
  purchaseOrderId: string,
  purchaseOrderLineIds: string[],
  ctx: ServiceContext,
  opts?: { excludeReceiptId?: string; db?: TxClient },
): Promise<Map<string, Prisma.Decimal>> {
  if (purchaseOrderLineIds.length === 0) return new Map();
  const draftReservedRows = await (opts?.db ?? prisma).purchaseReceiptLine.findMany({
    where: {
      purchaseOrderLineId: { in: purchaseOrderLineIds },
      purchaseReceipt: {
        purchaseOrderId,
        status: "DRAFT",
        tenantId: ctx.tenantId,
        ...(ctx.companyId ? { companyId: ctx.companyId } : {}), // companyId NOT NULL
        ...(opts?.excludeReceiptId ? { id: { not: opts.excludeReceiptId } } : {}),
      },
    },
    select: { purchaseOrderLineId: true, quantityReceived: true },
  });
  const draftReservedByLine = new Map<string, Prisma.Decimal>();
  for (const row of draftReservedRows) {
    const prev = draftReservedByLine.get(row.purchaseOrderLineId) ?? new Prisma.Decimal(0);
    draftReservedByLine.set(row.purchaseOrderLineId, prev.plus(row.quantityReceived));
  }
  return draftReservedByLine;
}

/**
 * Active DRAFT receipt for a PO (at most one is enforced on create).
 * Used to resume the same ficha instead of opening /recepciones/nueva again.
 */
export async function findActiveDraftReceiptId(
  purchaseOrderId: string,
  ctx: ServiceContext,
): Promise<string | null> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver recepciones");
  }
  const po = await orderForReceiptRead(purchaseOrderId, ctx);

  const draft = await prisma.purchaseReceipt.findFirst({
    where: { purchaseOrderId, tenantId: ctx.tenantId, companyId: po.companyId, projectId: po.projectId, status: "DRAFT" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return draft?.id ?? null;
}

/** How many DRAFT receipts exist for a PO (optionally excluding one). */
export async function countActiveDraftReceiptsForPo(
  purchaseOrderId: string,
  ctx: ServiceContext,
  opts?: { excludeReceiptId?: string },
): Promise<number> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver recepciones");
  }
  const po = await orderForReceiptRead(purchaseOrderId, ctx);
  return prisma.purchaseReceipt.count({
    where: {
      purchaseOrderId,
      tenantId: ctx.tenantId,
      companyId: po.companyId,
      projectId: po.projectId,
      status: "DRAFT",
      ...(opts?.excludeReceiptId ? { id: { not: opts.excludeReceiptId } } : {}),
    },
  });
}

/**
 * Patch PO line `remainingQuantity` so receipt forms match server create/update
 * (confirmed received + other DRAFT reservations).
 */
export function withDraftAwareRemainingQuantity(
  lines: PurchaseOrderLineView[],
  draftReservedByLine: Map<string, Prisma.Decimal>,
): PurchaseOrderLineView[] {
  return lines.map((line) => {
    const ordered = new Prisma.Decimal(line.quantity);
    const confirmed = new Prisma.Decimal(line.receivedQuantity);
    const draftReserved = draftReservedByLine.get(line.id) ?? new Prisma.Decimal(0);
    const available = ordered.minus(confirmed).minus(draftReserved);
    return {
      ...line,
      remainingQuantity: available.lessThan(0)
        ? serializeQtyDecimal(0)
        : serializeQtyDecimal(available),
    };
  });
}

/** Load draft-aware remaining for receipt create/edit forms. */
export async function getPoLinesForReceiptForm(
  purchaseOrderId: string,
  poLines: PurchaseOrderLineView[],
  ctx: ServiceContext,
  opts?: { excludeReceiptId?: string },
): Promise<PurchaseOrderLineView[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) throw new ServiceError("FORBIDDEN", "Sin permisos para ver recepciones");
  const po = await orderForReceiptRead(purchaseOrderId, ctx);
  if (poLines.some((line) => !po.lines.some((current) => current.id === line.id))) throw new ServiceError("CONFLICT", "Las líneas no pertenecen a la orden de compra");
  const draftReserved = await loadDraftReservedByLine(
    purchaseOrderId,
    poLines.map((l) => l.id),
    { ...ctx, companyId: po.companyId },
    opts,
  );
  return withDraftAwareRemainingQuantity(poLines, draftReserved);
}

async function assertWarehouseOkForPo(
  warehouseId: string,
  po: { companyId: string; projectId: string },
  ctx: ServiceContext,
  db: TxClient = prisma,
): Promise<void> {
  const warehouse = await db.warehouse.findFirst({
    where: {
      id: warehouseId,
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

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getPurchaseReceiptById(id: string, ctx: ServiceContext): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver recepciones");
  }
  const r = await prisma.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
  if (!r) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
  if (r.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(r.companyId, ctx)) throw new ServiceError("FORBIDDEN", "La recepción no pertenece a la empresa activa");
  await requireProjectAccessIfPresent(r.projectId, ctx);
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
  await requireProjectAccess(projectId, ctx);

  const receipts = await prisma.purchaseReceipt.findMany({
    where: { projectId, tenantId: ctx.tenantId, ...(ctx.companyId ? { companyId: ctx.companyId } : {}) }, // companyId NOT NULL
    include: receiptInclude,
    orderBy: { receiptDate: "desc" },
  });
  for (const receipt of receipts) assertReceiptRelations(receipt);
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
  const po = await orderForReceiptRead(purchaseOrderId, ctx);

  const receipts = await prisma.purchaseReceipt.findMany({
    where: { purchaseOrderId, tenantId: ctx.tenantId, projectId: po.projectId, companyId: po.companyId },
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

  const po = await orderForReceiptRead(input.purchaseOrderId, ctx);
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(po.projectId, ctx);

  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const checkedReplay = (existing: Prisma.PurchaseReceiptGetPayload<{ include: typeof receiptInclude }>) => {
    if (existing.companyId !== po.companyId || existing.projectId !== po.projectId) throw new ServiceError("CONFLICT", "La operación ya está registrada en otro contexto");
    assertReceiptRelations(existing);
    if (existing.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "Esta operación ya se registró y la recepción fue anulada. Recargá la página e intentá de nuevo.");
    }
    if (!purchaseReceiptReplayMatches(existing, input)) {
      throw new ServiceError("CONFLICT", "Esta operación ya se registró con datos distintos. Recargá e intentá de nuevo.");
    }
    return existing;
  };
  const existingByKey = await prisma.purchaseReceipt.findFirst({
    where: { tenantId: ctx.tenantId, idempotencyKey },
    include: receiptInclude,
  });
  if (existingByKey) {
    return toPurchaseReceiptView(checkedReplay(existingByKey));
  }

  // BR-PUR-004 applies to a new receipt; a matching replay may already be confirmed.
  assertPoEligibleForReceipt(po.status);

  const settings = await getCompanyProcurementSettingsForProject(po.projectId, { ...ctx, companyId: po.companyId });
  const tolerancePct = new Prisma.Decimal(settings.overReceiptTolerancePct);

  if (input.warehouseId) {
    await assertWarehouseOkForPo(input.warehouseId, po, ctx);
  }

  // Reservations and the single-draft guard run after replay resolution under the PO lock.
  assertReceiptLinesFit(input.lines, po.lines, tolerancePct);

  const receipt = await withIdempotentCreate({
    findExisting: () =>
      prisma.purchaseReceipt.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey },
        include: receiptInclude,
      }),
    payloadsMatch: (existing) => Boolean(checkedReplay(existing)),
    create: async () => {
      const created = await prisma.$transaction(async (tx) => {
        await lockProjectForOperationalMutation(tx, po.projectId, ctx);
        await lockProcurementCompanyForNumbering(tx, po.companyId, ctx.tenantId);
        // Serialize draft creation per PO (closes double-tab race).
        await tx.$queryRaw`
          SELECT id FROM purchase_orders
          WHERE id = ${po.id} AND "tenantId" = ${ctx.tenantId}
          FOR UPDATE
        `;
        const currentPo = await tx.purchaseOrder.findFirst({ where: { id: po.id, tenantId: ctx.tenantId, companyId: po.companyId, projectId: po.projectId }, include: procurementOrderParentScopeInclude });
        if (!currentPo) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
        assertPurchaseOrderRelations(currentPo);
        const racedReplay = await tx.purchaseReceipt.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey }, include: receiptInclude });
        if (racedReplay) return checkedReplay(racedReplay);
        assertPoEligibleForReceipt(currentPo.status);
        if (input.warehouseId) await assertWarehouseOkForPo(input.warehouseId, currentPo, ctx, tx);
        assertReceiptLinesFit(input.lines, currentPo.lines, tolerancePct, await loadDraftReservedByLine(po.id, currentPo.lines.map((line) => line.id), { ...ctx, companyId: po.companyId }, { db: tx }));
        const racedDraft = await tx.purchaseReceipt.findFirst({
          where: { purchaseOrderId: po.id, tenantId: ctx.tenantId, status: "DRAFT" },
          select: { id: true },
        });
        if (racedDraft) {
          throw new ServiceError(
            "CONFLICT",
            "Ya hay una recepción en borrador para esta orden. Continuá o anulá esa recepción antes de crear otra.",
          );
        }

        // D-127: all new receipts share a company sequence; cancellation never releases a number.
        const sequence = await tx.purchaseReceipt.aggregate({ where: { tenantId: ctx.tenantId, companyId: po.companyId }, _max: { number: true } });
        const number = (sequence._max.number ?? 0) + 1;

        const row = await tx.purchaseReceipt.create({
          data: {
            tenantId:         ctx.tenantId,
            companyId:        po.companyId,
            number,
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
              quantityReceived:    new Prisma.Decimal(serializeQtyDecimal(inputLine.quantityReceived)),
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
      }, { maxWait: 10_000, timeout: 30_000 });
      return created;
    },
  });

  return toPurchaseReceiptView(receipt);
}

export async function updatePurchaseReceipt(
  id: string,
  input: UpdatePurchaseReceiptInput,
  ctx: ServiceContext,
): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseReceipts(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar recepciones");
  }

  const existing = await prisma.purchaseReceipt.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(existing.companyId, ctx)) throw new ServiceError("FORBIDDEN", "La recepción no pertenece a la empresa activa");
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `La recepción en estado "${existing.status}" no puede editarse.`);
  }

  const po = await orderForReceiptRead(existing.purchaseOrderId, ctx);
  if (po.companyId !== existing.companyId || po.projectId !== existing.projectId || po.supplierContactId !== existing.supplierContactId) throw new ServiceError("CONFLICT", "La recepción no corresponde a su orden de compra");
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  assertPoEligibleForReceipt(po.status);

  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, { ...ctx, companyId: existing.companyId });
  const tolerancePct = new Prisma.Decimal(settings.overReceiptTolerancePct);

  if (input.warehouseId) {
    await assertWarehouseOkForPo(input.warehouseId, po, ctx);
  }

  const draftReservedByLine = await loadDraftReservedByLine(
    po.id,
    po.lines.map((l) => l.id),
    ctx,
    { excludeReceiptId: id },
  );

  assertReceiptLinesFit(input.lines, po.lines, tolerancePct, draftReservedByLine);

  const receipt = await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${po.id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const currentPo = await tx.purchaseOrder.findFirst({ where: { id: po.id, tenantId: ctx.tenantId, projectId: existing.projectId, companyId: existing.companyId }, include: procurementOrderParentScopeInclude });
    if (!currentPo) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
    assertPurchaseOrderRelations(currentPo);
    assertPoEligibleForReceipt(currentPo.status);
    await tx.$queryRaw`
      SELECT id FROM purchase_receipts
      WHERE id = ${id} AND "tenantId" = ${ctx.tenantId}
      FOR UPDATE
    `;
    const currentReceipt = await tx.purchaseReceipt.findFirst({ where: { id, tenantId: ctx.tenantId, companyId: existing.companyId, projectId: existing.projectId }, include: receiptInclude });
    if (!currentReceipt || currentReceipt.updatedAt.getTime() !== existing.updatedAt.getTime()) throw new ServiceError("CONFLICT", "La recepción cambió durante la edición. Recargá e intentá de nuevo.");
    assertReceiptRelations(currentReceipt);
    if (input.warehouseId) await assertWarehouseOkForPo(input.warehouseId, currentPo, ctx, tx);
    assertReceiptLinesFit(input.lines, currentPo.lines, tolerancePct, await loadDraftReservedByLine(po.id, currentPo.lines.map((line) => line.id), { ...ctx, companyId: po.companyId }, { excludeReceiptId: id, db: tx }));
    const claimed = await tx.purchaseReceipt.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: {
        warehouseId: input.warehouseId ?? null,
        receiptDate: new Date(input.receiptDate),
        notes: input.notes ?? null,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(claimed.count, "La recepción ya no está en borrador");

    await tx.purchaseReceiptLine.deleteMany({ where: { purchaseReceiptId: id } });
    for (const inputLine of input.lines) {
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: id,
          purchaseOrderLineId: inputLine.purchaseOrderLineId,
          quantityReceived: new Prisma.Decimal(serializeQtyDecimal(inputLine.quantityReceived)),
          notes: inputLine.notes ?? null,
        },
      });
    }

    const full = await tx.purchaseReceipt.findUniqueOrThrow({
      where: { id },
      include: receiptInclude,
    });
    await auditProcurement(
      ctx,
      "purchase_receipt.updated",
      "PurchaseReceipt",
      id,
      { projectId: full.projectId, companyId: full.companyId },
      { after: { purchaseOrderId: po.id, number: po.number }, tx },
    );
    return full;
  }, { maxWait: 10_000, timeout: 30_000 });

  return toPurchaseReceiptView(receipt);
}

export async function confirmPurchaseReceipt(id: string, ctx: ServiceContext): Promise<PurchaseReceiptView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseReceipts(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para confirmar recepciones");
  }

  const existing = await prisma.purchaseReceipt.findUnique({
    where: { id },
    include: receiptInclude,
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (ctx.companyId && existing.companyId !== ctx.companyId) throw new ServiceError("FORBIDDEN", "El documento no pertenece a la empresa activa");
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  assertReceiptRelations(existing);
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `La recepción en estado "${existing.status}" no puede confirmarse.`);
  }

  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, { ...ctx, companyId: existing.companyId });
  const tolerancePct = new Prisma.Decimal(settings.overReceiptTolerancePct);

  const snapshot = existing;
  const receipt = await prisma.$transaction(async (tx) => {
    // Project lock comes before receipt, PO and stock locks; schedule edits use it too.
    await lockProjectForOperationalMutation(tx, snapshot.projectId, ctx);
    // Claim DRAFT first so concurrent cancel cannot race after stock/PO mutations.
    await tx.$queryRaw`
      SELECT id FROM purchase_receipts
      WHERE id = ${id} AND "tenantId" = ${ctx.tenantId}
      FOR UPDATE
    `;
    const existing = await tx.purchaseReceipt.findFirst({
      where: { id, tenantId: ctx.tenantId, projectId: snapshot.projectId },
      include: receiptInclude,
    });
    if (!existing || existing.updatedAt.getTime() !== snapshot.updatedAt.getTime()) {
      throw new ServiceError("CONFLICT", "La recepción cambió durante la confirmación. Recargá e intentá de nuevo.");
    }
    if (ctx.companyId && existing.companyId !== ctx.companyId) throw new ServiceError("FORBIDDEN", "La recepción no pertenece a la empresa activa");
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${existing.purchaseOrderId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const currentOrder = await tx.purchaseOrder.findFirst({ where: { id: existing.purchaseOrderId, tenantId: ctx.tenantId, projectId: existing.projectId, companyId: existing.companyId } });
    if (!currentOrder) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada en esta obra y empresa");
    assertPoEligibleForReceipt(currentOrder.status);
    if (currentOrder.supplierContactId !== existing.supplierContactId || existing.lines.length === 0 || existing.lines.some((line) => line.purchaseOrderLine.purchaseOrderId !== existing.purchaseOrderId)) {
      throw new ServiceError("CONFLICT", "Las líneas o el proveedor de la recepción no corresponden a su orden de compra");
    }
    assertReceiptRelations(existing);
    if (existing.lines.some((line) => line.purchaseOrderLine.productId) && !existing.warehouseId) {
      throw new ServiceError("VALIDATION", "Seleccioná un depósito antes de confirmar una recepción con productos");
    }
    if (existing.warehouseId) await assertWarehouseOkForPo(existing.warehouseId, currentOrder, ctx, tx);
    const confirmed = await tx.purchaseReceipt.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: { status: PurchaseReceiptStatus.CONFIRMED, updatedBy: ctx.actorUserId },
    });
    if (confirmed.count !== 1) {
      throw new ServiceError("CONFLICT", "La recepción ya no está en borrador");
    }

    // Lock each line once and validate the aggregate, including repeated entries.
    const lockedLines = [];
    for (const lineId of [...new Set(existing.lines.map((line) => line.purchaseOrderLineId))].sort()) {
      await tx.$queryRaw`SELECT id FROM purchase_order_lines WHERE id = ${lineId} FOR UPDATE`;
      lockedLines.push(await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: lineId }, select: { id: true, description: true, quantity: true, receivedQuantity: true } }));
    }
    assertReceiptLinesFit(existing.lines, lockedLines, tolerancePct);

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
  }, { maxWait: 10_000, timeout: 30_000 });

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
    include: receiptInclude,
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  if (isCrossCompany(existing.companyId, ctx)) throw new ServiceError("FORBIDDEN", "La recepción no pertenece a la empresa activa");
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  assertReceiptRelations(existing);
  if (existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "La recepción ya está anulada");
  }
  const receipt = await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${existing.purchaseOrderId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM purchase_receipts WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const before = await tx.purchaseReceipt.findFirst({
      where: { id, tenantId: ctx.tenantId, companyId: existing.companyId, projectId: existing.projectId },
      include: receiptInclude,
    });
    if (!before) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
    assertReceiptRelations(before);
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
      for (const line of [...before.lines].sort((left, right) => left.purchaseOrderLineId.localeCompare(right.purchaseOrderLineId))) {
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
  }, { maxWait: 10_000, timeout: 30_000 });

  return toPurchaseReceiptView(receipt);
}
