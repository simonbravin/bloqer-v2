import {
  Prisma,
  prisma,
  type WarehouseTransfer,
  type WarehouseTransferStatus,
} from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  createWarehouseTransferSchema,
  type CreateWarehouseTransferInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertInventoryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { getStockBalance } from "./stock-balance.service";
import { assertProductUnitCompatible } from "./product-unit";
import { ServiceError, type ServiceContext } from "../types";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeUnitPriceDecimal,
  toMoneyDecimal,
} from "../finance/money-decimal";
import {
  assertIdempotentPayloadMatch,
  requireIdempotencyKey,
  warehouseTransferReplayMatches,
  withIdempotentCreate,
} from "../idempotency/idempotency";
import {
  assertProjectAllowsOperationalMutation,
  lockProjectForOperationalMutation,
} from "../project/project-operational-guard";
import {
  assertInventoryMovementRelations,
  assertInventoryProductScope,
  assertInventoryWarehouseScope,
  inventoryMovementParentInclude,
  inventoryWarehouseWhere,
} from "./inventory-scope";
import {
  requireProjectAccess as assertReadProject,
  resolveAccessibleProjectScope,
} from "../security/access";

export type WarehouseTransferMovementView = {
  id: string;
  type: string;
  warehouseId: string;
  warehouseName: string;
  quantity: string;
  status: string;
  movementDate: string;
};
export type WarehouseTransferView = Omit<
  WarehouseTransfer,
  "quantity" | "unitCost" | "totalCost"
> & {
  quantity: string;
  unitCost: string | null;
  totalCost: string | null;
  sourceWarehouseName: string;
  destinationWarehouseName: string;
  productName: string;
  productUnit: string;
  stockMovements: WarehouseTransferMovementView[];
};
const transferInclude = {
  sourceWarehouse: true,
  destinationWarehouse: true,
  product: true,
  project: { select: { tenantId: true, companyId: true } },
  stockMovements: {
    include: inventoryMovementParentInclude,
    orderBy: { createdAt: "asc" as const },
  },
} as const satisfies Prisma.WarehouseTransferInclude;
type RawTransfer = Prisma.WarehouseTransferGetPayload<{ include: typeof transferInclude }>;
function serialize(t: RawTransfer): WarehouseTransferView {
  return {
    id: t.id,
    tenantId: t.tenantId,
    companyId: t.companyId,
    projectId: t.projectId,
    number: t.number,
    sourceWarehouseId: t.sourceWarehouseId,
    destinationWarehouseId: t.destinationWarehouseId,
    productId: t.productId,
    transferDate: t.transferDate,
    status: t.status,
    notes: t.notes,
    idempotencyKey: t.idempotencyKey,
    createdBy: t.createdBy,
    updatedBy: t.updatedBy,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    quantity: serializeQtyDecimal(t.quantity),
    unitCost: t.unitCost != null ? serializeUnitPriceDecimal(t.unitCost) : null,
    totalCost: t.totalCost != null ? serializeMoneyDecimal(t.totalCost) : null,
    sourceWarehouseName: t.sourceWarehouse.name,
    destinationWarehouseName: t.destinationWarehouse.name,
    productName: t.product.name,
    productUnit: t.product.unit,
    stockMovements: t.stockMovements.map((m) => ({
      id: m.id,
      type: m.type,
      warehouseId: m.warehouseId,
      warehouseName: m.warehouse.name,
      quantity: serializeQtyDecimal(m.quantity),
      status: m.status,
      movementDate: m.movementDate.toISOString().slice(0, 10),
    })),
  };
}
async function authorize(ctx: ServiceContext, action: "VIEW" | "EDIT") {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, action, "INVENTORY"))
    throw new ServiceError("FORBIDDEN", "Sin permisos para operar transferencias");
}
async function assertTransfer(t: RawTransfer, ctx: ServiceContext) {
  await assertInventoryWarehouseScope(t.sourceWarehouse, ctx);
  await assertInventoryWarehouseScope(t.destinationWarehouse, ctx);
  await assertInventoryProductScope(t.product, ctx);
  const invalid = () => {
    throw new ServiceError("CONFLICT", "La transferencia tiene relaciones inconsistentes");
  };
  if (
    t.tenantId !== ctx.tenantId ||
    t.companyId !== t.sourceWarehouse.companyId ||
    t.companyId !== t.destinationWarehouse.companyId ||
    (t.product.companyId && t.product.companyId !== t.companyId) ||
    !t.quantity.isFinite() ||
    t.quantity.lte(0) ||
    t.sourceWarehouseId === t.destinationWarehouseId
  )
    invalid();
  if (
    t.projectId &&
    (!t.project ||
      t.project.tenantId !== t.tenantId ||
      (t.project.companyId && t.project.companyId !== t.companyId))
  )
    invalid();
  if (t.projectId) {
    await assertReadProject(t.projectId, ctx);
  }
  for (const wh of [t.sourceWarehouse, t.destinationWarehouse])
    if (t.projectId && wh.projectId && wh.projectId !== t.projectId) invalid();
  if (t.stockMovements.length !== 2) invalid();
  for (const [type, warehouse] of [
    ["TRANSFER_OUT", t.sourceWarehouseId],
    ["TRANSFER_IN", t.destinationWarehouseId],
  ]) {
    const legs = t.stockMovements.filter((m) => m.type === type);
    const m = legs[0];
    if (
      legs.length !== 1 ||
      !m ||
      m.warehouseId !== warehouse ||
      m.productId !== t.productId ||
      m.sourceType !== "TRANSFER" ||
      m.sourceId !== t.id ||
      m.companyId !== t.companyId ||
      m.tenantId !== t.tenantId ||
      m.projectId !== t.projectId ||
      !m.quantity.eq(t.quantity) ||
      m.status !== t.status
    )
      invalid();
    await assertInventoryMovementRelations(m!, ctx);
  }
}
export async function getWarehouseTransferById(
  id: string,
  ctx: ServiceContext,
): Promise<WarehouseTransferView> {
  await authorize(ctx, "VIEW");
  const t = await prisma.warehouseTransfer.findUnique({ where: { id }, include: transferInclude });
  if (!t) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
  await assertTransfer(t, ctx);
  return serialize(t);
}
export async function listWarehouseTransfers(
  filters: {
    warehouseId?: string;
    productId?: string;
    status?: WarehouseTransferStatus;
    dateFrom?: string;
    dateTo?: string;
  },
  ctx: ServiceContext,
): Promise<WarehouseTransferView[]> {
  await authorize(ctx, "VIEW");
  const scope = await resolveAccessibleProjectScope(ctx),
    wh = await inventoryWarehouseWhere(ctx);
  const rows = await prisma.warehouseTransfer.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      sourceWarehouse: wh,
      destinationWarehouse: wh,
      ...(scope === "ALL"
        ? {}
        : { OR: [{ projectId: null }, { projectId: { in: scope.projectIds } }] }),
      AND: [
        filters.warehouseId
          ? {
              OR: [
                { sourceWarehouseId: filters.warehouseId },
                { destinationWarehouseId: filters.warehouseId },
              ],
            }
          : {},
      ],
      productId: filters.productId,
      status: filters.status,
      ...(filters.dateFrom || filters.dateTo
        ? {
            transferDate: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    },
    include: transferInclude,
    orderBy: [{ transferDate: "desc" }, { number: "desc" }],
  });
  await Promise.all(rows.map((row) => assertTransfer(row, ctx)));
  return rows.map(serialize);
}
export async function listWarehouseTransfersByWarehouse(warehouseId: string, ctx: ServiceContext) {
  return listWarehouseTransfers({ warehouseId }, ctx);
}
export async function getSourceStockPreview(
  warehouseId: string,
  productId: string,
  ctx: ServiceContext,
): Promise<string> {
  await authorize(ctx, "VIEW");
  const [wh, product] = await Promise.all([
    prisma.warehouse.findUnique({ where: { id: warehouseId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);
  if (!wh || !product) throw new ServiceError("NOT_FOUND", "Producto o depósito no encontrado");
  await assertInventoryWarehouseScope(wh, ctx);
  await assertInventoryProductScope(product, ctx);
  if (product.companyId && product.companyId !== wh.companyId)
    throw new ServiceError("CONFLICT", "Producto y depósito de empresas distintas");
  return serializeQtyDecimal(
    await getStockBalance({ tenantId: ctx.tenantId, warehouseId, productId }),
  );
}
async function lockKeys(tx: Prisma.TransactionClient, warehouseIds: string[], productId: string) {
  for (const id of [...new Set(warehouseIds)].sort())
    await tx.$queryRaw`SELECT id FROM warehouses WHERE id = ${id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
}
export async function createWarehouseTransfer(
  input: CreateWarehouseTransferInput,
  ctx: ServiceContext,
): Promise<WarehouseTransferView> {
  await authorize(ctx, "EDIT");
  const parsed = createWarehouseTransferSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Transferencia inválida",
    );
  input = parsed.data;
  if (input.sourceWarehouseId === input.destinationWarehouseId)
    throw new ServiceError("CONFLICT", "Los depósitos deben ser distintos");
  const key = requireIdempotencyKey(input.idempotencyKey);
  const matches = (t: RawTransfer) =>
    warehouseTransferReplayMatches(t, { ...input, projectId: input.projectId ?? null }) &&
    (t.notes ?? null) === (input.notes ?? null) &&
    (t.unitCost == null
      ? input.unitCost == null
      : input.unitCost != null && t.unitCost.eq(new Prisma.Decimal(input.unitCost)));
  const findExisting = async (db: Pick<Prisma.TransactionClient, "warehouseTransfer"> = prisma) => {
    const t = await db.warehouseTransfer.findFirst({
      where: { tenantId: ctx.tenantId, idempotencyKey: key },
      include: transferInclude,
    });
    if (t) await assertTransfer(t, ctx);
    return t;
  };
  const transfer = await withIdempotentCreate({
    findExisting,
    payloadsMatch: matches,
    create: async () => {
      const [src, dst, product] = await Promise.all([
        prisma.warehouse.findUnique({ where: { id: input.sourceWarehouseId } }),
        prisma.warehouse.findUnique({ where: { id: input.destinationWarehouseId } }),
        prisma.product.findUnique({ where: { id: input.productId } }),
      ]);
      if (!src || !dst || !product)
        throw new ServiceError("NOT_FOUND", "Producto o depósito no encontrado");
      await assertInventoryWarehouseScope(src, ctx);
      await assertInventoryWarehouseScope(dst, ctx);
      await assertInventoryProductScope(product, ctx);
      const projectIds = [
        ...new Set(
          [input.projectId, src.projectId, dst.projectId].filter((id): id is string => !!id),
        ),
      ].sort();
      for (const id of projectIds) await assertProjectAllowsOperationalMutation(id, ctx);
      return prisma.$transaction(
        async (tx) => {
          for (const id of projectIds) {
            const project = await lockProjectForOperationalMutation(tx, id, ctx);
            if (project.companyId && project.companyId !== src.companyId)
              throw new ServiceError(
                "CONFLICT",
                "La obra y el depósito pertenecen a empresas distintas",
              );
          }
          await tx.$queryRaw`SELECT id FROM companies WHERE id = ${src.companyId} FOR NO KEY UPDATE`;
          await lockKeys(tx, [src.id, dst.id], product.id);
          const replay = await findExisting(tx);
          if (replay) {
            assertIdempotentPayloadMatch(matches(replay));
            return replay;
          }
          const [from, to, prod] = await Promise.all([
            tx.warehouse.findUnique({ where: { id: src.id } }),
            tx.warehouse.findUnique({ where: { id: dst.id } }),
            tx.product.findUnique({ where: { id: product.id } }),
          ]);
          if (
            !from ||
            !to ||
            !prod ||
            from.tenantId !== ctx.tenantId ||
            to.tenantId !== ctx.tenantId ||
            prod.tenantId !== ctx.tenantId ||
            from.companyId !== src.companyId ||
            to.companyId !== src.companyId ||
            (prod.companyId && prod.companyId !== src.companyId) ||
            from.projectId !== src.projectId ||
            to.projectId !== dst.projectId
          )
            throw new ServiceError("CONFLICT", "Los padres de la transferencia son incompatibles");
          if (from.status !== "ACTIVE" || to.status !== "ACTIVE" || prod.status !== "ACTIVE")
            throw new ServiceError("CONFLICT", "Producto y depósitos deben estar activos");
          assertProductUnitCompatible(prod.unit, prod.unit);
          if (from.projectId && to.projectId && from.projectId !== to.projectId)
            throw new ServiceError("CONFLICT", "Los depósitos pertenecen a obras distintas");
          if (
            input.projectId &&
            ((from.projectId && from.projectId !== input.projectId) ||
              (to.projectId && to.projectId !== input.projectId))
          )
            throw new ServiceError("CONFLICT", "El depósito está asignado a otra obra");
          const qty = new Prisma.Decimal(input.quantity),
            unitCost = input.unitCost != null ? new Prisma.Decimal(input.unitCost) : null,
            totalCost = unitCost ? toMoneyDecimal(qty.times(unitCost)) : null;
          if (
            qty.abs().gte("100000000000000") ||
            unitCost?.abs().gte("100000000000000") ||
            totalCost?.abs().gte("100000000000000")
          )
            throw new ServiceError("VALIDATION", "Cantidad o costo fuera de rango");
          const balance = await getStockBalance(
            { tenantId: ctx.tenantId, warehouseId: from.id, productId: prod.id },
            tx,
          );
          if (qty.gt(balance))
            throw new ServiceError(
              "CONFLICT",
              "Stock insuficiente en depósito origen. Disponible: " + serializeQtyDecimal(balance),
            );
          const agg = await tx.warehouseTransfer.aggregate({
            where: { tenantId: ctx.tenantId, companyId: from.companyId },
            _max: { number: true },
          });
          const t = await tx.warehouseTransfer.create({
            data: {
              tenantId: ctx.tenantId,
              companyId: from.companyId,
              projectId: input.projectId ?? null,
              number: (agg._max.number ?? 0) + 1,
              sourceWarehouseId: from.id,
              destinationWarehouseId: to.id,
              productId: prod.id,
              transferDate: new Date(input.transferDate),
              quantity: qty,
              unitCost,
              totalCost,
              notes: input.notes ?? null,
              status: "CONFIRMED",
              idempotencyKey: key,
              createdBy: ctx.actorUserId,
              updatedBy: ctx.actorUserId,
            },
          });
          await tx.stockMovement.createMany({
            data: [
              { type: "TRANSFER_OUT" as const, warehouseId: from.id },
              { type: "TRANSFER_IN" as const, warehouseId: to.id },
            ].map((leg) => ({
              ...leg,
              tenantId: ctx.tenantId,
              companyId: from.companyId,
              projectId: input.projectId ?? null,
              productId: prod.id,
              sourceType: "TRANSFER" as const,
              sourceId: t.id,
              warehouseTransferId: t.id,
              movementDate: new Date(input.transferDate),
              quantity: qty,
              unitCost,
              totalCost,
              status: "CONFIRMED" as const,
              createdBy: ctx.actorUserId,
            })),
          });
          await log(
            {
              tenantId: ctx.tenantId,
              companyId: t.companyId,
              projectId: t.projectId,
              actorUserId: ctx.actorUserId,
              action: "warehouse_transfer.created",
              entityType: "WarehouseTransfer",
              entityId: t.id,
              after: { number: t.number, quantity: serializeQtyDecimal(qty) },
            },
            tx,
          );
          return tx.warehouseTransfer.findUniqueOrThrow({
            where: { id: t.id },
            include: transferInclude,
          });
        },
        { maxWait: 10000, timeout: 30000 },
      );
    },
  });
  return serialize(transfer);
}
export async function cancelWarehouseTransfer(
  id: string,
  ctx: ServiceContext,
): Promise<WarehouseTransferView> {
  await authorize(ctx, "EDIT");
  const preview = await prisma.warehouseTransfer.findUnique({
    where: { id },
    include: transferInclude,
  });
  if (!preview) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
  await assertTransfer(preview, ctx);
  const projectIds = [
    ...new Set(
      [
        preview.projectId,
        preview.sourceWarehouse.projectId,
        preview.destinationWarehouse.projectId,
      ].filter((id): id is string => !!id),
    ),
  ].sort();
  for (const project of projectIds) await assertProjectAllowsOperationalMutation(project, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      for (const project of projectIds) await lockProjectForOperationalMutation(tx, project, ctx);
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${preview.companyId} FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM warehouse_transfers WHERE id = ${id} FOR UPDATE`;
      await lockKeys(
        tx,
        [preview.sourceWarehouseId, preview.destinationWarehouseId],
        preview.productId,
      );
      const t = await tx.warehouseTransfer.findUniqueOrThrow({
        where: { id },
        include: transferInclude,
      });
      await assertTransfer(t, ctx);
      if (t.status !== "CONFIRMED")
        throw new ServiceError("CONFLICT", "Solo se pueden anular transferencias confirmadas");
      if (
        t.sourceWarehouseId !== preview.sourceWarehouseId ||
        t.destinationWarehouseId !== preview.destinationWarehouseId ||
        t.productId !== preview.productId ||
        t.projectId !== preview.projectId
      )
        throw new ServiceError("CONFLICT", "La transferencia cambió");
      const balance = await getStockBalance(
        { tenantId: ctx.tenantId, warehouseId: t.destinationWarehouseId, productId: t.productId },
        tx,
      );
      if (balance.lt(t.quantity))
        throw new ServiceError(
          "CONFLICT",
          "No es posible anular: el stock de destino fue consumido. Disponible: " +
            serializeQtyDecimal(balance),
        );
      await tx.stockMovement.updateMany({
        where: {
          warehouseTransferId: id,
          tenantId: ctx.tenantId,
          id: { in: t.stockMovements.map((m) => m.id) },
          status: "CONFIRMED",
        },
        data: { status: "CANCELLED" },
      });
      const changed = await tx.warehouseTransfer.update({
        where: { id },
        data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
      });
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: t.companyId,
          projectId: t.projectId,
          actorUserId: ctx.actorUserId,
          action: "warehouse_transfer.cancelled",
          entityType: "WarehouseTransfer",
          entityId: id,
          after: { status: "CANCELLED" },
        },
        tx,
      );
      return changed;
    },
    { maxWait: 10000, timeout: 30000 },
  );
  return getWarehouseTransferById(row.id, ctx);
}
