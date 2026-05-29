import { randomUUID } from "crypto";
import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateCorporateTreasuryInflowInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { buildFinancialHref } from "../finance/financial-trace.service";
import type { FinancialTraceLink, RegisterTransactionResult } from "../finance/register-transaction.types";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

export async function registerCorporateTreasuryInflow(
  input: CreateCorporateTreasuryInflowInput,
  ctx: ServiceContext,
): Promise<RegisterTransactionResult> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar ingresos de tesorería");
  }
  if (!ctx.companyId) {
    throw new ServiceError(
      "VALIDATION",
      "Selecciona una empresa activa para registrar ingresos corporativos.",
    );
  }

  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new ServiceError("VALIDATION", "El monto debe ser mayor a 0");
  }

  const movementId = randomUUID();

  await prisma.$transaction(async (tx) => {
    const account = await tx.treasuryAccount.findUnique({ where: { id: input.accountId } });
    if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
    if (account.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (account.status !== "ACTIVE") {
      throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
    }
    if (!account.companyId || account.companyId !== ctx.companyId) {
      throw new ServiceError(
        "FORBIDDEN",
        "La cuenta de tesorería no pertenece a la empresa activa.",
      );
    }

    await tx.accountMovement.create({
      data: {
        id: movementId,
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        accountId: input.accountId,
        movementDate: new Date(input.movementDate),
        type: "INFLOW",
        sourceType: "MANUAL_ADJUSTMENT",
        sourceId: movementId,
        currency: account.currency,
        amount,
        description: input.description,
        status: "CONFIRMED",
        createdBy: ctx.actorUserId,
      },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "account_movement.confirmed",
    entityType: "AccountMovement",
    entityId: movementId,
    after: { type: "INFLOW", sourceType: "MANUAL_ADJUSTMENT", amount: input.amount },
    ipAddress: ctx.ipAddress,
  });

  const href = buildFinancialHref("AccountMovement", movementId, { accountId: input.accountId });
  const traceChain: FinancialTraceLink[] = [
    { entityType: "AccountMovement", entityId: movementId, href },
  ];

  return {
    kind: "TREASURY_INFLOW",
    primaryEntityId: movementId,
    primaryEntityType: "AccountMovement",
    href,
    traceChain,
  };
}
