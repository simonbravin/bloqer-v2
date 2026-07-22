import type { RegisterArAdvanceInput } from "@bloqer/validators";
import { prisma } from "@bloqer/database";
import type { RegisterTransactionResult } from "../finance/register-transaction.types";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { registerArSale } from "./register-ar-sale.service";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";

const ADVANCE_LINE_DESCRIPTION = "Anticipo de obra";

/** Emite factura + C×C de anticipo y cobra en la misma operación (flujo estándar inicio de obra). */
export async function registerArAdvance(
  input: RegisterArAdvanceInput,
  ctx: ServiceContext,
): Promise<RegisterTransactionResult> {
  if (!input.collectNow?.accountId) {
    throw new ServiceError("VALIDATION", "El anticipo requiere cuenta de tesorería y fecha de cobro");
  }

  const amount = input.amount.trim();
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    throw new ServiceError("VALIDATION", "El monto del anticipo debe ser mayor a 0");
  }

  const currency = input.currency ?? "ARS";

  if (input.collectNow.amount && input.collectNow.amount !== amount) {
    throw new ServiceError(
      "VALIDATION",
      "El monto del cobro debe coincidir con el monto del anticipo",
    );
  }

  await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { tenantId: true, clientContactId: true, companyId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.clientContactId !== input.clientContactId) {
    throw new ServiceError("VALIDATION", "El cliente seleccionado no corresponde al proyecto");
  }
  if (ctx.companyId && project.companyId && project.companyId !== ctx.companyId) {
    throw new ServiceError("FORBIDDEN", "El proyecto no pertenece a la empresa activa");
  }

  const account = await prisma.treasuryAccount.findUnique({
    where: { id: input.collectNow.accountId },
    select: { tenantId: true, status: true, currency: true, companyId: true },
  });
  if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
  if (account.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (account.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
  }
  if (ctx.companyId && account.companyId && account.companyId !== ctx.companyId) {
    throw new ServiceError("FORBIDDEN", "La cuenta de tesorería no pertenece a la empresa activa");
  }
  if (account.currency !== currency) {
    throw new ServiceError(
      "CONFLICT",
      `La moneda del anticipo (${currency}) no coincide con la cuenta (${account.currency}).`,
    );
  }

  return registerArSale(
    {
      projectId: input.projectId,
      clientContactId: input.clientContactId,
      certificationId: null,
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? input.issueDate,
      currency,
      notes: input.notes ?? "Anticipo de cliente — imputado a obra",
      internalNotes: "Registrado vía flujo de anticipo",
      externalInvoiceRef: null,
      lines: [
        {
          description: ADVANCE_LINE_DESCRIPTION,
          quantity: "1",
          unitPrice: amount,
          taxRate: "0",
          sortOrder: 0,
        },
      ],
      collectNow: {
        accountId: input.collectNow.accountId,
        collectionDate: input.collectNow.collectionDate,
        collectFullBalance: true,
        notes: input.collectNow.notes ?? "Cobro de anticipo",
      },
    },
    ctx,
  );
}
