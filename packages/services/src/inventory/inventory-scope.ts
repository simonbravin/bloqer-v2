import { Prisma, prisma } from "@bloqer/database";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import { requireProjectAccess, resolveAccessibleProjectScope } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";

type ScopeRow = { tenantId: string; companyId: string | null };
type WarehouseScopeRow = ScopeRow & { projectId: string | null };
const companyChecks = new WeakMap<ServiceContext, Map<string, Promise<void>>>();
async function assertCompany(tenantId: string, companyId: string, ctx: ServiceContext) {
  let checks = companyChecks.get(ctx);
  if (!checks) {
    checks = new Map();
    companyChecks.set(ctx, checks);
  }
  const key = `${tenantId}:${companyId}`;
  if (!checks.has(key))
    checks.set(
      key,
      (async () => {
        if (
          !(await prisma.company.findFirst({
            where: { id: companyId, tenantId },
            select: { id: true },
          }))
        )
          throw new ServiceError("CONFLICT", "Relaciones de empresa inconsistentes");
      })(),
    );
  await checks.get(key);
}

export function inventoryProductWhere(
  ctx: ServiceContext,
  requestedCompanyId?: string,
): Prisma.ProductWhereInput {
  if (requestedCompanyId && isCrossCompany(requestedCompanyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "Empresa fuera del contexto autorizado");
  }
  return {
    tenantId: ctx.tenantId,
    ...companyScopeFilter(ctx),
    ...(requestedCompanyId ? { OR: [{ companyId: requestedCompanyId }, { companyId: null }] } : {}),
  };
}

export async function inventoryWarehouseWhere(
  ctx: ServiceContext,
): Promise<Prisma.WarehouseWhereInput> {
  const scope = await resolveAccessibleProjectScope(ctx);
  return {
    tenantId: ctx.tenantId,
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(scope === "ALL"
      ? {}
      : { OR: [{ projectId: null }, { projectId: { in: scope.projectIds } }] }),
  };
}

export async function inventoryMovementWhere(
  ctx: ServiceContext,
  projectId?: string,
): Promise<Prisma.StockMovementWhereInput> {
  if (projectId) await requireProjectAccess(projectId, ctx);
  const scope = await resolveAccessibleProjectScope(ctx);
  return {
    tenantId: ctx.tenantId,
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(projectId
      ? { projectId }
      : scope === "ALL"
        ? {}
        : { OR: [{ projectId: null }, { projectId: { in: scope.projectIds } }] }),
    warehouse: await inventoryWarehouseWhere(ctx),
  };
}

export async function assertInventoryProductScope(
  row: ScopeRow,
  ctx: ServiceContext,
): Promise<void> {
  if (row.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  if (isCrossCompany(row.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "Producto de otra empresa");
  if (row.companyId) await assertCompany(row.tenantId, row.companyId, ctx);
}

export async function assertInventoryWarehouseScope(
  row: WarehouseScopeRow,
  ctx: ServiceContext,
): Promise<void> {
  if (row.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
  if (isCrossCompany(row.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "Depósito de otra empresa");
  if (!row.companyId)
    throw new ServiceError("CONFLICT", "El depósito tiene relaciones inconsistentes");
  await assertCompany(row.tenantId, row.companyId, ctx);
  if (row.projectId) {
    const project = await requireProjectAccess(row.projectId, ctx);
    if (project.companyId && project.companyId !== row.companyId)
      throw new ServiceError("CONFLICT", "El depósito tiene relaciones inconsistentes");
  }
}

const parentScope = { tenantId: true, companyId: true, projectId: true } as const;
export const inventoryMovementParentInclude = {
  product: true,
  warehouse: true,
  project: { select: { tenantId: true, companyId: true } },
  wbsNode: { include: { budget: { select: parentScope } } },
  purchaseReceipt: {
    select: {
      ...parentScope,
      purchaseOrderId: true,
      purchaseOrder: { select: { ...parentScope, currency: true } },
    },
  },
  purchaseReceiptLine: {
    include: {
      purchaseReceipt: { select: { ...parentScope, purchaseOrderId: true } },
      purchaseOrderLine: {
        include: { purchaseOrder: { select: { ...parentScope, currency: true } } },
      },
    },
  },
  warehouseTransfer: {
    select: {
      ...parentScope,
      sourceWarehouseId: true,
      destinationWarehouseId: true,
      productId: true,
    },
  },
} as const satisfies Prisma.StockMovementInclude;

export type InventoryMovementWithParents = Prisma.StockMovementGetPayload<{
  include: typeof inventoryMovementParentInclude;
}>;

/** Validate joined parents before consuming any label, quantity or nominal amount. */
export async function assertInventoryMovementRelations(
  row: InventoryMovementWithParents,
  ctx: ServiceContext,
): Promise<void> {
  if (row.tenantId !== ctx.tenantId)
    throw new ServiceError("NOT_FOUND", "Movimiento no encontrado");
  if (isCrossCompany(row.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "Movimiento de otra empresa");
  await assertInventoryWarehouseScope(row.warehouse, ctx);
  await assertInventoryProductScope(row.product, ctx);
  if (row.projectId) await requireProjectAccess(row.projectId, ctx);
  assertInventoryMovementParentScope(row);
}

/** Internal balance checks have authorized stock keys but no user-facing context. */
export function assertInventoryMovementParentScope(row: InventoryMovementWithParents): void {
  const invalid = () => {
    throw new ServiceError("CONFLICT", "El movimiento de stock tiene relaciones inconsistentes");
  };
  if (
    row.warehouse.tenantId !== row.tenantId ||
    row.product.tenantId !== row.tenantId ||
    row.warehouse.companyId !== row.companyId ||
    (row.product.companyId && row.product.companyId !== row.companyId)
  )
    invalid();
  if (row.projectId) {
    if (
      !row.project ||
      row.project.tenantId !== row.tenantId ||
      (row.project.companyId && row.project.companyId !== row.companyId) ||
      (row.warehouse.projectId && row.warehouse.projectId !== row.projectId)
    )
      invalid();
  }
  const sameScope = (parent: ScopeRow & { projectId: string | null }) =>
    parent.tenantId === row.tenantId &&
    parent.companyId === row.companyId &&
    parent.projectId === row.projectId;
  if (
    row.wbsNodeId &&
    (!row.wbsNode ||
      row.wbsNode.budget.tenantId !== row.tenantId ||
      row.wbsNode.budget.projectId !== row.projectId ||
      (row.wbsNode.budget.companyId && row.wbsNode.budget.companyId !== row.companyId))
  )
    invalid();
  if (
    row.purchaseReceiptId &&
    (!row.purchaseReceipt ||
      !sameScope(row.purchaseReceipt) ||
      !sameScope(row.purchaseReceipt.purchaseOrder))
  )
    invalid();
  if (row.purchaseReceiptLineId) {
    const line = row.purchaseReceiptLine;
    if (
      !line ||
      !sameScope(line.purchaseReceipt) ||
      line.purchaseReceiptId !== row.purchaseReceiptId ||
      !sameScope(line.purchaseOrderLine.purchaseOrder) ||
      line.purchaseReceipt.purchaseOrderId !== line.purchaseOrderLine.purchaseOrderId ||
      line.purchaseOrderLine.productId !== row.productId
    )
      invalid();
  }
  if (row.warehouseTransferId) {
    const transfer = row.warehouseTransfer;
    if (
      !transfer ||
      !sameScope(transfer) ||
      transfer.productId !== row.productId ||
      (row.type === "TRANSFER_OUT"
        ? transfer.sourceWarehouseId
        : row.type === "TRANSFER_IN"
          ? transfer.destinationWarehouseId
          : null) !== row.warehouseId
    )
      invalid();
  }
}
