import { Prisma, prisma, AccountMovement } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

export type AccountMovementView = Omit<AccountMovement, "amount"> & {
  amount: string;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getAccountMovementById(
  id: string,
  ctx: ServiceContext,
): Promise<AccountMovementView> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos");
  }
  const m = await prisma.accountMovement.findUnique({ where: { id } });
  if (!m) throw new ServiceError("NOT_FOUND", "Movimiento no encontrado");
  if (m.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serialize(m);
}

export async function listAccountMovements(
  accountId: string,
  ctx: ServiceContext,
): Promise<AccountMovementView[]> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos");
  }
  const acc = await prisma.treasuryAccount.findUnique({ where: { id: accountId } });
  if (!acc) throw new ServiceError("NOT_FOUND", "Cuenta no encontrada");
  if (acc.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const movements = await prisma.accountMovement.findMany({
    where: { accountId, tenantId: ctx.tenantId },
    orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
  });
  return movements.map(serialize);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

// Only CONFIRMED movements can be cancelled; RECONCILED (future) cannot.
export async function cancelAccountMovement(
  id: string,
  ctx: ServiceContext,
): Promise<AccountMovement> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar movimientos");
  }
  const m = await prisma.accountMovement.findUnique({ where: { id } });
  if (!m) throw new ServiceError("NOT_FOUND", "Movimiento no encontrado");
  if (m.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (m.status !== "CONFIRMED") {
    throw new ServiceError("CONFLICT", `El movimiento en estado "${m.status}" no puede cancelarse directamente`);
  }
  if (m.transferId) {
    throw new ServiceError(
      "CONFLICT",
      "Este movimiento pertenece a una transferencia interna. Cancele la transferencia en su lugar.",
    );
  }
  if (m.sourceType === "COLLECTION") {
    throw new ServiceError(
      "CONFLICT",
      "Este movimiento fue generado por una cobranza. Cancele la cobranza en su lugar.",
    );
  }

  const updated = await prisma.accountMovement.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "account_movement.cancelled",
    entityType: "AccountMovement",
    entityId: id,
    after: { status: "CANCELLED" },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serialize(m: AccountMovement): AccountMovementView {
  return { ...m, amount: m.amount.toString() };
}
