/**
 * Supplier credit / debit notes ([D-115]).
 * CREDIT_NOTE: non-cash application onto parent Payable.
 * DEBIT_NOTE: new Payable 1:1 (increases AP).
 */
import { Prisma, prisma, type CostCategory, type SupplierInvoice } from "@bloqer/database";
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
import { classFieldsForSupplierInvoice } from "../finance/document-class.service";
import { isCrossCompany } from "../company-scope";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canMutateApForScope } from "./ap-access";
import { auditAp } from "./ap-audit";
import {
  assertSupplierInvoiceEditable,
  type SupplierInvoiceView,
} from "./supplier-invoice.service";
import { recalcSupplierInvoiceTotals } from "./supplier-invoice-calc.service";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { requireProjectAccessIfPresent } from "../security/access";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { ensureDraftJournalFromSupplierInvoice } from "../accounting/accounting-auto-draft.service";

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

async function nextSupplierDocumentNumber(
  tx: Prisma.TransactionClient,
  args: { tenantId: string; companyId: string; documentKind: "CREDIT_NOTE" | "DEBIT_NOTE" },
): Promise<number> {
  const maxNum = await tx.supplierInvoice.aggregate({
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
  const parent = await prisma.supplierInvoice.findUnique({
    where: { id: parentId },
    include: {
      payable: true,
      lines: { orderBy: { sortOrder: "asc" } },
      supplierContact: { select: { legalName: true, fantasyName: true, country: true } },
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
  parentSupplierInvoiceId: string;
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
    wbsNodeId?: string | null;
    costType?: CostCategory | null;
  }>;
};

async function createNoteDraft(
  kind: "CREDIT_NOTE" | "DEBIT_NOTE",
  input: CreateNoteFromInvoiceInput,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  const parent = await loadIssuedParentInvoice(input.parentSupplierInvoiceId, ctx);
  if (!canMutateApForScope(ctx.roles, parent.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear notas de crédito/débito");
  }
  await assertProjectGuardIfPresent(parent.projectId, ctx);

  if (kind === "CREDIT_NOTE") {
    if (!parent.payable || parent.payable.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La factura no tiene cuenta por pagar activa.");
    }
    const balance = normalizeObligationBalanceDue(
      computeObligationBalanceDue(
        parent.payable.originalAmount,
        parent.payable.paidAmount,
        parent.payable.creditedAmount,
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
    const number = await nextSupplierDocumentNumber(tx, {
      tenantId: ctx.tenantId,
      companyId: parent.companyId,
      documentKind: kind,
    });

    const note = await tx.supplierInvoice.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: parent.companyId,
        projectId: parent.projectId,
        supplierContactId: parent.supplierContactId,
        purchaseOrderId: null,
        subcontractCertificationId: null,
        number,
        documentKind: kind,
        referencedSupplierInvoiceId: parent.id,
        issueDate,
        dueDate,
        currency: parent.currency,
        fxRate: parent.fxRate,
        invoiceLetter: parent.invoiceLetter,
        iibbPerceptionRate:
          kind === "CREDIT_NOTE" && (!input.lines || input.lines.length === 0)
            ? new Prisma.Decimal(0)
            : parent.iibbPerceptionRate,
        notes: input.notes ?? null,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    let sourceLines: Array<{
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      discountPct: Prisma.Decimal;
      sortOrder: number;
      wbsNodeId: string | null;
      costType: CostCategory | null;
    }>;

    if (input.lines && input.lines.length > 0) {
      sourceLines = input.lines.map((l, i) => ({
        description: l.description,
        quantity: new Prisma.Decimal(l.quantity),
        unitPrice: new Prisma.Decimal(l.unitPrice),
        taxRate: new Prisma.Decimal(l.taxRate ?? "0"),
        discountPct: new Prisma.Decimal(l.discountPct ?? "0"),
        sortOrder: l.sortOrder ?? i,
        wbsNodeId: l.wbsNodeId ?? null,
        costType: l.costType ?? null,
      }));
    } else if (kind === "CREDIT_NOTE" && parent.payable) {
      const balance = normalizeObligationBalanceDue(
        computeObligationBalanceDue(
          parent.payable.originalAmount,
          parent.payable.paidAmount,
          parent.payable.creditedAmount,
        ),
      );
      const firstLine = parent.lines[0];
      sourceLines = [
        {
          description: `Nota de crédito s/ factura ${parent.number}`,
          quantity: new Prisma.Decimal(1),
          unitPrice: balance,
          taxRate: new Prisma.Decimal(0),
          discountPct: new Prisma.Decimal(0),
          sortOrder: 0,
          wbsNodeId: firstLine?.wbsNodeId ?? null,
          costType: firstLine?.costType ?? null,
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
        wbsNodeId: l.wbsNodeId,
        costType: l.costType,
      }));
    }

    for (const line of sourceLines) {
      const lineSubtotal = line.quantity
        .mul(line.unitPrice)
        .mul(new Prisma.Decimal(1).minus(line.discountPct.div(100)));
      const lineTax = lineSubtotal.mul(line.taxRate.div(100));
      const lineTotal = lineSubtotal.plus(lineTax);
      await tx.supplierInvoiceLine.create({
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
          wbsNodeId: line.wbsNodeId,
          costType: line.costType,
          purchaseOrderLineId: null,
          costAnalysisLineId: null,
        },
      });
    }

    await recalcSupplierInvoiceTotals(tx, note.id);

    if (kind === "CREDIT_NOTE" && parent.payable) {
      const balance = normalizeObligationBalanceDue(
        computeObligationBalanceDue(
          parent.payable.originalAmount,
          parent.payable.paidAmount,
          parent.payable.creditedAmount,
        ),
      );
      const refreshed = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: note.id } });
      if (refreshed.totalAmount.greaterThan(balance)) {
        const firstLine = parent.lines[0];
        await tx.supplierInvoiceLine.deleteMany({ where: { invoiceId: note.id } });
        await tx.supplierInvoiceLine.create({
          data: {
            invoiceId: note.id,
            description: `Nota de crédito s/ factura ${parent.number}`,
            quantity: new Prisma.Decimal(1),
            unitPrice: balance,
            taxRate: new Prisma.Decimal(0),
            discountPct: new Prisma.Decimal(0),
            lineSubtotal: balance,
            lineTax: new Prisma.Decimal(0),
            lineTotal: balance,
            sortOrder: 0,
            wbsNodeId: parent.projectId ? (firstLine?.wbsNodeId ?? null) : null,
            costType: firstLine?.costType ?? null,
            purchaseOrderLineId: null,
            costAnalysisLineId: null,
          },
        });
        await tx.supplierInvoice.update({
          where: { id: note.id },
          data: {
            iibbPerceptionRate: new Prisma.Decimal(0),
            iibbPerceptionAmount: new Prisma.Decimal(0),
            subtotal: balance,
            taxAmount: new Prisma.Decimal(0),
            totalAmount: balance,
            amountArs: balance,
          },
        });
      }
    }

    const full = await tx.supplierInvoice.findUniqueOrThrow({
      where: { id: note.id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAp(
      ctx,
      kind === "CREDIT_NOTE" ? "supplier_credit_note.created" : "supplier_debit_note.created",
      "SupplierInvoice",
      note.id,
      { projectId: note.projectId, companyId: note.companyId },
      {
        after: {
          documentKind: kind,
          referencedSupplierInvoiceId: parent.id,
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
  inv: SupplierInvoice & {
    lines: Array<{
      id: string;
      invoiceId: string;
      wbsNodeId: string | null;
      purchaseOrderLineId: string | null;
      costAnalysisLineId: string | null;
      costType: CostCategory | null;
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      discountPct: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      lineTax: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      sortOrder: number;
    }>;
    supplierContact: { legalName: string; fantasyName: string | null };
  },
): SupplierInvoiceView {
  const prefix =
    inv.documentKind === "CREDIT_NOTE"
      ? "NC"
      : inv.documentKind === "DEBIT_NOTE"
        ? "ND"
        : "FP";
  const hasPoLineLink = inv.lines.some((l) => l.purchaseOrderLineId);
  return {
    ...inv,
    code: `${prefix}-${String(inv.number).padStart(5, "0")}`,
    supplierName: inv.supplierContact.fantasyName ?? inv.supplierContact.legalName,
    subcontractCertificationCode: null,
    subcontractId: null,
    subtotal: serializeMoneyDecimal(inv.subtotal),
    taxAmount: serializeMoneyDecimal(inv.taxAmount),
    iibbPerceptionRate: serializeRatePctDecimal(inv.iibbPerceptionRate),
    iibbPerceptionAmount: serializeMoneyDecimal(inv.iibbPerceptionAmount),
    totalAmount: serializeMoneyDecimal(inv.totalAmount),
    lines: inv.lines.map((l) => ({
      id: l.id,
      invoiceId: l.invoiceId,
      wbsNodeId: l.wbsNodeId,
      purchaseOrderLineId: l.purchaseOrderLineId,
      costAnalysisLineId: l.costAnalysisLineId ?? null,
      costType: l.costType ?? null,
      description: l.description,
      quantity: serializeQtyDecimal(l.quantity),
      unitPrice: serializeUnitPriceDecimal(l.unitPrice),
      taxRate: serializeRatePctDecimal(l.taxRate),
      discountPct: serializeRatePctDecimal(l.discountPct),
      lineSubtotal: serializeMoneyDecimal(l.lineSubtotal),
      lineTax: serializeMoneyDecimal(l.lineTax),
      lineTotal: serializeMoneyDecimal(l.lineTotal),
      sortOrder: l.sortOrder,
    })),
    ...classFieldsForSupplierInvoice({
      projectId: inv.projectId,
      purchaseOrderId: inv.purchaseOrderId,
      hasPoLineLink,
      subcontractCertificationId: inv.subcontractCertificationId,
    }),
  };
}

export async function createSupplierCreditNoteFromInvoice(
  input: CreateNoteFromInvoiceInput,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView> {
  return createNoteDraft("CREDIT_NOTE", input, ctx);
}

export async function createSupplierDebitNoteFromInvoice(
  input: CreateNoteFromInvoiceInput,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView> {
  return createNoteDraft("DEBIT_NOTE", input, ctx);
}

export async function issueSupplierCreditNote(
  id: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.supplierInvoice.findUnique({
      where: { id },
      include: {
        lines: true,
        supplierContact: { select: { legalName: true, fantasyName: true, country: true } },
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
    if (!canMutateApForScope(ctx.roles, inv.projectId)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para emitir notas de crédito");
    }
    await assertProjectGuardIfPresent(inv.projectId, ctx);
    assertSupplierInvoiceEditable(inv);
    if (inv.documentKind !== "CREDIT_NOTE") {
      throw new ServiceError("VALIDATION", "El comprobante no es una nota de crédito.");
    }
    if (!inv.referencedSupplierInvoiceId) {
      throw new ServiceError("VALIDATION", "La NC requiere factura de referencia.");
    }
    if (inv.lines.length === 0) {
      throw new ServiceError("CONFLICT", "No se puede emitir una NC sin líneas");
    }

    assertInvoiceLetterOnIssue({
      invoiceLetter: inv.invoiceLetter,
      companyCountry: inv.company.country,
      counterpartyCountry: inv.supplierContact.country,
      documentLabel: "nota de crédito",
    });
    await recalcSupplierInvoiceTotals(tx, id);
    const refreshed = await tx.supplierInvoice.findUniqueOrThrow({ where: { id } });
    if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El total de la NC debe ser mayor a 0");
    }
    assertInvoiceLetterTaxConsistencyOnIssue({
      invoiceLetter: inv.invoiceLetter,
      taxAmount: refreshed.taxAmount,
    });

    const parent = await tx.supplierInvoice.findUnique({
      where: { id: inv.referencedSupplierInvoiceId },
      include: { payable: true },
    });
    if (!parent || parent.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Factura de referencia no encontrada");
    }
    if (parent.documentKind !== "INVOICE" || parent.status !== "ISSUED") {
      throw new ServiceError("CONFLICT", "La factura de referencia no está emitida.");
    }
    if (parent.supplierContactId !== inv.supplierContactId || parent.currency !== inv.currency) {
      throw new ServiceError("VALIDATION", "La NC debe coincidir en proveedor y moneda con la factura.");
    }
    if (!sameProjectScope(parent.projectId, inv.projectId) || parent.companyId !== inv.companyId) {
      throw new ServiceError("VALIDATION", "La NC debe coincidir en empresa y obra con la factura.");
    }
    if (!parent.payable || parent.payable.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La factura no tiene cuenta por pagar activa.");
    }

    const balanceDue = normalizeObligationBalanceDue(
      computeObligationBalanceDue(
        parent.payable.originalAmount,
        parent.payable.paidAmount,
        parent.payable.creditedAmount,
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

    const flipped = await tx.supplierInvoice.updateMany({
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
      parent.payable.originalAmount,
      parent.payable.paidAmount,
      parent.payable.creditedAmount.plus(refreshed.totalAmount),
    );
    const newStatus = resolveObligationStoredStatus(
      parent.payable.paidAmount,
      parent.payable.originalAmount,
      newCredited,
    );

    await tx.payableCreditApplication.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: inv.companyId,
        payableId: parent.payable.id,
        creditNoteSupplierInvoiceId: inv.id,
        amount: refreshed.totalAmount,
        status: "CONFIRMED",
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    const creditedUpdate = await tx.payable.updateMany({
      where: {
        id: parent.payable.id,
        tenantId: ctx.tenantId,
        paidAmount: parent.payable.paidAmount,
        creditedAmount: parent.payable.creditedAmount,
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
      "El saldo de la cuenta por pagar cambió. Recargá e intentá de nuevo.",
    );

    const issued = await tx.supplierInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAp(
      ctx,
      "supplier_credit_note.issued",
      "SupplierInvoice",
      id,
      { projectId: issued.projectId, companyId: issued.companyId },
      {
        before: { status: "DRAFT" },
        after: {
          status: "ISSUED",
          creditedAmount: serializeMoneyDecimal(newCredited),
          payableId: parent.payable.id,
        },
        tx,
      },
    );

    return issued;
  });

  await ensureDraftJournalFromSupplierInvoice(result.id, ctx);
  return mapNoteView(result);
}

export async function issueSupplierDebitNote(
  id: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.supplierInvoice.findUnique({
      where: { id },
      include: {
        lines: true,
        supplierContact: { select: { legalName: true, fantasyName: true, country: true } },
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
    if (!canMutateApForScope(ctx.roles, inv.projectId)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para emitir notas de débito");
    }
    await assertProjectGuardIfPresent(inv.projectId, ctx);
    assertSupplierInvoiceEditable(inv);
    if (inv.documentKind !== "DEBIT_NOTE") {
      throw new ServiceError("VALIDATION", "El comprobante no es una nota de débito.");
    }
    if (!inv.referencedSupplierInvoiceId) {
      throw new ServiceError("VALIDATION", "La ND requiere factura de referencia.");
    }
    if (inv.lines.length === 0) {
      throw new ServiceError("CONFLICT", "No se puede emitir una ND sin líneas");
    }

    assertInvoiceLetterOnIssue({
      invoiceLetter: inv.invoiceLetter,
      companyCountry: inv.company.country,
      counterpartyCountry: inv.supplierContact.country,
      documentLabel: "nota de débito",
    });
    await recalcSupplierInvoiceTotals(tx, id);
    const refreshed = await tx.supplierInvoice.findUniqueOrThrow({ where: { id } });
    if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El total de la ND debe ser mayor a 0");
    }
    assertInvoiceLetterTaxConsistencyOnIssue({
      invoiceLetter: inv.invoiceLetter,
      taxAmount: refreshed.taxAmount,
    });

    const parent = await tx.supplierInvoice.findUnique({
      where: { id: inv.referencedSupplierInvoiceId },
    });
    if (!parent || parent.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Factura de referencia no encontrada");
    }
    if (parent.documentKind !== "INVOICE" || parent.status !== "ISSUED") {
      throw new ServiceError("CONFLICT", "La factura de referencia no está emitida.");
    }
    if (parent.supplierContactId !== inv.supplierContactId || parent.currency !== inv.currency) {
      throw new ServiceError("VALIDATION", "La ND debe coincidir en proveedor y moneda con la factura.");
    }
    if (!sameProjectScope(parent.projectId, inv.projectId) || parent.companyId !== inv.companyId) {
      throw new ServiceError("VALIDATION", "La ND debe coincidir en empresa y obra con la factura.");
    }

    const { computeDocumentFxAmounts } = await import("../finance/fx-amount.service");
    const fx = computeDocumentFxAmounts(refreshed.currency, refreshed.totalAmount, refreshed.fxRate);

    const flipped = await tx.supplierInvoice.updateMany({
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

    await tx.payable.create({
      data: {
        tenantId: inv.tenantId,
        companyId: inv.companyId,
        projectId: inv.projectId,
        supplierContactId: inv.supplierContactId,
        supplierInvoiceId: inv.id,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        currency: inv.currency,
        originalAmount: refreshed.totalAmount,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    const issued = await tx.supplierInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAp(
      ctx,
      "supplier_debit_note.issued",
      "SupplierInvoice",
      id,
      { projectId: issued.projectId, companyId: issued.companyId },
      { before: { status: "DRAFT" }, after: { status: "ISSUED", number: issued.number }, tx },
    );

    return issued;
  });

  await ensureDraftJournalFromSupplierInvoice(result.id, ctx);
  return mapNoteView(result);
}

export async function cancelSupplierCreditNote(
  id: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.supplierInvoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
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
    if (!canMutateApForScope(ctx.roles, inv.projectId)) {
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
      const cancelled = await tx.supplierInvoice.update({
        where: { id },
        data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
        include: {
          lines: { orderBy: { sortOrder: "asc" } },
          supplierContact: { select: { legalName: true, fantasyName: true } },
        },
      });
      await auditAp(
        ctx,
        "supplier_credit_note.cancelled",
        "SupplierInvoice",
        id,
        { projectId: cancelled.projectId, companyId: cancelled.companyId },
        { before: { status: "DRAFT" }, after: { status: "CANCELLED" }, tx },
      );
      return cancelled;
    }

    await assertJournalAllowsOperationalCancel(ctx, {
      companyId: inv.companyId,
      sourceType: "SUPPLIER_CREDIT_NOTE",
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

    const payable = await tx.payable.findUnique({ where: { id: app.payableId } });
    if (!payable || payable.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
    }

    const newCredited = payable.creditedAmount.minus(app.amount);
    if (newCredited.lessThan(0)) {
      throw new ServiceError("CONFLICT", "Inconsistencia de creditedAmount al anular NC.");
    }
    const newStatus = resolveObligationStoredStatus(
      payable.paidAmount,
      payable.originalAmount,
      newCredited,
    );

    const appFlip = await tx.payableCreditApplication.updateMany({
      where: { id: app.id, status: "CONFIRMED" },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(appFlip.count, "La aplicación de crédito ya fue anulada.");

    const payFlip = await tx.payable.updateMany({
      where: {
        id: payable.id,
        paidAmount: payable.paidAmount,
        creditedAmount: payable.creditedAmount,
        status: { not: "CANCELLED" },
      },
      data: {
        creditedAmount: newCredited,
        status: newStatus,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(payFlip.count, "El saldo de la CxP cambió. Recargá e intentá de nuevo.");

    const cancelled = await tx.supplierInvoice.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAp(
      ctx,
      "supplier_credit_note.cancelled",
      "SupplierInvoice",
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
    sourceType: "SUPPLIER_CREDIT_NOTE",
    sourceId: id,
    sourceLabel: "la nota de crédito",
  });

  return mapNoteView(result);
}

/** Count ISSUED NC/ND that reference this invoice ([BR-NC-005]). */
export async function countActiveCreditDebitNotesForSupplierInvoice(
  supplierInvoiceId: string,
  tenantId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  return tx.supplierInvoice.count({
    where: {
      tenantId,
      referencedSupplierInvoiceId: supplierInvoiceId,
      documentKind: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] },
      status: "ISSUED",
    },
  });
}
