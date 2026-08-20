import { randomUUID } from "crypto";
import { Prisma, prisma } from "@bloqer/database";
import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import type { CreateManualTreasuryAdjustmentInput } from "@bloqer/validators";
import { ensureDraftJournalFromTreasuryMovement } from "../accounting/accounting-auto-draft.service";
import { isCrossCompany } from "../company-scope";
import { assertResourceTenant } from "../security/tenant-isolation";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { getAccountBalance } from "./balance.service";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { auditTreasury } from "./treasury-audit";
import {
  requireIdempotencyKey,
  treasuryMovementReplayMatches,
  withIdempotentCreate,
} from "../idempotency/idempotency";
import {
  assertPeriodOpenUnderCompanyLock,
  lockTreasuryAccountRow,
} from "./treasury-write-locks";

/**
 * Generic MANUAL_ADJUSTMENT on a treasury account ([P-TRZ-04] / Phase 3 close).
 * INFLOW or OUTFLOW; OUTFLOW requires sufficient balance.
 */
export async function registerManualTreasuryAdjustment(
  input: CreateManualTreasuryAdjustmentInput,
  ctx: ServiceContext,
): Promise<{ id: string }> {
  await assertTreasuryTenantModule(ctx);
  if (!hasCompanyFinanceRole(ctx.roles) || !can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar ajustes de tesorería");
  }

  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new ServiceError("VALIDATION", "El monto debe ser mayor a 0");
  }

  const description = input.description.trim();
  if (!description) {
    throw new ServiceError("VALIDATION", "La descripción es requerida");
  }

  const movementType = input.direction === "INFLOW" ? "INFLOW" : "OUTFLOW";
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);

  const movement = await withIdempotentCreate({
    findExisting: () =>
      prisma.accountMovement.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey },
      }),
    payloadsMatch: (existing) =>
      treasuryMovementReplayMatches(existing, {
        accountId: input.accountId,
        movementDate: input.movementDate,
        type: movementType,
        amount: input.amount,
        description,
      }),
    create: async () => {
      const movementId = randomUUID();
      await prisma.$transaction(async (tx) => {
        await lockTreasuryAccountRow(tx, input.accountId, ctx.tenantId);
        const account = await tx.treasuryAccount.findUnique({ where: { id: input.accountId } });
        if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
        assertResourceTenant(account.tenantId, ctx.tenantId);
        if (account.status !== "ACTIVE") {
          throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
        }
        if (isCrossCompany(account.companyId, ctx)) {
          throw new ServiceError(
            "FORBIDDEN",
            "La cuenta de tesorería no pertenece a la empresa activa.",
          );
        }

        const companyId = ctx.companyId ?? account.companyId ?? null;
        if (!companyId) {
          throw new ServiceError(
            "VALIDATION",
            "El ajuste requiere una empresa activa en el contexto o en la cuenta",
          );
        }
        await assertPeriodOpenUnderCompanyLock(tx, {
          tenantId: ctx.tenantId,
          companyId,
          date: input.movementDate,
        });

        if (movementType === "OUTFLOW") {
          const balance = await getAccountBalance(account.id, tx);
          if (amount.greaterThan(balance)) {
            throw new ServiceError(
              "CONFLICT",
              `Saldo insuficiente. Disponible: ${serializeMoneyDecimal(balance)} ${account.currency}.`,
            );
          }
        }

        await tx.accountMovement.create({
          data: {
            id: movementId,
            tenantId: ctx.tenantId,
            companyId,
            accountId: account.id,
            movementDate: new Date(`${input.movementDate}T00:00:00.000Z`),
            type: movementType,
            sourceType: "MANUAL_ADJUSTMENT",
            sourceId: movementId,
            currency: account.currency,
            amount,
            description,
            status: "CONFIRMED",
            idempotencyKey,
            createdBy: ctx.actorUserId,
          },
        });

        await auditTreasury(
          ctx,
          "account_movement.confirmed",
          "AccountMovement",
          movementId,
          { companyId },
          {
            after: {
              type: movementType,
              sourceType: "MANUAL_ADJUSTMENT",
              amount: input.amount,
              accountId: account.id,
            },
            tx,
          },
        );
      });

      return prisma.accountMovement.findUniqueOrThrow({ where: { id: movementId } });
    },
  });

  await ensureDraftJournalFromTreasuryMovement(movement.id, ctx);

  return { id: movement.id };
}
