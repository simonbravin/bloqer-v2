import { Prisma, prisma, AccountMovement } from "@bloqer/database";
import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import { auditTreasury } from "./treasury-audit";
import { canViewCompanyTreasury } from "../finance/finance-access";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { assertCanCancelAccountMovement } from "./account-movement-cancel-guards";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { assertFinancialPeriodOpen } from "../finance/period-lock.service";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";

export type AccountMovementView = Omit<AccountMovement, "amount"> & {
  amount: string;
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
  const m = await prisma.accountMovement.findUnique({ where: { id } });
  if (!m) throw new ServiceError("NOT_FOUND", "Movimiento no encontrado");
  if (m.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertCanCancelAccountMovement({
    status: m.status,
    sourceType: m.sourceType,
    transferId: m.transferId,
  });

  await assertFinancialPeriodOpen({
    tenantId: ctx.tenantId,
    companyId: m.companyId,
    date: m.movementDate,
  });

  const glParams =
    m.companyId && (m.type === "INFLOW" || m.type === "OUTFLOW")
      ? {
          companyId: m.companyId,
          sourceType: (m.type === "INFLOW" ? "TREASURY_INFLOW" : "TREASURY_OUTFLOW") as
            | "TREASURY_INFLOW"
            | "TREASURY_OUTFLOW",
          sourceId: m.id,
          sourceLabel: "el movimiento de tesorería",
          enforceCompanyScope: false as const,
        }
      : null;

  // Block POSTED journals before mutating cash; cancel DRAFT only after commit.
  if (glParams) {
    await assertJournalAllowsOperationalCancel(ctx, glParams);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.accountMovement.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "CONFIRMED" },
      data: { status: "CANCELLED" },
    });
    assertOptimisticRowUpdate(
      cancelled.count,
      "El movimiento ya no está confirmado (puede haberse conciliado). Recargá e intentá de nuevo.",
    );

    const updatedMovement = await tx.accountMovement.findUniqueOrThrow({ where: { id } });

    await auditTreasury(
      ctx,
      "account_movement.cancelled",
      "AccountMovement",
      id,
      { companyId: m.companyId, projectId: m.projectId },
      { after: { status: "CANCELLED", amount: serializeMoneyDecimal(m.amount) }, tx },
    );

    return updatedMovement;
  });

  if (glParams) {
    await cancelDraftJournalOnOperationalCancel(ctx, glParams);
  }

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serialize(m: AccountMovement): AccountMovementView {
  return { ...m, amount: serializeMoneyDecimal(m.amount) };
}
