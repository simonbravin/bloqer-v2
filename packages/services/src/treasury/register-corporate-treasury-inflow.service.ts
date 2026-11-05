import { randomUUID } from "crypto";
import { Prisma, prisma } from "@bloqer/database";
import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import {
  createCorporateTreasuryInflowSchema,
  type CreateCorporateTreasuryInflowInput,
} from "@bloqer/validators";
import { auditTreasury } from "./treasury-audit";
import { buildFinancialHref } from "../finance/financial-trace.service";
import type { FinancialTraceLink, RegisterTransactionResult } from "../finance/register-transaction.types";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { assertContactRoleMatchesTenant } from "../contact/assert-contact-role";
import { ensureDraftJournalFromTreasuryMovement } from "../accounting/accounting-auto-draft.service";
import { computeTreasuryFxSnapshot, treasuryFxReplayMatches } from "./treasury-fx";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import {
  requireIdempotencyKey,
  treasuryMovementReplayMatches,
  withIdempotentCreate,
} from "../idempotency/idempotency";
import {
  assertTreasuryPeriodsOpenUnderCompanyLocks,
  lockTreasuryAccountRow,
} from "./treasury-write-locks";

export async function registerCorporateTreasuryInflow(
  rawInput: CreateCorporateTreasuryInflowInput,
  ctx: ServiceContext,
): Promise<RegisterTransactionResult> {
  await assertTreasuryTenantModule(ctx);
  if (!hasCompanyFinanceRole(ctx.roles) || !can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar ingresos de tesorería");
  }
  if (!ctx.companyId) {
    throw new ServiceError(
      "VALIDATION",
      "Selecciona una empresa activa para registrar ingresos corporativos.",
    );
  }

  const parsed = createCorporateTreasuryInflowSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Ingreso inválido");
  }
  const input = parsed.data;
  const amount = new Prisma.Decimal(input.amount);
  const companyId = ctx.companyId;
  const movementDate = new Date(input.movementDate);
  const counterpartyContactId = input.counterpartyContactId || null;
  const externalInvoiceRef = input.externalInvoiceRef?.trim() || null;
  const description = input.description;
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const preview = await prisma.treasuryAccount.findUnique({ where: { id: input.accountId } });
  if (!preview) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
  if (preview.tenantId !== ctx.tenantId || isCrossCompany(preview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta de tesorería no pertenece a la empresa activa.");
  }
  const fx = computeTreasuryFxSnapshot(preview.currency, amount, input.fxRate);

  const movement = await withIdempotentCreate({
    findExisting: () =>
      prisma.accountMovement.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey },
      }),
    payloadsMatch: (existing) =>
      existing.companyId === companyId &&
      existing.currency === preview.currency &&
      treasuryFxReplayMatches(existing, fx) &&
      treasuryMovementReplayMatches(existing, {
        accountId: input.accountId,
        movementDate: input.movementDate,
        type: "INFLOW",
        amount: input.amount,
        description,
        counterpartyContactId,
        externalInvoiceRef,
      }),
    create: async () => {
      const movementId = randomUUID();
      await prisma.$transaction(async (tx) => {
        await assertTreasuryPeriodsOpenUnderCompanyLocks(tx, ctx.tenantId, [
          { companyId, date: movementDate },
        ]);
        await lockTreasuryAccountRow(tx, input.accountId, ctx.tenantId);
        const account = await tx.treasuryAccount.findUnique({ where: { id: input.accountId } });
        if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
        if (account.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
        if (account.status !== "ACTIVE") {
          throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
        }
        // Tesorería es tenant-wide: las cuentas corporativas (companyId null) son válidas para
        // ingresos corporativos; sólo rechazamos cuentas que pertenezcan a OTRA empresa.
        if (isCrossCompany(account.companyId, ctx)) {
          throw new ServiceError(
            "FORBIDDEN",
            "La cuenta de tesorería no pertenece a la empresa activa.",
          );
        }
        if (account.currency !== preview.currency) {
          throw new ServiceError("CONFLICT", "La moneda de la cuenta cambió. Recargá e intentá de nuevo.");
        }

        if (counterpartyContactId) {
          const contact = await tx.contact.findUnique({
            where: { id: counterpartyContactId },
            select: { id: true, tenantId: true, status: true },
          });
          const clientRole = await tx.contactRole.findUnique({
            where: { contactId_role: { contactId: counterpartyContactId, role: "CLIENT" } },
            select: { tenantId: true, status: true },
          });
          assertContactRoleMatchesTenant({
            contact,
            role: clientRole,
            ctxTenantId: ctx.tenantId,
            roleType: "CLIENT",
            contactNotFoundMessage: "Contacto de contraparte no encontrado",
          });
        }

        await tx.accountMovement.create({
          data: {
            id: movementId,
            tenantId: ctx.tenantId,
            companyId,
            accountId: input.accountId,
            movementDate,
            type: "INFLOW",
            sourceType: "MANUAL_ADJUSTMENT",
            sourceId: movementId,
            currency: account.currency,
            amount,
            ...fx,
            description,
            counterpartyContactId,
            externalInvoiceRef,
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
              type: "INFLOW",
              sourceType: "MANUAL_ADJUSTMENT",
              amount: input.amount,
              fxRate: fx.fxRate.toFixed(6),
              amountArs: serializeMoneyDecimal(fx.amountArs),
              counterpartyContactId,
              externalInvoiceRef,
            },
            tx,
          },
        );
      }, { timeout: 30_000 });

      const created = await prisma.accountMovement.findUniqueOrThrow({ where: { id: movementId } });
      return created;
    },
  });

  await ensureDraftJournalFromTreasuryMovement(movement.id, ctx);

  const href = buildFinancialHref("AccountMovement", movement.id, { accountId: movement.accountId });
  const traceChain: FinancialTraceLink[] = [
    { entityType: "AccountMovement", entityId: movement.id, href },
  ];

  return {
    kind: "TREASURY_INFLOW",
    primaryEntityId: movement.id,
    primaryEntityType: "AccountMovement",
    href,
    traceChain,
  };
}
