import { Prisma, prisma } from "@bloqer/database";
import { DEFAULT_IIBB_PERCEPTION_RATE_PCT, type QuoteLineOfferKind } from "@bloqer/domain";
import type { CreateProcurementQuoteInput, UpdateProcurementQuoteInput } from "@bloqer/validators";
import { headerTotalsWithIibbPerception } from "../finance/document-header-tax";
import { auditProcurement } from "./procurement-audit";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canEditPurchaseOrders, canViewPurchaseRequests } from "./procurement-access";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { serializeMoneyDecimal, serializeQtyDecimal, serializeRatePctDecimal, serializeUnitPriceDecimal } from "../finance/money-decimal";
import { resolveInvoiceLineMoney, parseDiscountPct } from "../finance/invoice-line-money";
import { getCompanyProcurementSettings } from "./company-procurement-settings.service";
import { assertContactRoleInTenant } from "../contact/assert-contact-role";
import { assertQuoteNotFrozenByActivePo } from "./purchase-request-to-po.service";

type QuoteWithRequest = Prisma.ProcurementQuoteGetPayload<{
  include: { purchaseRequest: true; lines: true };
}>;

// Classification writes share the SC lock with awards. Allow the bounded award
// transaction to complete instead of expiring at Prisma's default 5-second limit.
const QUOTE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

async function loadMutableQuote(
  quoteId: string, ctx: ServiceContext, db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<QuoteWithRequest> {
  const quote = await db.procurementQuote.findUnique({
    where: { id: quoteId },
    include: { purchaseRequest: true, lines: true },
  });
  if (!quote || quote.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Cotización no encontrada");
  }
  if (quote.status !== "RECEIVED") {
    throw new ServiceError(
      "CONFLICT",
      "Solo se pueden modificar cotizaciones recibidas pendientes de selección",
    );
  }
  if (quote.purchaseRequest.status !== "SUBMITTED") {
    throw new ServiceError("CONFLICT", "La solicitud no admite cambios en cotizaciones en este estado");
  }
  await assertQuoteNotFrozenByActivePo(quoteId, ctx.tenantId, db);
  return quote;
}

function assertQuoteLinesMatchRequest(
  prLines: Array<{ id: string }>,
  inputLines: Array<{ purchaseRequestLineId: string }>,
): void {
  const prLineIds = new Set(prLines.map((l) => l.id));
  const seen = new Set<string>();
  for (const line of inputLines) {
    if (!prLineIds.has(line.purchaseRequestLineId)) {
      throw new ServiceError("CONFLICT", "Línea de cotización no pertenece a la solicitud");
    }
    if (seen.has(line.purchaseRequestLineId)) {
      throw new ServiceError("CONFLICT", "Cada línea de la solicitud debe figurar una sola vez");
    }
    seen.add(line.purchaseRequestLineId);
  }
  if (inputLines.length !== prLines.length) {
    throw new ServiceError("CONFLICT", "La cotización debe incluir todas las líneas de la solicitud");
  }
}

function assertQuoteHasPricedLines(inputLines: Array<{ unitPrice: string }>): void {
  const hasPrice = inputLines.some((line) => {
    try {
      return new Prisma.Decimal(line.unitPrice).greaterThan(0);
    } catch {
      return false;
    }
  });
  if (!hasPrice) {
    throw new ServiceError("VALIDATION", "Ingresá al menos un precio unitario mayor a cero");
  }
}

function assertQuoteBelongsToRequest(quote: QuoteWithRequest, purchaseRequestId: string): void {
  if (quote.purchaseRequestId !== purchaseRequestId) {
    throw new ServiceError("NOT_FOUND", "Cotización no encontrada");
  }
}

async function writeQuoteLines(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  quoteId: string,
  prLines: Array<{ id: string; quantity: Prisma.Decimal }>,
  inputLines: CreateProcurementQuoteInput["lines"],
  pricesIncludeTax: boolean,
  iibbPerceptionRate: Prisma.Decimal,
  previousLines: QuoteWithRequest["lines"] = [],
): Promise<{
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  iibbPerceptionAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  offers: Array<{ purchaseRequestLineId: string; offerKind: QuoteLineOfferKind | null }>;
}> {
  const lineSubtotals: Prisma.Decimal[] = [];
  const lineTaxes: Prisma.Decimal[] = [];
  const offers: Array<{ purchaseRequestLineId: string; offerKind: QuoteLineOfferKind | null }> = [];

  for (const line of inputLines) {
    const prLine = prLines.find((l) => l.id === line.purchaseRequestLineId)!;
    const qty = prLine.quantity;
    const price = new Prisma.Decimal(line.unitPrice);
    const rate = new Prisma.Decimal(line.taxRate ?? "0");
    const previous = previousLines.find((saved) => saved.purchaseRequestLineId === line.purchaseRequestLineId);
    const calc = resolveInvoiceLineMoney({
      quantity: qty, unitPrice: price, taxRate: rate,
      discountPct: parseDiscountPct(line.discountPct), pricesIncludeTax,
      previous: previous ? { ...previous, quantity: qty } : undefined,
    });
    // Missing input preserves historical classification on edit. New positive offers
    // remain compatible with callers predating D-118; zero never implies a gift.
    const offerKind = line.offerKind === undefined
      ? previous ? previous.offerKind : "QUOTED"
      : line.offerKind;
    if (offerKind === null && (!previous || previous.offerKind !== null)) {
      throw new ServiceError("VALIDATION", "No se puede quitar la clasificación de una oferta");
    }
    if (offerKind === "QUOTED" && !calc.lineTotal.greaterThan(0)) {
      throw new ServiceError("VALIDATION", "Un ítem cotizado debe tener total positivo. Indicá No cotizado o Bonificado si corresponde.");
    }
    if ((offerKind === "NOT_QUOTED" || offerKind === "BONIFIED") &&
      (!calc.lineSubtotal.isZero() || !calc.lineTax.isZero() || !calc.lineTotal.isZero())) {
      throw new ServiceError("VALIDATION", "Un ítem no cotizado o bonificado debe tener importe cero");
    }
    if (offerKind === "NOT_QUOTED" && (!price.isZero() || !parseDiscountPct(line.discountPct).isZero())) {
      throw new ServiceError("VALIDATION", "Un ítem no cotizado no lleva precio ni descuento");
    }
    lineSubtotals.push(calc.lineSubtotal);
    lineTaxes.push(calc.lineTax);
    offers.push({ purchaseRequestLineId: line.purchaseRequestLineId, offerKind });
    await tx.procurementQuoteLine.create({
      data: {
        procurementQuoteId: quoteId,
        purchaseRequestLineId: line.purchaseRequestLineId,
        offerKind,
        unitPrice: calc.unitPriceNet,
        taxRate: rate,
        discountPct: parseDiscountPct(line.discountPct),
        lineSubtotal: calc.lineSubtotal,
        lineTax: calc.lineTax,
        lineTotal: calc.lineTotal,
        sortOrder: line.sortOrder ?? 0,
      },
    });
  }

  const totals = headerTotalsWithIibbPerception({
    lineSubtotals,
    lineTaxes,
    iibbPerceptionRate,
  });
  if (!totals.totalAmount.greaterThan(0)) {
    throw new ServiceError("VALIDATION", "El total de la cotización debe ser mayor a cero");
  }
  return { ...totals, offers };
}

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
  if (pr.status !== "SUBMITTED") {
    throw new ServiceError("CONFLICT", "La solicitud no admite nuevas cotizaciones en este estado");
  }

  await assertContactRoleInTenant(input.supplierContactId, "SUPPLIER", ctx.tenantId);

  assertQuoteLinesMatchRequest(pr.lines, input.lines);
  assertQuoteHasPricedLines(input.lines);

  // Ephemeral input only ([D-086]). Never backfill or rewrite historical quotes.
  const pricesIncludeTax = Boolean(input.pricesIncludeTax);

  const quote = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${pr.id} FOR UPDATE`;
    const current = await tx.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id } });
    if (current.status !== "SUBMITTED") {
      throw new ServiceError("CONFLICT", "La solicitud no admite nuevas cotizaciones en este estado");
    }
    // Check capacity only after acquiring the SC lock: another creator may have
    // consumed the slot or added this supplier while this transaction waited.
    const settings = await getCompanyProcurementSettings(current.companyId, ctx, tx);
    const activeQuotes = await tx.procurementQuote.count({
      where: {
        tenantId: ctx.tenantId,
        purchaseRequestId: pr.id,
        supplierContactId: input.supplierContactId,
        status: { in: ["DRAFT", "RECEIVED", "SELECTED"] },
      },
    });
    if (activeQuotes > 0) {
      throw new ServiceError("CONFLICT", "Ya existe una cotización activa de este proveedor para la solicitud");
    }
    const totalQuotes = await tx.procurementQuote.count({
      where: { tenantId: ctx.tenantId, purchaseRequestId: pr.id, status: { notIn: ["REJECTED", "SUPERSEDED"] } },
    });
    if (totalQuotes >= settings.maxQuotesAllowed) {
      throw new ServiceError("CONFLICT", `Máximo ${settings.maxQuotesAllowed} cotizaciones por solicitud`);
    }
    const iibbPerceptionRate = new Prisma.Decimal(input.iibbPerceptionRate ?? DEFAULT_IIBB_PERCEPTION_RATE_PCT);
    const created = await tx.procurementQuote.create({
      data: {
        tenantId: ctx.tenantId,
        purchaseRequestId: pr.id,
        supplierContactId: input.supplierContactId,
        status: "RECEIVED",
        currency: input.currency ?? "ARS",
        iibbPerceptionRate,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        leadTimeDays: input.leadTimeDays ?? null,
        notes: input.notes ?? null,
        receivedAt: new Date(),
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    const { subtotal, taxAmount, iibbPerceptionAmount, totalAmount, offers } = await writeQuoteLines(
      tx,
      created.id,
      pr.lines,
      input.lines,
      pricesIncludeTax,
      iibbPerceptionRate,
    );

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
        iibbPerceptionAmount,
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
      { after: { purchaseRequestId: pr.id, offers }, tx },
    );

    return created;
  }, QUOTE_TRANSACTION_OPTIONS);

  return { id: quote.id };
}

export async function updateProcurementQuote(
  quoteId: string,
  purchaseRequestId: string,
  input: UpdateProcurementQuoteInput,
  ctx: ServiceContext,
): Promise<{ id: string }> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cotizaciones");
  }

  const quote = await loadMutableQuote(quoteId, ctx);
  assertQuoteBelongsToRequest(quote, purchaseRequestId);
  const pr = quote.purchaseRequest;
  const prLines = await prisma.purchaseRequestLine.findMany({
    where: { purchaseRequestId: pr.id },
    select: { id: true, quantity: true },
  });
  assertQuoteLinesMatchRequest(prLines, input.lines);
  assertQuoteHasPricedLines(input.lines);

  const pricesIncludeTax = Boolean(input.pricesIncludeTax);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${pr.id} FOR UPDATE`;
    const quote = await loadMutableQuote(quoteId, ctx, tx);
    const locked = await tx.procurementQuote.updateMany({
      where: {
        id: quoteId,
        tenantId: ctx.tenantId,
        purchaseRequestId,
        status: "RECEIVED",
      },
      data: { updatedBy: ctx.actorUserId },
    });
    if (locked.count !== 1) {
      throw new ServiceError(
        "CONFLICT",
        "La cotización ya no está disponible para editar. Recargá e intentá de nuevo.",
      );
    }

    const previousLines = await tx.procurementQuoteLine.findMany({ where: { procurementQuoteId: quoteId } });
    await tx.procurementQuoteLine.deleteMany({ where: { procurementQuoteId: quoteId } });

    const iibbPerceptionRate = new Prisma.Decimal(
      input.iibbPerceptionRate ?? quote.iibbPerceptionRate.toString(),
    );
    const { subtotal, taxAmount, iibbPerceptionAmount, totalAmount, offers } = await writeQuoteLines(
      tx,
      quoteId,
      prLines,
      input.lines,
      pricesIncludeTax,
      iibbPerceptionRate,
      previousLines,
    );

    const fx = computeDocumentFxAmounts(
      input.currency ?? quote.currency,
      totalAmount,
      input.fxRate ? new Prisma.Decimal(input.fxRate) : quote.fxRate,
    );

    await tx.procurementQuote.update({
      where: { id: quoteId },
      data: {
        currency: input.currency ?? quote.currency,
        validUntil:
          input.validUntil !== undefined
            ? input.validUntil
              ? new Date(input.validUntil)
              : null
            : quote.validUntil,
        leadTimeDays: input.leadTimeDays !== undefined ? input.leadTimeDays : quote.leadTimeDays,
        notes: input.notes !== undefined ? input.notes : quote.notes,
        iibbPerceptionRate,
        subtotal,
        taxAmount,
        iibbPerceptionAmount,
        totalAmount,
        fxRate: fx.fxRate,
        totalAmountArs: fx.amountArs,
        updatedBy: ctx.actorUserId,
      },
    });

    await auditProcurement(
      ctx,
      "procurement_quote.updated",
      "ProcurementQuote",
      quoteId,
      { projectId: pr.projectId, companyId: pr.companyId },
      {
        before: { offers: previousLines.map(line => ({ purchaseRequestLineId: line.purchaseRequestLineId, offerKind: line.offerKind })) },
        after: { purchaseRequestId: pr.id, offers }, tx,
      },
    );
  }, QUOTE_TRANSACTION_OPTIONS);

  return { id: quoteId };
}

export async function deleteProcurementQuote(
  quoteId: string,
  purchaseRequestId: string,
  ctx: ServiceContext,
): Promise<void> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para eliminar cotizaciones");
  }

  const quote = await loadMutableQuote(quoteId, ctx);
  assertQuoteBelongsToRequest(quote, purchaseRequestId);
  const pr = quote.purchaseRequest;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${pr.id} FOR UPDATE`;
    await loadMutableQuote(quoteId, ctx, tx);
    const deleted = await tx.procurementQuote.deleteMany({
      where: {
        id: quoteId,
        tenantId: ctx.tenantId,
        purchaseRequestId,
        status: "RECEIVED",
      },
    });
    if (deleted.count !== 1) {
      throw new ServiceError(
        "CONFLICT",
        "La cotización ya no está disponible para eliminar. Recargá e intentá de nuevo.",
      );
    }
    await auditProcurement(
      ctx,
      "procurement_quote.deleted",
      "ProcurementQuote",
      quoteId,
      { projectId: pr.projectId, companyId: pr.companyId },
      { before: { purchaseRequestId: pr.id, supplierContactId: quote.supplierContactId }, tx },
    );
  }, QUOTE_TRANSACTION_OPTIONS);
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
    totalAmount: serializeMoneyDecimal(q.totalAmount),
    totalAmountArs: serializeMoneyDecimal(q.totalAmountArs),
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
    iibbPerceptionRate: string;
    iibbPerceptionAmount: string;
    lines: Array<{
      purchaseRequestLineId: string;
      offerKind: QuoteLineOfferKind | null;
      description: string;
      unit: string;
      quantity: string;
      unitPrice: string;
      taxRate: string;
      discountPct: string;
      lineSubtotal: string;
      lineTax: string;
      lineTotal: string;
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
    totalAmount: serializeMoneyDecimal(q.totalAmount),
    totalAmountArs: serializeMoneyDecimal(q.totalAmountArs),
    currency: q.currency,
    validUntil: q.validUntil?.toISOString().slice(0, 10) ?? null,
    leadTimeDays: q.leadTimeDays,
    iibbPerceptionRate: serializeRatePctDecimal(q.iibbPerceptionRate),
    iibbPerceptionAmount: serializeMoneyDecimal(q.iibbPerceptionAmount),
    lines: q.lines.map((l) => ({
      purchaseRequestLineId: l.purchaseRequestLineId,
      offerKind: l.offerKind,
      description: l.purchaseRequestLine.description,
      unit: l.purchaseRequestLine.unit,
      quantity: serializeQtyDecimal(l.purchaseRequestLine.quantity),
      unitPrice: serializeUnitPriceDecimal(l.unitPrice),
      taxRate: serializeRatePctDecimal(l.taxRate),
      discountPct: serializeRatePctDecimal(l.discountPct),
      lineSubtotal: serializeMoneyDecimal(l.lineSubtotal),
      lineTax: serializeMoneyDecimal(l.lineTax),
      lineTotal: serializeMoneyDecimal(l.lineTotal),
      budgetUnitCostSnapshot: l.purchaseRequestLine.budgetUnitCostSnapshot != null
        ? serializeUnitPriceDecimal(l.purchaseRequestLine.budgetUnitCostSnapshot)
        : null,
    })),
  }));
}
