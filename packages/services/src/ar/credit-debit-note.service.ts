/**
 * Sales credit / debit notes ([D-115]).
 * CREDIT_NOTE: non-cash application onto parent Receivable.
 * DEBIT_NOTE: new Receivable 1:1 (increases AR).
 */
import { Prisma, prisma, type SalesInvoice, type SalesInvoiceStatus } from "@bloqer/database";
import { productCalendarDateUtc } from "@bloqer/utils";
import {
  computeObligationBalanceDue,
  effectiveObligationCreditedAfterCredit,
  normalizeObligationBalanceDue,
} from "../finance/obligation-balance";
import { resolveObligationStoredStatus } from "../finance/obligation-stored-status";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertInvoiceLetterOnIssue } from "../finance/invoice-letter-guards";
import { assertInvoiceLetterTaxConsistencyOnIssue } from "../finance/invoice-letter-tax-guards";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
} from "../finance/money-decimal";
import { classFieldsForSalesInvoice } from "../finance/document-class.service";
import { isCrossCompany } from "../company-scope";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canMutateArForScope, canViewArProjectArea, canViewCompanyAr } from "./ar-access";
import { auditAr } from "./ar-audit";
import {
  assertInvoiceEditable,
  type SalesInvoiceWithLines,
} from "./sales-invoice.service";
import { recalcInvoiceTotals } from "./sales-invoice-calc.service";
import { requireProjectAccessIfPresent } from "../security/access";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { ensureDraftJournalFromSalesInvoice } from "../accounting/accounting-auto-draft.service";

async function assertProjectGuardIfPresent(
  projectId: string | null | undefined,
  ctx: ServiceContext,
): Promise<void> {
  if (projectId) {
    await requireProjectAccessIfPresent(projectId, ctx);
    await assertProjectAllowsOperationalMutation(projectId, ctx);
  }
}

function sameProjectScope(
  a: string | null,
  b: string | null,
): boolean {
  return a === b;
}

async function nextSalesDocumentNumber(
  tx: Prisma.TransactionClient,
  args: { tenantId: string; companyId: string; documentKind: "CREDIT_NOTE" | "DEBIT_NOTE" },
): Promise<number> {
  const maxNum = await tx.salesInvoice.aggregate({
    where: {
      tenantId: args.tenantId,
      companyId: args.companyId,
      documentKind: args.documentKind,
    },
    _max: { number: true },
  });
  return (maxNum._max.number ?? 0) + 1;
}

async function loadIssuedParentInvoice(parentId: string, ctx: ServiceContext) {
  const parent = await prisma.salesInvoice.findUnique({
    where: { id: parentId },
    include: {
      receivable: true,
      lines: { orderBy: { sortOrder: "asc" } },
      clientContact: { select: { legalName: true, fantasyName: true, country: true } },
      company: { select: { country: true } },
    },
  });
  if (!parent) throw new ServiceError("NOT_FOUND", "Factura de referencia no encontrada");
  if (parent.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (isCrossCompany(parent.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  if (parent.documentKind !== "INVOICE") {
    throw new ServiceError(
      "VALIDATION",
      "La nota debe referenciar una factura (no otra NC/ND).",
    );
  }
  if (parent.status !== "ISSUED") {
    throw new ServiceError(
      "CONFLICT",
      "La factura de referencia debe estar emitida.",
    );
  }
  return parent;
}

type CreateNoteFromInvoiceInput = {
  parentSalesInvoiceId: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string | null;
  /** Optional override; default = full open balance (NC) or empty lines copy (ND). */
  lines?: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    taxRate?: string;
    discountPct?: string;
    sortOrder?: number;
  }>;
};

async function createNoteDraft(
  kind: "CREDIT_NOTE" | "DEBIT_NOTE",
  input: CreateNoteFromInvoiceInput,
  ctx: ServiceContext,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  const parent = await loadIssuedParentInvoice(input.parentSalesInvoiceId, ctx);
  if (!canMutateArForScope(ctx.roles, parent.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear notas de crédito/débito");
  }
  await assertProjectGuardIfPresent(parent.projectId, ctx);

  if (kind === "CREDIT_NOTE") {
    if (!parent.receivable || parent.receivable.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La factura no tiene cuenta por cobrar activa.");
    }
    const balance = normalizeObligationBalanceDue(
      computeObligationBalanceDue(
        parent.receivable.originalAmount,
        parent.receivable.paidAmount,
        parent.receivable.creditedAmount,
      ),
    );
    if (!balance.greaterThan(0)) {
      throw new ServiceError("CONFLICT", "La factura ya no tiene saldo pendiente para una NC.");
    }
  }

  const issueDate = input.issueDate
    ? productCalendarDateUtc(new Date(input.issueDate))
    : productCalendarDateUtc();
  const dueDate = input.dueDate
    ? productCalendarDateUtc(new Date(input.dueDate))
    : parent.dueDate;

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextSalesDocumentNumber(tx, {
      tenantId: ctx.tenantId,
      companyId: parent.companyId,
      documentKind: kind,
    });

    const note = await tx.salesInvoice.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: parent.companyId,
        projectId: parent.projectId,
        clientContactId: parent.clientContactId,
        certificationId: null,
        number,
        documentKind: kind,
        referencedSalesInvoiceId: parent.id,
        issueDate,
        dueDate,
        currency: parent.currency,
        fxRate: parent.fxRate,
        invoiceLetter: parent.invoiceLetter,
        // NC amount is the credit to apply (gross). Do not inherit parent IIBB or the
        // partial/dialog amount is silently inflated by recalcInvoiceTotals.
        iibbPerceptionRate:
          kind === "CREDIT_NOTE" ? new Prisma.Decimal(0) : parent.iibbPerceptionRate,
        notes: input.notes ?? null,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    let sourceLines:
      | Array<{
          description: string;
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
          taxRate: Prisma.Decimal;
          discountPct: Prisma.Decimal;
          sortOrder: number;
        }>
      | null = null;

    if (input.lines && input.lines.length > 0) {
      sourceLines = input.lines.map((l, i) => ({
        description: l.description,
        quantity: new Prisma.Decimal(l.quantity),
        unitPrice: new Prisma.Decimal(l.unitPrice),
        taxRate: new Prisma.Decimal(l.taxRate ?? "0"),
        discountPct: new Prisma.Decimal(l.discountPct ?? "0"),
        sortOrder: l.sortOrder ?? i,
      }));
    } else if (kind === "CREDIT_NOTE" && parent.receivable) {
      const balance = normalizeObligationBalanceDue(
        computeObligationBalanceDue(
          parent.receivable.originalAmount,
          parent.receivable.paidAmount,
          parent.receivable.creditedAmount,
        ),
      );
      sourceLines = [
        {
          description: `Nota de crédito s/ factura ${parent.number}`,
          quantity: new Prisma.Decimal(1),
          unitPrice: balance,
          taxRate: new Prisma.Decimal(0),
          discountPct: new Prisma.Decimal(0),
          sortOrder: 0,
        },
      ];
    } else {
      sourceLines = parent.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        discountPct: l.discountPct,
        sortOrder: l.sortOrder,
      }));
    }

    for (const line of sourceLines) {
      const lineSubtotal = line.quantity
        .mul(line.unitPrice)
        .mul(new Prisma.Decimal(1).minus(line.discountPct.div(100)));
      const lineTax = lineSubtotal.mul(line.taxRate.div(100));
      const lineTotal = lineSubtotal.plus(lineTax);
      await tx.salesInvoiceLine.create({
        data: {
          invoiceId: note.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          discountPct: line.discountPct,
          lineSubtotal,
          lineTax,
          lineTotal,
          sortOrder: line.sortOrder,
        },
      });
    }

    await recalcInvoiceTotals(tx as never, note.id);

    if (kind === "CREDIT_NOTE" && parent.receivable) {
      const balance = normalizeObligationBalanceDue(
        computeObligationBalanceDue(
          parent.receivable.originalAmount,
          parent.receivable.paidAmount,
          parent.receivable.creditedAmount,
        ),
      );
      const refreshed = await tx.salesInvoice.findUniqueOrThrow({ where: { id: note.id } });
      if (refreshed.totalAmount.greaterThan(balance)) {
        throw new ServiceError(
          "CONFLICT",
          `La NC (${serializeMoneyDecimal(refreshed.totalAmount)}) supera el saldo pendiente (${serializeMoneyDecimal(balance)}).`,
        );
      }
    }

    const full = await tx.salesInvoice.findUniqueOrThrow({
      where: { id: note.id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAr(
      ctx,
      kind === "CREDIT_NOTE" ? "sales_credit_note.created" : "sales_debit_note.created",
      "SalesInvoice",
      note.id,
      { projectId: note.projectId, companyId: note.companyId },
      {
        after: {
          documentKind: kind,
          referencedSalesInvoiceId: parent.id,
          number: note.number,
        },
        tx,
      },
    );

    return full;
  });

  return mapNoteView(created);
}

function mapNoteView(
  inv: SalesInvoice & {
    lines: Array<{
      id: string;
      invoiceId: string;
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      discountPct: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      lineTax: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      certificationLineId: string | null;
      sortOrder: number;
    }>;
    clientContact: { legalName: string; fantasyName: string | null };
  },
): SalesInvoiceWithLines {
  const prefix =
    inv.documentKind === "CREDIT_NOTE"
      ? "NC"
      : inv.documentKind === "DEBIT_NOTE"
        ? "ND"
        : "FAC";
  return {
    ...inv,
    code: `${prefix}-${String(inv.number).padStart(5, "0")}`,
    clientName: inv.clientContact.fantasyName ?? inv.clientContact.legalName,
    subtotal: serializeMoneyDecimal(inv.subtotal),
    taxAmount: serializeMoneyDecimal(inv.taxAmount),
    iibbPerceptionRate: serializeRatePctDecimal(inv.iibbPerceptionRate),
    iibbPerceptionAmount: serializeMoneyDecimal(inv.iibbPerceptionAmount),
    totalAmount: serializeMoneyDecimal(inv.totalAmount),
    lines: inv.lines.map((l) => ({
      id: l.id,
      invoiceId: l.invoiceId,
      description: l.description,
      quantity: serializeQtyDecimal(l.quantity),
      unitPrice: serializeUnitPriceDecimal(l.unitPrice),
      taxRate: serializeRatePctDecimal(l.taxRate),
      discountPct: serializeRatePctDecimal(l.discountPct),
      lineSubtotal: serializeMoneyDecimal(l.lineSubtotal),
      lineTax: serializeMoneyDecimal(l.lineTax),
      lineTotal: serializeMoneyDecimal(l.lineTotal),
      certificationLineId: l.certificationLineId,
      sortOrder: l.sortOrder,
    })),
    ...classFieldsForSalesInvoice({
      projectId: inv.projectId,
      certificationId: inv.certificationId,
    }),
  };
}

export async function createSalesCreditNoteFromInvoice(
  input: CreateNoteFromInvoiceInput,
  ctx: ServiceContext,
): Promise<SalesInvoiceWithLines> {
  return createNoteDraft("CREDIT_NOTE", input, ctx);
}

export async function createSalesDebitNoteFromInvoice(
  input: CreateNoteFromInvoiceInput,
  ctx: ServiceContext,
): Promise<SalesInvoiceWithLines> {
  return createNoteDraft("DEBIT_NOTE", input, ctx);
}

export async function issueSalesCreditNote(
  id: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.salesInvoice.findUnique({
      where: { id },
      include: {
        lines: true,
        clientContact: { select: { legalName: true, fantasyName: true, country: true } },
        company: { select: { country: true } },
      },
    });
    if (!inv) throw new ServiceError("NOT_FOUND", "Nota de crédito no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (projectScopeId !== undefined && inv.projectId !== projectScopeId) {
      throw new ServiceError("FORBIDDEN", "La nota no pertenece a este proyecto");
    }
    if (isCrossCompany(inv.companyId, ctx)) {
      throw new ServiceError("FORBIDDEN", "La nota no pertenece a la empresa activa");
    }
    if (!canMutateArForScope(ctx.roles, inv.projectId)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para emitir notas de crédito");
    }
    await assertProjectGuardIfPresent(inv.projectId, ctx);
    assertInvoiceEditable(inv);
    if (inv.documentKind !== "CREDIT_NOTE") {
      throw new ServiceError("VALIDATION", "El comprobante no es una nota de crédito.");
    }
    if (!inv.referencedSalesInvoiceId) {
      throw new ServiceError("VALIDATION", "La NC requiere factura de referencia.");
    }
    if (inv.lines.length === 0) {
      throw new ServiceError("CONFLICT", "No se puede emitir una NC sin líneas");
    }

    assertInvoiceLetterOnIssue({
      invoiceLetter: inv.invoiceLetter,
      companyCountry: inv.company.country,
      counterpartyCountry: inv.clientContact.country,
      documentLabel: "nota de crédito",
    });
    await recalcInvoiceTotals(tx as never, id);
    const refreshed = await tx.salesInvoice.findUniqueOrThrow({ where: { id } });
    if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El total de la NC debe ser mayor a 0");
    }
    assertInvoiceLetterTaxConsistencyOnIssue({
      invoiceLetter: inv.invoiceLetter,
      taxAmount: refreshed.taxAmount,
    });

    const parent = await tx.salesInvoice.findUnique({
      where: { id: inv.referencedSalesInvoiceId },
      include: { receivable: true },
    });
    if (!parent || parent.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Factura de referencia no encontrada");
    }
    if (parent.documentKind !== "INVOICE" || parent.status !== "ISSUED") {
      throw new ServiceError("CONFLICT", "La factura de referencia no está emitida.");
    }
    if (parent.clientContactId !== inv.clientContactId || parent.currency !== inv.currency) {
      throw new ServiceError("VALIDATION", "La NC debe coincidir en cliente y moneda con la factura.");
    }
    if (!sameProjectScope(parent.projectId, inv.projectId) || parent.companyId !== inv.companyId) {
      throw new ServiceError("VALIDATION", "La NC debe coincidir en empresa y obra con la factura.");
    }
    if (!parent.receivable || parent.receivable.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La factura no tiene cuenta por cobrar activa.");
    }

    const balanceDue = normalizeObligationBalanceDue(
      computeObligationBalanceDue(
        parent.receivable.originalAmount,
        parent.receivable.paidAmount,
        parent.receivable.creditedAmount,
      ),
    );
    if (refreshed.totalAmount.greaterThan(balanceDue)) {
      throw new ServiceError(
        "CONFLICT",
        `La NC (${serializeMoneyDecimal(refreshed.totalAmount)}) supera el saldo pendiente (${serializeMoneyDecimal(balanceDue)}).`,
      );
    }

    const { computeDocumentFxAmounts } = await import("../finance/fx-amount.service");
    const fx = computeDocumentFxAmounts(refreshed.currency, refreshed.totalAmount, refreshed.fxRate);

    const flipped = await tx.salesInvoice.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT", documentKind: "CREDIT_NOTE" },
      data: {
        status: "ISSUED",
        fxRate: fx.fxRate,
        amountArs: fx.amountArs,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La nota de crédito ya no está en borrador. Recargá e intentá de nuevo.",
    );

    const newCredited = effectiveObligationCreditedAfterCredit(
      parent.receivable.originalAmount,
      parent.receivable.paidAmount,
      parent.receivable.creditedAmount.plus(refreshed.totalAmount),
    );
    const newStatus = resolveObligationStoredStatus(
      parent.receivable.paidAmount,
      parent.receivable.originalAmount,
      newCredited,
    );

    await tx.receivableCreditApplication.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: inv.companyId,
        receivableId: parent.receivable.id,
        creditNoteSalesInvoiceId: inv.id,
        amount: refreshed.totalAmount,
        status: "CONFIRMED",
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    const creditedUpdate = await tx.receivable.updateMany({
      where: {
        id: parent.receivable.id,
        tenantId: ctx.tenantId,
        paidAmount: parent.receivable.paidAmount,
        creditedAmount: parent.receivable.creditedAmount,
        status: { not: "CANCELLED" },
      },
      data: {
        creditedAmount: newCredited,
        status: newStatus,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      creditedUpdate.count,
      "El saldo de la cuenta por cobrar cambió. Recargá e intentá de nuevo.",
    );

    const issued = await tx.salesInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAr(
      ctx,
      "sales_credit_note.issued",
      "SalesInvoice",
      id,
      { projectId: issued.projectId, companyId: issued.companyId },
      {
        before: { status: "DRAFT" },
        after: {
          status: "ISSUED",
          creditedAmount: serializeMoneyDecimal(newCredited),
          receivableId: parent.receivable.id,
        },
        tx,
      },
    );

    return issued;
  });

  await ensureDraftJournalFromSalesInvoice(result.id, ctx);
  return mapNoteView(result);
}

export async function issueSalesDebitNote(
  id: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.salesInvoice.findUnique({
      where: { id },
      include: {
        lines: true,
        clientContact: { select: { legalName: true, fantasyName: true, country: true } },
        company: { select: { country: true } },
      },
    });
    if (!inv) throw new ServiceError("NOT_FOUND", "Nota de débito no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (projectScopeId !== undefined && inv.projectId !== projectScopeId) {
      throw new ServiceError("FORBIDDEN", "La nota no pertenece a este proyecto");
    }
    if (isCrossCompany(inv.companyId, ctx)) {
      throw new ServiceError("FORBIDDEN", "La nota no pertenece a la empresa activa");
    }
    if (!canMutateArForScope(ctx.roles, inv.projectId)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para emitir notas de débito");
    }
    await assertProjectGuardIfPresent(inv.projectId, ctx);
    assertInvoiceEditable(inv);
    if (inv.documentKind !== "DEBIT_NOTE") {
      throw new ServiceError("VALIDATION", "El comprobante no es una nota de débito.");
    }
    if (!inv.referencedSalesInvoiceId) {
      throw new ServiceError("VALIDATION", "La ND requiere factura de referencia.");
    }
    if (inv.lines.length === 0) {
      throw new ServiceError("CONFLICT", "No se puede emitir una ND sin líneas");
    }

    assertInvoiceLetterOnIssue({
      invoiceLetter: inv.invoiceLetter,
      companyCountry: inv.company.country,
      counterpartyCountry: inv.clientContact.country,
      documentLabel: "nota de débito",
    });
    await recalcInvoiceTotals(tx as never, id);
    const refreshed = await tx.salesInvoice.findUniqueOrThrow({ where: { id } });
    if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El total de la ND debe ser mayor a 0");
    }
    assertInvoiceLetterTaxConsistencyOnIssue({
      invoiceLetter: inv.invoiceLetter,
      taxAmount: refreshed.taxAmount,
    });

    const parent = await tx.salesInvoice.findUnique({
      where: { id: inv.referencedSalesInvoiceId },
    });
    if (!parent || parent.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Factura de referencia no encontrada");
    }
    if (parent.documentKind !== "INVOICE" || parent.status !== "ISSUED") {
      throw new ServiceError("CONFLICT", "La factura de referencia no está emitida.");
    }
    if (parent.clientContactId !== inv.clientContactId || parent.currency !== inv.currency) {
      throw new ServiceError("VALIDATION", "La ND debe coincidir en cliente y moneda con la factura.");
    }
    if (!sameProjectScope(parent.projectId, inv.projectId) || parent.companyId !== inv.companyId) {
      throw new ServiceError("VALIDATION", "La ND debe coincidir en empresa y obra con la factura.");
    }

    const { computeDocumentFxAmounts } = await import("../finance/fx-amount.service");
    const fx = computeDocumentFxAmounts(refreshed.currency, refreshed.totalAmount, refreshed.fxRate);

    const flipped = await tx.salesInvoice.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT", documentKind: "DEBIT_NOTE" },
      data: {
        status: "ISSUED",
        fxRate: fx.fxRate,
        amountArs: fx.amountArs,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La nota de débito ya no está en borrador. Recargá e intentá de nuevo.",
    );

    await tx.receivable.create({
      data: {
        tenantId: inv.tenantId,
        companyId: inv.companyId,
        projectId: inv.projectId,
        clientContactId: inv.clientContactId,
        salesInvoiceId: inv.id,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        currency: inv.currency,
        originalAmount: refreshed.totalAmount,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    const issued = await tx.salesInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAr(
      ctx,
      "sales_debit_note.issued",
      "SalesInvoice",
      id,
      { projectId: issued.projectId, companyId: issued.companyId },
      { before: { status: "DRAFT" }, after: { status: "ISSUED", number: issued.number }, tx },
    );

    return issued;
  });

  await ensureDraftJournalFromSalesInvoice(result.id, ctx);
  return mapNoteView(result);
}

export async function cancelSalesCreditNote(
  id: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.salesInvoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { legalName: true, fantasyName: true } },
        creditApplicationAsNote: true,
      },
    });
    if (!inv) throw new ServiceError("NOT_FOUND", "Nota de crédito no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (projectScopeId !== undefined && inv.projectId !== projectScopeId) {
      throw new ServiceError("FORBIDDEN", "La nota no pertenece a este proyecto");
    }
    if (isCrossCompany(inv.companyId, ctx)) {
      throw new ServiceError("FORBIDDEN", "La nota no pertenece a la empresa activa");
    }
    if (!canMutateArForScope(ctx.roles, inv.projectId)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para anular notas de crédito");
    }
    await assertProjectGuardIfPresent(inv.projectId, ctx);
    if (inv.documentKind !== "CREDIT_NOTE") {
      throw new ServiceError("VALIDATION", "El comprobante no es una nota de crédito.");
    }
    if (inv.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La nota de crédito ya está anulada.");
    }
    if (inv.status === "DRAFT") {
      const cancelled = await tx.salesInvoice.update({
        where: { id },
        data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
        include: {
          lines: { orderBy: { sortOrder: "asc" } },
          clientContact: { select: { legalName: true, fantasyName: true } },
        },
      });
      await auditAr(
        ctx,
        "sales_credit_note.cancelled",
        "SalesInvoice",
        id,
        { projectId: cancelled.projectId, companyId: cancelled.companyId },
        { before: { status: "DRAFT" }, after: { status: "CANCELLED" }, tx },
      );
      return cancelled;
    }

    await assertJournalAllowsOperationalCancel(ctx, {
      companyId: inv.companyId,
      sourceType: "SALES_CREDIT_NOTE",
      sourceId: id,
      sourceLabel: "la nota de crédito",
    });

    const app = inv.creditApplicationAsNote;
    if (!app || app.status !== "CONFIRMED") {
      throw new ServiceError(
        "CONFLICT",
        "La NC emitida no tiene aplicación de crédito activa.",
      );
    }

    const receivable = await tx.receivable.findUnique({ where: { id: app.receivableId } });
    if (!receivable || receivable.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
    }

    const newCredited = receivable.creditedAmount.minus(app.amount);
    if (newCredited.lessThan(0)) {
      throw new ServiceError("CONFLICT", "Inconsistencia de creditedAmount al anular NC.");
    }
    const newStatus = resolveObligationStoredStatus(
      receivable.paidAmount,
      receivable.originalAmount,
      newCredited,
    );

    const appFlip = await tx.receivableCreditApplication.updateMany({
      where: { id: app.id, status: "CONFIRMED" },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(appFlip.count, "La aplicación de crédito ya fue anulada.");

    const recvFlip = await tx.receivable.updateMany({
      where: {
        id: receivable.id,
        paidAmount: receivable.paidAmount,
        creditedAmount: receivable.creditedAmount,
        status: { not: "CANCELLED" },
      },
      data: {
        creditedAmount: newCredited,
        status: newStatus,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(recvFlip.count, "El saldo de la CxC cambió. Recargá e intentá de nuevo.");

    const cancelled = await tx.salesInvoice.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAr(
      ctx,
      "sales_credit_note.cancelled",
      "SalesInvoice",
      id,
      { projectId: cancelled.projectId, companyId: cancelled.companyId },
      {
        before: { status: "ISSUED" },
        after: { status: "CANCELLED", creditedAmount: serializeMoneyDecimal(newCredited) },
        tx,
      },
    );

    return cancelled;
  });

  await cancelDraftJournalOnOperationalCancel(ctx, {
    companyId: result.companyId,
    sourceType: "SALES_CREDIT_NOTE",
    sourceId: id,
    sourceLabel: "la nota de crédito",
  });

  return mapNoteView(result);
}

/** Count ISSUED NC/ND that reference this invoice ([BR-NC-005]). */
export async function countActiveCreditDebitNotesForSalesInvoice(
  salesInvoiceId: string,
  tenantId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  return tx.salesInvoice.count({
    where: {
      tenantId,
      referencedSalesInvoiceId: salesInvoiceId,
      documentKind: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] },
      status: "ISSUED",
    },
  });
}

export type RelatedFiscalNoteRow = {
  id: string;
  code: string;
  documentKind: "CREDIT_NOTE" | "DEBIT_NOTE";
  status: SalesInvoiceStatus;
  totalAmount: string;
  currency: string;
  issueDate: Date;
};

/** NC/ND (any status) that reference this sales invoice — for detail UI. */
export async function listCreditDebitNotesForSalesInvoice(
  salesInvoiceId: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<RelatedFiscalNoteRow[]> {
  await assertArTenantModule(ctx);
  const parent = await prisma.salesInvoice.findUnique({
    where: { id: salesInvoiceId },
    select: { id: true, tenantId: true, companyId: true, projectId: true },
  });
  if (!parent || parent.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  }
  if (isCrossCompany(parent.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  if (projectScopeId !== undefined && parent.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
  }
  if (parent.projectId === null) {
    if (!canViewCompanyAr(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de venta a nivel empresa");
    }
  } else if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas");
  }
  await requireProjectAccessIfPresent(parent.projectId, ctx);

  const notes = await prisma.salesInvoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      referencedSalesInvoiceId: salesInvoiceId,
      documentKind: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] },
    },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    select: {
      id: true,
      number: true,
      documentKind: true,
      status: true,
      totalAmount: true,
      currency: true,
      issueDate: true,
    },
  });

  return notes.map((n) => {
    const prefix = n.documentKind === "CREDIT_NOTE" ? "NC" : "ND";
    return {
      id: n.id,
      code: `${prefix}-${String(n.number).padStart(5, "0")}`,
      documentKind: n.documentKind as "CREDIT_NOTE" | "DEBIT_NOTE",
      status: n.status,
      totalAmount: serializeMoneyDecimal(n.totalAmount),
      currency: n.currency,
      issueDate: n.issueDate,
    };
  });
}
