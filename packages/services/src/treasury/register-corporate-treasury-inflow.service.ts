import { randomUUID } from "crypto";
import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateCorporateTreasuryInflowInput } from "@bloqer/validators";
import { auditTreasury } from "./treasury-audit";
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

  const counterpartyContactId = input.counterpartyContactId || null;
  const externalInvoiceRef = input.externalInvoiceRef?.trim() || null;
  const description = input.description.trim();
  if (!description) {
    throw new ServiceError("VALIDATION", "La descripción es requerida");
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

    if (counterpartyContactId) {
      const contact = await tx.contact.findUnique({
        where: { id: counterpartyContactId },
        select: { id: true, tenantId: true, status: true },
      });
      if (!contact || contact.tenantId !== ctx.tenantId) {
        throw new ServiceError("NOT_FOUND", "Contacto de contraparte no encontrado");
      }
      if (contact.status !== "ACTIVE") {
        throw new ServiceError("CONFLICT", "El contacto de contraparte no está activo");
      }

      const clientRole = await tx.contactRole.findUnique({
        where: { contactId_role: { contactId: counterpartyContactId, role: "CLIENT" } },
      });
      if (!clientRole || clientRole.tenantId !== ctx.tenantId || clientRole.status !== "ACTIVE") {
        throw new ServiceError(
          "CONFLICT",
          "El contacto seleccionado no tiene rol de cliente activo",
        );
      }
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
        description,
        counterpartyContactId,
        externalInvoiceRef,
        status: "CONFIRMED",
        createdBy: ctx.actorUserId,
      },
    });

    await auditTreasury(
      ctx,
      "account_movement.confirmed",
      "AccountMovement",
      movementId,
      { companyId: ctx.companyId },
      {
        after: {
          type: "INFLOW",
          sourceType: "MANUAL_ADJUSTMENT",
          amount: input.amount,
          counterpartyContactId,
          externalInvoiceRef,
        },
        tx,
      },
    );
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
