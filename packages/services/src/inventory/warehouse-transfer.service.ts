import { Prisma, prisma, WarehouseTransfer, WarehouseTransferStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateWarehouseTransferInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertInventoryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { getStockBalance } from "./stock-balance.service";
import { ServiceContext, ServiceError } from "../types";

// ─── View types ───────────────────────────────────────────────────────────────

export type WarehouseTransferMovementView = {
  id:           string;
  type:         string;
  warehouseId:  string;
  warehouseName: string;
  quantity:     string;
  status:       string;
  movementDate: string;
};

export type WarehouseTransferView = Omit<
  WarehouseTransfer,
  "quantity" | "unitCost" | "totalCost"
> & {
  quantity:                 string;
  unitCost:                 string | null;
  totalCost:                string | null;
  sourceWarehouseName:      string;
  destinationWarehouseName: string;
  productName:              string;
  productUnit:              string;
  stockMovements:           WarehouseTransferMovementView[];
};

// ─── Serializer ───────────────────────────────────────────────────────────────

type RawTransfer = WarehouseTransfer & {
  sourceWarehouse:      { name: string };
  destinationWarehouse: { name: string };
  product:              { name: string; unit: string };
  stockMovements: {
    id: string; type: string; warehouseId: string;
    warehouse: { name: string }; quantity: Prisma.Decimal;
    status: string; movementDate: Date;
  }[];
};

function serialize(t: RawTransfer): WarehouseTransferView {
  return {
    ...t,
    quantity:                 t.quantity.toString(),
    unitCost:                 t.unitCost?.toString() ?? null,
    totalCost:                t.totalCost?.toString() ?? null,
    sourceWarehouseName:      t.sourceWarehouse.name,
    destinationWarehouseName: t.destinationWarehouse.name,
    productName:              t.product.name,
    productUnit:              t.product.unit,
    stockMovements:           t.stockMovements.map((m) => ({
      id:           m.id,
      type:         m.type,
      warehouseId:  m.warehouseId,
      warehouseName: m.warehouse.name,
      quantity:     m.quantity.toString(),
      status:       m.status,
      movementDate: m.movementDate.toISOString().slice(0, 10),
    })),
  };
}

const transferInclude = {
  sourceWarehouse:      { select: { name: true } },
  destinationWarehouse: { select: { name: true } },
  product:              { select: { name: true, unit: true } },
  stockMovements: {
    select: {
      id: true, type: true, warehouseId: true,
      warehouse: { select: { name: true } },
      quantity: true, status: true, movementDate: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getWarehouseTransferById(
  id: string,
  ctx: ServiceContext,
): Promise<WarehouseTransferView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver transferencias de depósito");
  }
  const t = await prisma.warehouseTransfer.findUnique({ where: { id }, include: transferInclude });
  if (!t) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
  if (t.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serialize(t);
}

export async function listWarehouseTransfers(
  filters: {
    warehouseId?: string;
    productId?:   string;
    status?:      WarehouseTransferStatus;
    dateFrom?:    string;
    dateTo?:      string;
  },
  ctx: ServiceContext,
): Promise<WarehouseTransferView[]> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver transferencias de depósito");
  }

  const warehouseClause = filters.warehouseId
    ? {
        OR: [
          { sourceWarehouseId:      filters.warehouseId },
          { destinationWarehouseId: filters.warehouseId },
        ],
      }
    : {};

  const dateClause =
    filters.dateFrom || filters.dateTo
      ? {
          transferDate: {
            ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
            ...(filters.dateTo   ? { lte: new Date(filters.dateTo)   } : {}),
          },
        }
      : {};

  const rows = await prisma.warehouseTransfer.findMany({
    where: {
      tenantId:  ctx.tenantId,
      productId: filters.productId ?? undefined,
      status:    filters.status    ?? undefined,
      ...warehouseClause,
      ...dateClause,
    },
    include: transferInclude,
    orderBy: [{ transferDate: "desc" }, { number: "desc" }],
  });

  return rows.map(serialize);
}

export async function listWarehouseTransfersByWarehouse(
  warehouseId: string,
  ctx: ServiceContext,
): Promise<WarehouseTransferView[]> {
  return listWarehouseTransfers({ warehouseId }, ctx);
}

// ─── Stock preview for UI ─────────────────────────────────────────────────────

export async function getSourceStockPreview(
  warehouseId: string,
  productId:   string,
  ctx:         ServiceContext,
): Promise<string> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver stock");
  }
  const balance = await getStockBalance({ tenantId: ctx.tenantId, warehouseId, productId });
  return balance.toString();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createWarehouseTransfer(
  input: CreateWarehouseTransferInput,
  ctx:   ServiceContext,
): Promise<WarehouseTransferView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear transferencias de depósito");
  }

  if (input.sourceWarehouseId === input.destinationWarehouseId) {
    throw new ServiceError("CONFLICT", "El depósito origen y destino deben ser distintos");
  }

  const [srcWarehouse, dstWarehouse, product] = await Promise.all([
    prisma.warehouse.findUnique({ where: { id: input.sourceWarehouseId } }),
    prisma.warehouse.findUnique({ where: { id: input.destinationWarehouseId } }),
    prisma.product.findUnique({ where: { id: input.productId } }),
  ]);

  if (!srcWarehouse) throw new ServiceError("NOT_FOUND", "Depósito origen no encontrado");
  if (!dstWarehouse) throw new ServiceError("NOT_FOUND", "Depósito destino no encontrado");
  if (!product)      throw new ServiceError("NOT_FOUND", "Producto no encontrado");

  if (srcWarehouse.tenantId !== ctx.tenantId || dstWarehouse.tenantId !== ctx.tenantId || product.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (srcWarehouse.companyId !== dstWarehouse.companyId) {
    throw new ServiceError("CONFLICT", "Los depósitos deben pertenecer a la misma empresa");
  }
  if (srcWarehouse.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El depósito origen no está activo");
  }
  if (dstWarehouse.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El depósito destino no está activo");
  }
  if (product.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El producto no está activo");
  }

  const qty      = new Prisma.Decimal(input.quantity);
  const unitCost = input.unitCost ? new Prisma.Decimal(input.unitCost) : null;
  const totalCost = unitCost ? qty.times(unitCost) : null;

  if (qty.lessThanOrEqualTo(0)) {
    throw new ServiceError("CONFLICT", "La cantidad debe ser mayor a cero");
  }

  const companyId = srcWarehouse.companyId;
  const transferDate = new Date(input.transferDate);

  const transfer = await prisma.$transaction(async (tx) => {
    // BR-INV-002: check source balance before deducting
    const srcBalance = await getStockBalance({
      tenantId:    ctx.tenantId,
      warehouseId: input.sourceWarehouseId,
      productId:   input.productId,
    });
    if (qty.greaterThan(srcBalance)) {
      throw new ServiceError(
        "CONFLICT",
        `Stock insuficiente en depósito origen. Disponible: ${srcBalance.toString()}, solicitado: ${qty.toString()}`,
      );
    }

    // Generate sequential number per tenant+company
    const agg = await tx.warehouseTransfer.aggregate({
      where: { tenantId: ctx.tenantId, companyId },
      _max:  { number: true },
    });
    const nextNumber = (agg._max.number ?? 0) + 1;

    const wt = await tx.warehouseTransfer.create({
      data: {
        tenantId:              ctx.tenantId,
        companyId,
        projectId:             input.projectId ?? null,
        number:                nextNumber,
        sourceWarehouseId:     input.sourceWarehouseId,
        destinationWarehouseId: input.destinationWarehouseId,
        productId:             input.productId,
        transferDate,
        quantity:              qty,
        unitCost,
        totalCost,
        notes:                 input.notes ?? null,
        status:                "CONFIRMED",
        createdBy:             ctx.actorUserId,
      },
    });

    // R-INT-013: exactly 2 StockMovements, paired by warehouseTransferId
    await tx.stockMovement.createMany({
      data: [
        {
          tenantId:           ctx.tenantId,
          companyId,
          warehouseId:        input.sourceWarehouseId,
          productId:          input.productId,
          projectId:          input.projectId ?? null,
          type:               "TRANSFER_OUT",
          sourceType:         "TRANSFER",
          sourceId:           wt.id,
          warehouseTransferId: wt.id,
          movementDate:       transferDate,
          quantity:           qty,
          unitCost,
          totalCost,
          status:             "CONFIRMED",
          createdBy:          ctx.actorUserId,
        },
        {
          tenantId:           ctx.tenantId,
          companyId,
          warehouseId:        input.destinationWarehouseId,
          productId:          input.productId,
          projectId:          input.projectId ?? null,
          type:               "TRANSFER_IN",
          sourceType:         "TRANSFER",
          sourceId:           wt.id,
          warehouseTransferId: wt.id,
          movementDate:       transferDate,
          quantity:           qty,
          unitCost,
          totalCost,
          status:             "CONFIRMED",
          createdBy:          ctx.actorUserId,
        },
      ],
    });

    return wt;
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "warehouse_transfer.created",
    entityType:  "WarehouseTransfer",
    entityId:    transfer.id,
    after: {
      number: transfer.number,
      sourceWarehouseId:      input.sourceWarehouseId,
      destinationWarehouseId: input.destinationWarehouseId,
      productId: input.productId,
      quantity:  input.quantity,
    },
  });

  return getWarehouseTransferById(transfer.id, ctx);
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelWarehouseTransfer(
  id:  string,
  ctx: ServiceContext,
): Promise<WarehouseTransferView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar transferencias");
  }

  const t = await prisma.warehouseTransfer.findUnique({ where: { id } });
  if (!t) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
  if (t.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (t.status !== "CONFIRMED") throw new ServiceError("CONFLICT", "Solo se pueden cancelar transferencias confirmadas");

  await prisma.$transaction(async (tx) => {
    // Guard: cancelling reverses the TRANSFER_IN; if destination stock was consumed, balance could go negative
    const dstBalance = await getStockBalance({
      tenantId:    ctx.tenantId,
      warehouseId: t.destinationWarehouseId,
      productId:   t.productId,
    });
    if (dstBalance.lessThan(t.quantity)) {
      throw new ServiceError(
        "CONFLICT",
        `No es posible anular la transferencia: el stock en el depósito destino fue consumido. Disponible: ${dstBalance.toString()}, requerido: ${t.quantity.toString()}`,
      );
    }

    await tx.warehouseTransfer.update({
      where: { id },
      data:  { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });

    await tx.stockMovement.updateMany({
      where: { warehouseTransferId: id, status: "CONFIRMED" },
      data:  { status: "CANCELLED" },
    });
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "warehouse_transfer.cancelled",
    entityType:  "WarehouseTransfer",
    entityId:    id,
    after:       { status: "CANCELLED" },
  });

  return getWarehouseTransferById(id, ctx);
}
