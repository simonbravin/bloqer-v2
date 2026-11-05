import { prisma, AccountMovement } from "@bloqer/database";
import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import { auditTreasury } from "./treasury-audit";
import { canViewCompanyTreasury } from "../finance/finance-access";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { assertCanCancelAccountMovement } from "./account-movement-cancel-guards";
import { serializeFxRateDecimal, serializeMoneyDecimal } from "../finance/money-decimal";
import { assertTreasuryAccountCanReverse, assertTreasuryPeriodsOpenUnderCompanyLocks } from "./treasury-write-locks";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";

export type AccountMovementView = Omit<AccountMovement, "amount" | "fxRate" | "amountArs"> & {
  amount: string;
  fxRate: string | null;
  amountArs: string | null;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getAccountMovementById(
  id: string,
  ctx: ServiceContext,
): Promise<AccountMovementView> {
  await assertTreasuryTenantModule(ctx);
  if (!canViewCompanyTreasury(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos");
  }
  const m = await prisma.accountMovement.findFirst({
    where: { id, tenantId: ctx.tenantId, account: { tenantId: ctx.tenantId } },
  });
  if (!m) throw new ServiceError("NOT_FOUND", "Movimiento no encontrado");
  return serialize(m);
}

export async function listAccountMovements(
  accountId: string,
  ctx: ServiceContext,
): Promise<AccountMovementView[]> {
  await assertTreasuryTenantModule(ctx);
  if (!canViewCompanyTreasury(ctx.roles)) {
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

// Only CONFIRMED movements can be cancelled; RECONCILED must be unmatched first.
export async function cancelAccountMovement(
  id: string,
  ctx: ServiceContext,
): Promise<AccountMovement> {
  await assertTreasuryTenantModule(ctx);
  if (!hasCompanyFinanceRole(ctx.roles) || !can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar movimientos");
  }
  return prisma.$transaction(async (tx) => {
    const movement = await tx.accountMovement.findUnique({
      where: { id },
      include: { account: { select: { tenantId: true, companyId: true } } },
    });
    if (!movement) throw new ServiceError("NOT_FOUND", "Movimiento no encontrado");
    if (movement.tenantId !== ctx.tenantId || movement.account.tenantId !== ctx.tenantId) {
      throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    }
    assertCanCancelAccountMovement(movement);
    const glCompanyId = movement.companyId ?? movement.account.companyId;
    const glParams =
      glCompanyId && (movement.type === "INFLOW" || movement.type === "OUTFLOW")
        ? {
            companyId: glCompanyId,
            sourceType: movement.type === "INFLOW" ? "TREASURY_INFLOW" as const : "TREASURY_OUTFLOW" as const,
            sourceId: id,
            sourceLabel: "el movimiento de tesorería",
            enforceCompanyScope: false,
          }
        : null;
    await assertTreasuryPeriodsOpenUnderCompanyLocks(tx, ctx.tenantId, [
      { companyId: movement.companyId, date: movement.movementDate },
    ]);
    if (glParams) await assertJournalAllowsOperationalCancel(ctx, glParams, tx);
    await assertTreasuryAccountCanReverse(tx, movement.accountId, ctx.tenantId);

    const cancelled = await tx.accountMovement.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "CONFIRMED" },
      data: { status: "CANCELLED" },
    });
    assertOptimisticRowUpdate(
      cancelled.count,
      "El movimiento ya no está confirmado (puede haberse conciliado). Recargá e intentá de nuevo.",
    );

    if (glParams) await cancelDraftJournalOnOperationalCancel(ctx, glParams, tx);

    await auditTreasury(
      ctx,
      "account_movement.cancelled",
      "AccountMovement",
      id,
      { companyId: movement.companyId, projectId: movement.projectId },
      { after: { status: "CANCELLED", amount: serializeMoneyDecimal(movement.amount) }, tx },
    );
    return tx.accountMovement.findUniqueOrThrow({ where: { id } });
  }, { timeout: 30_000 });
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serialize(m: AccountMovement): AccountMovementView {
  return {
    ...m,
    amount: serializeMoneyDecimal(m.amount),
    fxRate: m.fxRate == null ? null : serializeFxRateDecimal(m.fxRate),
    amountArs: m.amountArs == null ? null : serializeMoneyDecimal(m.amountArs),
  };
}
