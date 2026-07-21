import { Prisma, prisma } from "@bloqer/database";
import type { CreateProcurementQuoteInput } from "@bloqer/validators";
import { calcLine } from "./purchase-order-calc.service";
import { auditProcurement } from "./procurement-audit";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canEditPurchaseOrders, canViewPurchaseRequests } from "./procurement-access";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { getCompanyProcurementSettings } from "./company-procurement-settings.service";

export async function createProcurementQuote(
  input: CreateProcurementQuoteInput,
  ctx: ServiceContext,
): Promise<{ id: string }> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cargar cotizaciones");
  }

  const pr = await prisma.purchaseRequest.findUnique({
    where: { id: input.purchaseRequestId },
    include: { lines: true },
  });
  if (!pr || pr.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  if (!["SUBMITTED", "QUOTE_SELECTED"].includes(pr.status)) {
    throw new ServiceError("CONFLICT", "La solicitud no admite nuevas cotizaciones en este estado");
  }

  const settings = await getCompanyProcurementSettings(pr.companyId, ctx);
  const activeQuotes = await prisma.procurementQuote.count({
    where: {
      purchaseRequestId: pr.id,
      supplierContactId: input.supplierContactId,
      status: { in: ["DRAFT", "RECEIVED", "SELECTED"] },
    },
  });
  if (activeQuotes > 0) {
    throw new ServiceError("CONFLICT", "Ya existe una cotización activa de este proveedor para la solicitud");
  }
  const totalQuotes = await prisma.procurementQuote.count({
    where: { purchaseRequestId: pr.id, status: { notIn: ["REJECTED", "SUPERSEDED"] } },
  });
  if (totalQuotes >= settings.maxQuotesAllowed) {
    throw new ServiceError("CONFLICT", `Máximo ${settings.maxQuotesAllowed} cotizaciones por solicitud`);
  }

  const supplierRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId: input.supplierContactId, role: "SUPPLIER" } },
  });
  if (!supplierRole || supplierRole.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "Proveedor inválido");
  }

  const prLineIds = new Set(pr.lines.map((l) => l.id));
  for (const line of input.lines) {
    if (!prLineIds.has(line.purchaseRequestLineId)) {
      throw new ServiceError("CONFLICT", "Línea de cotización no pertenece a la solicitud");
    }
  }
  if (input.lines.length !== pr.lines.length) {
    throw new ServiceError("CONFLICT", "La cotización debe incluir todas las líneas de la solicitud");
  }

  const quote = await prisma.$transaction(async (tx) => {
    let subtotal = new Prisma.Decimal(0);
    let taxAmount = new Prisma.Decimal(0);
    let totalAmount = new Prisma.Decimal(0);

    const created = await tx.procurementQuote.create({
      data: {
        tenantId: ctx.tenantId,
        purchaseRequestId: pr.id,
        supplierContactId: input.supplierContactId,
        status: "RECEIVED",
        currency: input.currency ?? "ARS",
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        leadTimeDays: input.leadTimeDays ?? null,
        notes: input.notes ?? null,
        receivedAt: new Date(),
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    for (const line of input.lines) {
      const prLine = pr.lines.find((l) => l.id === line.purchaseRequestLineId)!;
      const qty = prLine.quantity;
      const price = new Prisma.Decimal(line.unitPrice);
      const rate = new Prisma.Decimal(line.taxRate ?? "0");
      const calc = calcLine(qty, price, rate);
      subtotal = subtotal.plus(calc.lineSubtotal);
      taxAmount = taxAmount.plus(calc.lineTax);
      totalAmount = totalAmount.plus(calc.lineTotal);
      await tx.procurementQuoteLine.create({
        data: {
          procurementQuoteId: created.id,
          purchaseRequestLineId: line.purchaseRequestLineId,
          unitPrice: price,
          taxRate: rate,
          lineSubtotal: calc.lineSubtotal,
          lineTax: calc.lineTax,
          lineTotal: calc.lineTotal,
          sortOrder: line.sortOrder ?? 0,
        },
      });
    }

    const fx = computeDocumentFxAmounts(
      input.currency ?? "ARS",
      totalAmount,
      input.fxRate ? new Prisma.Decimal(input.fxRate) : null,
    );

    await tx.procurementQuote.update({
      where: { id: created.id },
      data: {
        subtotal,
        taxAmount,
        totalAmount,
        fxRate: fx.fxRate,
        totalAmountArs: fx.amountArs,
      },
    });

    await auditProcurement(
      ctx,
      "procurement_quote.received",
      "ProcurementQuote",
      created.id,
      { projectId: pr.projectId, companyId: pr.companyId },
      { after: { purchaseRequestId: pr.id }, tx },
    );

    return created;
  });

  return { id: quote.id };
}

export async function listProcurementQuotesForRequest(
  purchaseRequestId: string,
  ctx: ServiceContext,
): Promise<
  Array<{
    id: string;
    supplierName: string;
    status: string;
    totalAmount: string;
    totalAmountArs: string;
    currency: string;
    validUntil: string | null;
    leadTimeDays: number | null;
  }>
> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const quotes = await prisma.procurementQuote.findMany({
    where: { purchaseRequestId, tenantId: ctx.tenantId },
    include: {
      supplierContact: { select: { legalName: true, fantasyName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return quotes.map((q) => ({
    id: q.id,
    supplierName: q.supplierContact.fantasyName ?? q.supplierContact.legalName,
    status: q.status,
    totalAmount: q.totalAmount.toString(),
    totalAmountArs: q.totalAmountArs.toString(),
    currency: q.currency,
    validUntil: q.validUntil?.toISOString().slice(0, 10) ?? null,
    leadTimeDays: q.leadTimeDays,
  }));
}

export async function listProcurementQuotesDetailedForRequest(
  purchaseRequestId: string,
  ctx: ServiceContext,
): Promise<
  Array<{
    id: string;
    supplierName: string;
    status: string;
    totalAmount: string;
    totalAmountArs: string;
    currency: string;
    validUntil: string | null;
    leadTimeDays: number | null;
    lines: Array<{
      description: string;
      unit: string;
      quantity: string;
      unitPrice: string;
      budgetUnitCostSnapshot: string | null;
    }>;
  }>
> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const quotes = await prisma.procurementQuote.findMany({
    where: { purchaseRequestId, tenantId: ctx.tenantId },
    include: {
      supplierContact: { select: { legalName: true, fantasyName: true } },
      lines: {
        include: {
          purchaseRequestLine: {
            select: {
              description: true,
              budgetUnitCostSnapshot: true,
              quantity: true,
              unit: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return quotes.map((q) => ({
    id: q.id,
    supplierName: q.supplierContact.fantasyName ?? q.supplierContact.legalName,
    status: q.status,
    totalAmount: q.totalAmount.toString(),
    totalAmountArs: q.totalAmountArs.toString(),
    currency: q.currency,
    validUntil: q.validUntil?.toISOString().slice(0, 10) ?? null,
    leadTimeDays: q.leadTimeDays,
    lines: q.lines.map((l) => ({
      description: l.purchaseRequestLine.description,
      unit: l.purchaseRequestLine.unit,
      quantity: l.purchaseRequestLine.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      budgetUnitCostSnapshot: l.purchaseRequestLine.budgetUnitCostSnapshot?.toString() ?? null,
    })),
  }));
}
