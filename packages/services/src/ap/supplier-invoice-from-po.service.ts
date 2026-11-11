import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { toIsoDateInTimeZone, addCalendarDays, calendarPartsInTimeZone, formatCalendarDate } from "@bloqer/utils";
import type { CreateSupplierInvoiceFromPurchaseOrderInput } from "@bloqer/validators";
import { ServiceContext, ServiceError } from "../types";
import { isCrossCompany } from "../company-scope";
import { requireProjectAccess, requireProjectAccessIfPresent } from "../security/access";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
  serializeFxRateDecimal,
} from "../finance/money-decimal";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { canViewApProjectArea } from "./ap-access";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { assertProjectAllowsOperationalMutation, lockProjectForOperationalMutation } from "../project/project-operational-guard";
import {
  createSupplierInvoice,
  serializeSupplierInvoice,
  type ProjectSupplierInvoiceListRow,
  type SupplierInvoiceView,
} from "./supplier-invoice.service";
import { recalcSupplierInvoiceTotals } from "./supplier-invoice-calc.service";
import { resolveInvoiceLineMoney, parseDiscountPct } from "../finance/invoice-line-money";
import { classFieldsForSupplierInvoice } from "../finance/document-class.service";
import {
  buildAutoFromPoInternalNotes,
  buildInvoiceDraftLinesFromPo,
  clampReceiptQuantitiesToPendingInvoice,
  computePendingToInvoiceAmount,
  poLinesWithUncoveredInvoiceQuantity,
  sumPoLinesReceivedAmount,
  type CostCategoryCode,
  type InvoiceDraftLineInput,
  type PoLineForInvoiceDraft,
} from "./supplier-invoice-from-po-pure";
import { getCompanyProcurementSettings } from "../procurement/company-procurement-settings.service";
import {
  evaluateThreeWayLineQtyMatch,
  invoiceExceedsReceivedWithTolerance,
} from "../procurement/three-way-match-pure";
import { resolveSuggestedApInvoiceLetter } from "../finance/resolve-suggested-invoice-letter";
import { computeObligationBalanceDue, normalizeObligationBalanceDue } from "../finance/obligation-balance";
import { PO_INVOICE_LINKABLE_STATUSES } from "../procurement/procurement-constants";
import { assertPurchaseOrderRelations, procurementOrderLineScopeInclude, procurementOrderParentScopeInclude } from "../procurement/procurement-wbs";

export {
  buildAutoFromPoInternalNotes,
  looksLikeGeneratedFromPurchaseOrderNotes,
  parseAutoFromPoPurchaseOrderId,
  isSupplierInvoiceLockedFromPurchaseOrder,
} from "./supplier-invoice-from-po-markers";

export type PurchaseOrderBillingSummary = {
  currency: string;
  receivedAmount: string;
  /** Amount on ISSUED invoices only (CxP / job-cost issued). */
  invoicedAmount: string;
  /** Amount reserved by open DRAFT invoices (blocks duplicate auto-drafts). */
  draftReservedAmount: string;
  /** Actual treasury payments on issued invoices and linked debit notes; excludes credits. */
  paidAmount: string;
  /** All ISSUED invoices and their linked debit notes have a valid PAID obligation
   * with zero canonical balance. Includes credits ([D-115]); false without invoices. */
  allIssuedInvoicesSettled: boolean;
  /** Received neto+IVA is covered by ISSUED invoices, excluding DRAFT reservations. */
  allReceivedAmountIssued: boolean;
  /** ISSUED line coverage for the workflow, falling back to monetary coverage for unlinked lines. */
  allReceivedInvoiceLinesIssued: boolean;
  /** Received − (ISSUED + DRAFT reserved). */
  pendingToInvoice: string;
  /** Received billable lines still uncovered by both issued and draft invoices. */
  pendingInvoiceLineIds: string[];
  hasReceivedQuantity: boolean;
  draftInvoiceCount: number;
  /** Header-linked invoices whose quantities cannot be fully matched to PO lines. */
  unlinkedInvoiceCount: number;
  /** Oldest open DRAFT on this OC (for Completar factura CTA). */
  openDraftInvoiceId: string | null;
  /** Per-line 3-way qty status ([D-067]). */
  lineMatches: Array<{
    poLineId: string;
    description: string;
    status: "OK" | "WARN";
    message: string | null;
    orderQty: string;
    receivedQty: string;
    invoicedQty: string;
  }>;
  matchWarningCount: number;
};

function defaultDueDate(): string {
  return formatCalendarDate(addCalendarDays(calendarPartsInTimeZone(), 30));
}

async function loadPoForBilling(purchaseOrderId: string, ctx: ServiceContext, db: Prisma.TransactionClient = prisma) {
  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      ...procurementOrderParentScopeInclude,
      lines: { orderBy: { sortOrder: "asc" }, include: procurementOrderLineScopeInclude },
    },
  });
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(po.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La orden de compra no pertenece a la empresa activa");
  }
  await requireProjectAccess(po.projectId, ctx);
  assertPurchaseOrderRelations(po);
  return po;
}

type BillingOrderScope = Awaited<ReturnType<typeof loadPoForBilling>>;
type BillingInvoiceScope = {
  tenantId: string;
  companyId: string;
  projectId: string | null;
  supplierContactId: string;
  lines: Array<{ purchaseOrderLineId: string | null }>;
};

function assertBillingInvoiceScope(invoice: BillingInvoiceScope, po: BillingOrderScope): void {
  const lineIds = new Set(po.lines.map((line) => line.id));
  if (invoice.tenantId !== po.tenantId || invoice.companyId !== po.companyId ||
      invoice.projectId !== po.projectId || invoice.supplierContactId !== po.supplierContactId ||
      invoice.lines.some((line) => line.purchaseOrderLineId && !lineIds.has(line.purchaseOrderLineId))) {
    throw new ServiceError("CONFLICT", "La factura y la orden de compra tienen relaciones inconsistentes. Revisá sus comprobantes antes de calcular la facturación.");
  }
}

const billingInvoiceScopeSelect = {
  tenantId: true, companyId: true, projectId: true, supplierContactId: true,
} as const;

function assertComparableBillingCurrency(invoiceCurrency: string, orderCurrency: string): void {
  if (invoiceCurrency !== orderCurrency) {
    throw new ServiceError("VALIDATION", "No se puede calcular la facturación: la orden y sus facturas tienen monedas distintas. Los comprobantes conservan su moneda; no se convierten ni se suman importes incompatibles.");
  }
}

function isBillingPayableSettled(payable: {
  status: string;
  originalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  creditedAmount: Prisma.Decimal;
} | null): boolean {
  return payable != null && payable.status === "PAID" && normalizeObligationBalanceDue(
    computeObligationBalanceDue(payable.originalAmount, payable.paidAmount, payable.creditedAmount),
  ).isZero();
}

function toPoLineDraft(
  line: {
    id: string;
    description: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    taxRate: Prisma.Decimal;
    discountPct: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal;
    wbsNodeId: string | null;
    costAnalysisLineId?: string | null;
    costType?: CostCategoryCode | null;
  },
): PoLineForInvoiceDraft {
  return {
    id: line.id,
    description: line.description,
    unitPrice: serializeUnitPriceDecimal(line.unitPrice),
    taxRate: serializeRatePctDecimal(line.taxRate),
    discountPct: serializeRatePctDecimal(line.discountPct),
    orderQuantity: serializeQtyDecimal(line.quantity),
    receivedQuantity: serializeQtyDecimal(line.receivedQuantity),
    lineTotal: serializeMoneyDecimal(line.lineTotal),
    wbsNodeId: line.wbsNodeId,
    costAnalysisLineId: line.costAnalysisLineId ?? null,
    costType: line.costType ?? "MATERIAL",
  };
}

export async function getPurchaseOrderBillingSummary(
  purchaseOrderId: string,
  ctx: ServiceContext,
): Promise<PurchaseOrderBillingSummary> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles) && !canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el estado de facturación de la OC");
  }

  const po = await loadPoForBilling(purchaseOrderId, ctx);
  return summarizePurchaseOrderBilling(po, ctx);
}

async function summarizePurchaseOrderBilling(
  po: BillingOrderScope,
  ctx: ServiceContext,
): Promise<PurchaseOrderBillingSummary> {
  const purchaseOrderId = po.id;
  const poLines = po.lines.map(toPoLineDraft);
  const receivedAmount = sumPoLinesReceivedAmount(poLines);
  const hasReceivedQuantity = po.lines.some((l) => l.receivedQuantity.greaterThan(0));

  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      purchaseOrderId,
      documentKind: "INVOICE",
      status: { in: ["DRAFT", "ISSUED"] },
    },
    select: {
      ...billingInvoiceScopeSelect,
      id: true,
      currency: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      status: true,
      createdAt: true,
      payable: { select: { ...billingInvoiceScopeSelect, supplierInvoiceId: true, currency: true, originalAmount: true, paidAmount: true, creditedAmount: true, status: true } },
      lines: { select: { purchaseOrderLineId: true, quantity: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let invoicedAmount = new Prisma.Decimal(0);
  let draftReservedAmount = new Prisma.Decimal(0);
  let paidAmount = new Prisma.Decimal(0);
  let issuedInvoiceCount = 0;
  let allIssuedInvoicesSettled = true;
  let draftInvoiceCount = 0;
  let unlinkedInvoiceCount = 0;
  let hasUnlinkedIssuedInvoice = false;
  let openDraftInvoiceId: string | null = null;
  const invoicedQtyByPoLine = new Map<string, Prisma.Decimal>();
  const issuedQtyByPoLine = new Map<string, Prisma.Decimal>();

  for (const inv of invoices) {
    assertBillingInvoiceScope(inv, po);
    assertComparableBillingCurrency(inv.currency, po.currency);
    if (inv.payable && (inv.payable.tenantId !== inv.tenantId || inv.payable.companyId !== inv.companyId ||
        inv.payable.projectId !== inv.projectId || inv.payable.supplierContactId !== inv.supplierContactId ||
        inv.payable.supplierInvoiceId !== inv.id || inv.payable.currency !== inv.currency)) {
      throw new ServiceError("CONFLICT", "La factura y su cuenta por pagar tienen relaciones inconsistentes.");
    }
    const hasUnlinkedLines = inv.lines.some((line) => !line.purchaseOrderLineId);
    if (hasUnlinkedLines) unlinkedInvoiceCount += 1;
    // Coverage vs recibido uses neto+IVA only — IIBB is crédito fiscal, not goods coverage ([D-112]).
    const goodsTaxAmount = inv.subtotal.plus(inv.taxAmount);
    if (inv.status === "DRAFT") {
      draftInvoiceCount += 1;
      if (!openDraftInvoiceId) openDraftInvoiceId = inv.id;
      draftReservedAmount = draftReservedAmount.add(goodsTaxAmount);
      // Reserve draft qty so clamp / pending cannot double-create ([D-108] vs panel).
      for (const line of inv.lines) {
        if (!line.purchaseOrderLineId) continue;
        const prev = invoicedQtyByPoLine.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0);
        invoicedQtyByPoLine.set(line.purchaseOrderLineId, prev.add(line.quantity));
      }
      continue;
    }
    invoicedAmount = invoicedAmount.add(goodsTaxAmount);
    issuedInvoiceCount += 1;
    hasUnlinkedIssuedInvoice ||= hasUnlinkedLines;
    if (!isBillingPayableSettled(inv.payable)) allIssuedInvoicesSettled = false;
    if (inv.payable && inv.payable.status !== "CANCELLED") {
      paidAmount = paidAmount.add(inv.payable.paidAmount);
    }
    for (const line of inv.lines) {
      if (!line.purchaseOrderLineId) continue;
      const prev = invoicedQtyByPoLine.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0);
      invoicedQtyByPoLine.set(line.purchaseOrderLineId, prev.add(line.quantity));
      const issued = issuedQtyByPoLine.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0);
      issuedQtyByPoLine.set(line.purchaseOrderLineId, issued.add(line.quantity));
    }
  }

  // D-115: a debit note opens its own obligation, including when it inherits
  // this OC only through its referenced invoice. It never adds physical coverage.
  const validatedInvoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const debitNotes = await prisma.supplierInvoice.findMany({
    where: {
      documentKind: "DEBIT_NOTE", status: "ISSUED",
      OR: [{ purchaseOrderId }, { referencedSupplierInvoiceId: { in: [...validatedInvoiceIds] } }],
    },
    select: {
      ...billingInvoiceScopeSelect,
      id: true, currency: true, purchaseOrderId: true,
      referencedSupplierInvoice: { select: {
        ...billingInvoiceScopeSelect,
        id: true, documentKind: true, status: true, purchaseOrderId: true, currency: true,
      } },
      payable: { select: { ...billingInvoiceScopeSelect, supplierInvoiceId: true, currency: true, originalAmount: true, paidAmount: true, creditedAmount: true, status: true } },
    },
  });
  for (const note of debitNotes) {
    const parent = note.referencedSupplierInvoice;
    if (note.tenantId !== po.tenantId || note.companyId !== po.companyId || note.projectId !== po.projectId ||
        note.supplierContactId !== po.supplierContactId || note.currency !== po.currency ||
        (note.purchaseOrderId != null && note.purchaseOrderId !== purchaseOrderId) ||
        !parent || !validatedInvoiceIds.has(parent.id) || parent.documentKind !== "INVOICE" || parent.status !== "ISSUED" ||
        parent.purchaseOrderId !== purchaseOrderId || parent.tenantId !== po.tenantId || parent.companyId !== po.companyId ||
        parent.projectId !== po.projectId || parent.supplierContactId !== po.supplierContactId || parent.currency !== po.currency) {
      throw new ServiceError("CONFLICT", "La nota de débito y su factura u orden de compra tienen relaciones inconsistentes.");
    }
    if (note.payable && (note.payable.tenantId !== note.tenantId || note.payable.companyId !== note.companyId ||
        note.payable.projectId !== note.projectId || note.payable.supplierContactId !== note.supplierContactId ||
        note.payable.supplierInvoiceId !== note.id || note.payable.currency !== note.currency)) {
      throw new ServiceError("CONFLICT", "La nota de débito y su cuenta por pagar tienen relaciones inconsistentes.");
    }
    if (!isBillingPayableSettled(note.payable)) allIssuedInvoicesSettled = false;
    if (note.payable && note.payable.status !== "CANCELLED") {
      paidAmount = paidAmount.add(note.payable.paidAmount);
    }
  }

  const settings = await getCompanyProcurementSettings(po.companyId, ctx);
  const matchTol = new Prisma.Decimal(settings.invoiceMatchTolerancePct);
  const lineMatches = po.lines.map((line) =>
    evaluateThreeWayLineQtyMatch(
      {
        poLineId: line.id,
        description: line.description,
        orderQty: line.quantity,
        receivedQty: line.receivedQuantity,
        invoicedQty: invoicedQtyByPoLine.get(line.id) ?? new Prisma.Decimal(0),
      },
      matchTol,
    ),
  );
  const matchWarningCount = lineMatches.filter((l) => l.status === "WARN").length;

  const coveredAmount = invoicedAmount.add(draftReservedAmount);
  const pendingToInvoice = computePendingToInvoiceAmount(receivedAmount, coveredAmount);
  const pendingIssuedCoverage = computePendingToInvoiceAmount(receivedAmount, invoicedAmount);
  const allReceivedAmountIssued = issuedInvoiceCount > 0 && hasReceivedQuantity &&
    serializeMoneyDecimal(pendingIssuedCoverage) === "0.00";
  // Header-only invoices cannot prove coverage by item. Preserve the monetary guard for them.
  const pendingInvoiceLineIds = unlinkedInvoiceCount > 0 && serializeMoneyDecimal(pendingToInvoice) === "0.00"
    ? []
    : poLinesWithUncoveredInvoiceQuantity(po.lines, invoicedQtyByPoLine);
  const allReceivedInvoiceLinesIssued = issuedInvoiceCount > 0 && hasReceivedQuantity && (
    poLinesWithUncoveredInvoiceQuantity(po.lines, issuedQtyByPoLine).length === 0 ||
    (hasUnlinkedIssuedInvoice && allReceivedAmountIssued)
  );

  return {
    receivedAmount: serializeMoneyDecimal(receivedAmount),
    currency: po.currency,
    invoicedAmount: serializeMoneyDecimal(invoicedAmount),
    draftReservedAmount: serializeMoneyDecimal(draftReservedAmount),
    paidAmount: serializeMoneyDecimal(paidAmount),
    allIssuedInvoicesSettled: issuedInvoiceCount > 0 && allIssuedInvoicesSettled,
    allReceivedAmountIssued,
    allReceivedInvoiceLinesIssued,
    pendingToInvoice: serializeMoneyDecimal(pendingToInvoice),
    pendingInvoiceLineIds,
    hasReceivedQuantity,
    draftInvoiceCount,
    unlinkedInvoiceCount,
    openDraftInvoiceId,
    lineMatches,
    matchWarningCount,
  };
}

export type PurchaseOrderInvoiceDraftPreview = {
  summary: PurchaseOrderBillingSummary;
  supplierContactId: string;
  currency: string;
  /** PO header percepción rate to copy onto the invoice form ([D-112]). */
  iibbPerceptionRate: string;
  /** Líneas sugeridas (pendiente de facturar) — editables en el form, sin persistir. */
  lines: InvoiceDraftLineInput[];
};

/**
 * Previsualiza las líneas a facturar de una OC (matching a 3 vías: recibido − facturado),
 * sin crear la factura. Alimenta el botón "Traer líneas de la OC" del alta manual.
 */
export async function getPurchaseOrderInvoiceDraftPreview(
  purchaseOrderId: string,
  projectId: string,
  ctx: ServiceContext,
): Promise<PurchaseOrderInvoiceDraftPreview> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles) && !canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el estado de facturación de la OC");
  }

  const po = await loadPoForBilling(purchaseOrderId, ctx);
  if (po.projectId !== projectId) {
    throw new ServiceError("CONFLICT", "La orden de compra no pertenece a este proyecto");
  }

  const summary = await summarizePurchaseOrderBilling(po, ctx);
  const poLines = po.lines.map(toPoLineDraft);
  const receivedAmount = sumPoLinesReceivedAmount(poLines);
  const coveredQtyByPoLine = new Map(
    summary.lineMatches.map((l) => {
      // lineMatches.include draft+issued; for Traer líneas we want pending vs all reserved.
      return [l.poLineId, new Prisma.Decimal(l.invoicedQty)] as const;
    }),
  );
  const coveredAmount = new Prisma.Decimal(summary.invoicedAmount).add(
    new Prisma.Decimal(summary.draftReservedAmount),
  );
  const lines = summary.pendingInvoiceLineIds.length === 0 ? [] : buildInvoiceDraftLinesFromPo(poLines, {
    basis: "remaining",
    receivedAmount,
    invoicedAmount: coveredAmount,
    invoicedQtyByPoLine: coveredQtyByPoLine,
  });

  return {
    summary,
    supplierContactId: po.supplierContactId,
    currency: po.currency,
    iibbPerceptionRate: serializeRatePctDecimal(po.iibbPerceptionRate),
    lines,
  };
}

export async function listSupplierInvoicesByPurchaseOrder(
  purchaseOrderId: string,
  ctx: ServiceContext,
): Promise<Array<Omit<ProjectSupplierInvoiceListRow, "fxRate" | "amountArs"> & { fxRate: string; amountArs: string }>> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles) && !canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de la OC");
  }

  const po = await loadPoForBilling(purchaseOrderId, ctx);

  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      purchaseOrderId,
      status: { not: "CANCELLED" },
    },
    include: {
      supplierContact: { select: { legalName: true, fantasyName: true } },
      payable: { select: { id: true, status: true, originalAmount: true, paidAmount: true, creditedAmount: true } },
      lines: { select: { purchaseOrderLineId: true } },
    },
    orderBy: [{ number: "asc" }, { id: "asc" }],
  });

  for (const invoice of invoices) assertBillingInvoiceScope(invoice, po);
  return invoices.map((inv) => ({
    ...inv,
    fxRate: serializeFxRateDecimal(inv.fxRate),
    amountArs: serializeMoneyDecimal(inv.amountArs),
    subtotal: serializeMoneyDecimal(inv.subtotal),
    taxAmount: serializeMoneyDecimal(inv.taxAmount),
    iibbPerceptionRate: serializeRatePctDecimal(inv.iibbPerceptionRate),
    iibbPerceptionAmount: serializeMoneyDecimal(inv.iibbPerceptionAmount),
    totalAmount: serializeMoneyDecimal(inv.totalAmount),
    code: `${inv.documentKind === "CREDIT_NOTE" ? "NC" : inv.documentKind === "DEBIT_NOTE" ? "ND" : "FP"}-${String(inv.number).padStart(5, "0")}`,
    supplierName: inv.supplierContact.fantasyName ?? inv.supplierContact.legalName,
    subcontractCertificationCode: null,
    subcontractId: null,
    payable: inv.payable ? {
      id: inv.payable.id,
      status: inv.payable.status,
      balanceDue: serializeMoneyDecimal(normalizeObligationBalanceDue(computeObligationBalanceDue(
        inv.payable.originalAmount, inv.payable.paidAmount, inv.payable.creditedAmount,
      ))),
    } : null,
    ...classFieldsForSupplierInvoice({
      projectId: inv.projectId,
      purchaseOrderId: inv.purchaseOrderId,
      hasPoLineLink: inv.lines.some((l) => Boolean(l.purchaseOrderLineId)),
      subcontractCertificationId: inv.subcontractCertificationId,
    }),
  }));
}

export async function getSupplierInvoicePurchaseOrderWarnings(
  supplierInvoiceId: string,
  ctx: ServiceContext,
): Promise<string[]> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la factura");
  }

  const inv = await prisma.supplierInvoice.findUnique({
    where: { id: supplierInvoiceId },
    select: {
      tenantId: true,
      companyId: true,
      projectId: true,
      purchaseOrderId: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      currency: true,
      supplierContactId: true,
      status: true,
      documentKind: true,
      lines: { select: { purchaseOrderLineId: true, quantity: true, description: true } },
    },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(inv.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  await requireProjectAccessIfPresent(inv.projectId, ctx);
  if (!inv.purchaseOrderId || inv.status === "CANCELLED") return [];

  const po = await loadPoForBilling(inv.purchaseOrderId, ctx);
  assertBillingInvoiceScope(inv, po);
  if (inv.documentKind !== "INVOICE") return [];

  const warnings: string[] = [];
  if (inv.lines.some((line) => !line.purchaseOrderLineId)) {
    warnings.push("Hay líneas sin vínculo con un ítem de la OC. El importe figura en la facturación, pero esas cantidades no se concilian por línea. Revisá los comprobantes antes de generar otra factura.");
  }
  const receivedAmount = sumPoLinesReceivedAmount(po.lines.map(toPoLineDraft));

  const settings = await getCompanyProcurementSettings(po.companyId, ctx);
  const matchTol = new Prisma.Decimal(settings.invoiceMatchTolerancePct);

  // Compare neto+IVA to received (lineTotal sum); exclude IIBB percepción ([D-112]).
  const invoiceGoodsTax = inv.subtotal.plus(inv.taxAmount);
  if (
    inv.currency === po.currency &&
    invoiceExceedsReceivedWithTolerance(invoiceGoodsTax, receivedAmount, matchTol) &&
    (receivedAmount.greaterThan(0) || invoiceGoodsTax.greaterThan(0))
  ) {
    warnings.push(
      `El neto+IVA de la factura (${invoiceGoodsTax.toFixed(2)}) supera el valor recibido acumulado de la OC (${receivedAmount.toFixed(2)})` +
        (matchTol.greaterThan(0) ? ` más tolerancia ${matchTol.toFixed(2)}%.` : "."),
    );
  }

  // Per-line qty using this invoice's lines + other ISSUED invoices on same PO
  const otherIssued = await prisma.supplierInvoice.findMany({
    where: {
      purchaseOrderId: inv.purchaseOrderId,
      status: "ISSUED",
      documentKind: "INVOICE",
      id: { not: supplierInvoiceId },
    },
    select: { ...billingInvoiceScopeSelect, lines: { select: { purchaseOrderLineId: true, quantity: true } } },
  });
  const invoicedQtyByPoLine = new Map<string, Prisma.Decimal>();
  for (const other of otherIssued) {
    assertBillingInvoiceScope(other, po);
    for (const line of other.lines) {
      if (!line.purchaseOrderLineId) continue;
      const prev = invoicedQtyByPoLine.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0);
      invoicedQtyByPoLine.set(line.purchaseOrderLineId, prev.add(line.quantity));
    }
  }
  for (const line of inv.lines) {
    if (!line.purchaseOrderLineId) continue;
    const prev = invoicedQtyByPoLine.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0);
    invoicedQtyByPoLine.set(line.purchaseOrderLineId, prev.add(line.quantity));
  }

  for (const poLine of po.lines) {
    const match = evaluateThreeWayLineQtyMatch(
      {
        poLineId: poLine.id,
        description: poLine.description,
        orderQty: poLine.quantity,
        receivedQty: poLine.receivedQuantity,
        invoicedQty: invoicedQtyByPoLine.get(poLine.id) ?? new Prisma.Decimal(0),
      },
      matchTol,
    );
    if (match.message) warnings.push(match.message);
  }

  if (po.supplierContactId !== inv.supplierContactId) {
    warnings.push("El proveedor de la factura no coincide con el de la orden de compra.");
  }

  if (po.currency !== inv.currency) {
    warnings.push("La moneda de la factura no coincide con la de la orden de compra.");
  }

  return warnings;
}

/** Minimal PO code lookup for AP screens (no PROCUREMENT view required). */
export async function getPurchaseOrderCodeForApLink(
  purchaseOrderId: string,
  ctx: ServiceContext,
): Promise<string | null> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles) && !canViewProcurementProjectArea(ctx.roles)) {
    return null;
  }
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { tenantId: true, companyId: true, projectId: true, number: true },
  });
  if (!po || po.tenantId !== ctx.tenantId || isCrossCompany(po.companyId, ctx)) return null;
  await requireProjectAccess(po.projectId, ctx);
  return `OC-${String(po.number).padStart(3, "0")}`;
}

export async function createSupplierInvoiceDraftFromPurchaseOrder(
  input: CreateSupplierInvoiceFromPurchaseOrderInput,
  ctx: ServiceContext,
  options?: {
    /**
     * [D-108] Trusted path after receipt confirm under company policy.
     * Skips EDIT AP gate so warehouse can confirm while Finance emits later.
     */
    asSystemFromReceiptPolicy?: boolean;
  },
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!options?.asSystemFromReceiptPolicy && !can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear facturas de proveedor");
  }

  await assertProjectAllowsOperationalMutation(input.projectId, ctx);

  return prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, input.projectId, ctx);
    // Panel and receipt triggers serialize before reading coverage, then write in the same TX.
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${input.purchaseOrderId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const po = await loadPoForBilling(input.purchaseOrderId, ctx, tx);
    if (po.projectId !== input.projectId) {
      throw new ServiceError("CONFLICT", "La orden de compra no pertenece a este proyecto");
    }
    if (!PO_INVOICE_LINKABLE_STATUSES.includes(po.status as (typeof PO_INVOICE_LINKABLE_STATUSES)[number])) {
      throw new ServiceError(
        "CONFLICT",
        "Solo se puede facturar desde órdenes de compra emitidas o con recepción",
      );
    }

    const internalNotes = buildAutoFromPoInternalNotes(input.purchaseOrderId, input.purchaseReceiptId);
    const autoFromPoPrefix = `bloqer:auto-from-po:${input.purchaseOrderId}`;
    // Idempotent across PO-panel key vs receipt-scoped key ([D-108] duplicate draft).
    const existingDraft = await tx.supplierInvoice.findFirst({
      where: {
        tenantId: ctx.tenantId,
        purchaseOrderId: input.purchaseOrderId,
        status: "DRAFT",
        documentKind: "INVOICE",
        OR: [
          { internalNotes },
          { internalNotes: { startsWith: autoFromPoPrefix } },
        ],
      },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    if (existingDraft) {
      assertBillingInvoiceScope(existingDraft, po);
      if (existingDraft.currency !== po.currency) {
        throw new ServiceError("CONFLICT", "El borrador cambió de moneda y no se puede actualizar automáticamente con precios de la OC. Completá sus líneas manualmente.");
      }
    }

    let receiptQuantities: Map<string, string> | undefined;
    if (input.purchaseReceiptId) {
      const receipt = await tx.purchaseReceipt.findUnique({
        where: { id: input.purchaseReceiptId },
        include: { lines: true },
      });
      if (!receipt) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
      if (receipt.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
      if (receipt.purchaseOrderId !== input.purchaseOrderId) {
        throw new ServiceError("CONFLICT", "La recepción no pertenece a esta orden de compra");
      }
      if (receipt.companyId !== po.companyId || receipt.projectId !== po.projectId ||
          receipt.lines.some((line) => !po.lines.some((poLine) => poLine.id === line.purchaseOrderLineId))) {
        throw new ServiceError("CONFLICT", "La recepción y la orden de compra tienen relaciones inconsistentes.");
      }
      if (receipt.status !== "CONFIRMED") {
        throw new ServiceError("CONFLICT", "Solo se puede facturar desde recepciones confirmadas");
      }
      receiptQuantities = new Map();
      for (const line of receipt.lines) {
        const previous = new Prisma.Decimal(receiptQuantities.get(line.purchaseOrderLineId) ?? "0");
        receiptQuantities.set(line.purchaseOrderLineId, serializeQtyDecimal(previous.add(line.quantityReceived)));
      }
    }

    const poLines = po.lines.map(toPoLineDraft);
    const orderReceivedAmount = sumPoLinesReceivedAmount(poLines);
    // Exclude the open auto-draft from reservations so a later receipt can refresh its lines.
    const { coveredQtyByPoLine, amount, hasUnlinkedInvoice } = await loadInvoiceDraftCoverage(
      po, existingDraft?.id ?? null, tx,
    );
    if (hasUnlinkedInvoice && serializeMoneyDecimal(computePendingToInvoiceAmount(orderReceivedAmount, amount)) === "0.00") {
      throw new ServiceError(
        "CONFLICT",
        "Las facturas sin vínculo a un renglón ya cubren el importe recibido. Revisá sus comprobantes antes de preparar otro borrador.",
      );
    }

    if (receiptQuantities) {
      receiptQuantities = clampReceiptQuantitiesToPendingInvoice(
        receiptQuantities,
        poLines,
        coveredQtyByPoLine,
      );
    }

    const receivedAmount = receiptQuantities
      ? poLines.reduce((acc, line) => {
          const qty = receiptQuantities!.get(line.id);
          if (!qty) return acc;
          const orderQty = new Prisma.Decimal(line.orderQuantity);
          const lineTotal = new Prisma.Decimal(line.lineTotal);
          if (orderQty.lessThanOrEqualTo(0)) return acc;
          return acc.add(lineTotal.mul(new Prisma.Decimal(qty)).div(orderQty));
        }, new Prisma.Decimal(0))
      : orderReceivedAmount;

    if (receivedAmount.lessThanOrEqualTo(0)) {
      if (existingDraft) {
        return serializeSupplierInvoice({ ...existingDraft, subcontractCertification: null });
      }
      throw new ServiceError(
        "CONFLICT",
        input.purchaseReceiptId
          ? "La recepción no tiene cantidades pendientes de facturar (ya facturadas o sin recibir)"
          : "La orden de compra no tiene cantidades recibidas para facturar",
      );
    }

    const coveredMoney = poLines.reduce((acc, line) => {
      const coveredQty = coveredQtyByPoLine.get(line.id);
      if (!coveredQty || coveredQty.lessThanOrEqualTo(0)) return acc;
      const orderQty = new Prisma.Decimal(line.orderQuantity);
      const lineTotal = new Prisma.Decimal(line.lineTotal);
      if (orderQty.lessThanOrEqualTo(0)) return acc;
      return acc.add(lineTotal.mul(coveredQty).div(orderQty));
    }, new Prisma.Decimal(0));

    // Receipt path (new draft): quantities already clamped to pending.
    // Refresh of an open auto-draft: rebuild full per-line remaining vs other docs.
    const draftLines = existingDraft
      ? buildInvoiceDraftLinesFromPo(poLines, {
          basis: "remaining",
          receivedAmount: orderReceivedAmount,
          invoicedAmount: coveredMoney,
          invoicedQtyByPoLine: coveredQtyByPoLine,
        })
      : buildInvoiceDraftLinesFromPo(poLines, {
          basis: input.purchaseReceiptId
            ? "received"
            : coveredMoney.greaterThan(0)
              ? "remaining"
              : (input.basis ?? "received"),
          receiptQuantities,
          receivedAmount: orderReceivedAmount,
          invoicedAmount: coveredMoney,
          invoicedQtyByPoLine: coveredQtyByPoLine,
        });

    if (draftLines.length === 0) {
      if (existingDraft) {
        return serializeSupplierInvoice({ ...existingDraft, subcontractCertification: null });
      }
      throw new ServiceError("CONFLICT", "No hay líneas pendientes de facturación para esta OC");
    }

    if (existingDraft) {
      await syncAutoFromPoDraftLines(tx, {
        draftId: existingDraft.id,
        tenantId: existingDraft.tenantId,
        existingLines: existingDraft.lines,
        draftLines,
        invoiceLetter: existingDraft.invoiceLetter,
        actorUserId: ctx.actorUserId,
        internalNotes,
      });
      const refreshed = await tx.supplierInvoice.findUniqueOrThrow({
        where: { id: existingDraft.id },
        include: {
          lines: { orderBy: { sortOrder: "asc" } },
          supplierContact: { select: { legalName: true, fantasyName: true } },
        },
      });
      return serializeSupplierInvoice({
        ...refreshed,
        subcontractCertification: null,
      });
    }

    const suggestedLetter = await resolveSuggestedApInvoiceLetter({
      companyId: po.companyId,
      supplierContactId: po.supplierContactId,
      tenantId: ctx.tenantId,
    });
    const zeroTax = suggestedLetter === "C" || suggestedLetter === "E";

    return createSupplierInvoice(
      {
        projectId: input.projectId,
        supplierContactId: po.supplierContactId,
        issueDate: toIsoDateInTimeZone(),
        dueDate: defaultDueDate(),
        currency: po.currency,
        fxRate: po.fxRate != null ? serializeFxRateDecimal(po.fxRate) : undefined,
        invoiceLetter: suggestedLetter,
        iibbPerceptionRate: serializeRatePctDecimal(po.iibbPerceptionRate),
        purchaseOrderId: input.purchaseOrderId,
        internalNotes,
        notes: input.purchaseReceiptId
          ? `Generada desde recepción vinculada a ${po.number}`
          : `Generada desde OC-${String(po.number).padStart(3, "0")}`,
        lines: draftLines.map((l, i) => ({
          ...l,
          discountPct: l.discountPct,
          // Monotributo/Exento → Factura C: OC often has 21%; force 0 so DRAFT/issue stay consistent ([D-084]).
          taxRate: zeroTax ? "0" : l.taxRate,
          sortOrder: i,
        })),
      },
      ctx,
      options?.asSystemFromReceiptPolicy
        ? { tx, bypassApMutateGate: true, trustedSystemPath: "receipt-auto-draft" }
        : { tx },
    );
  }, { maxWait: 10_000, timeout: 30_000 });
}

/** ISSUED and DRAFT coverage, excluding the auto-draft being refreshed. */
async function loadInvoiceDraftCoverage(
  po: BillingOrderScope,
  excludeDraftId: string | null,
  db: Prisma.TransactionClient = prisma,
) {
  const invoices = await db.supplierInvoice.findMany({
    where: {
      purchaseOrderId: po.id,
      documentKind: "INVOICE",
      status: { in: ["DRAFT", "ISSUED"] },
      ...(excludeDraftId ? { id: { not: excludeDraftId } } : {}),
    },
    select: {
      ...billingInvoiceScopeSelect,
      currency: true, subtotal: true, taxAmount: true,
      lines: { select: { purchaseOrderLineId: true, quantity: true } },
    },
  });
  const coveredQtyByPoLine = new Map<string, Prisma.Decimal>();
  let amount = new Prisma.Decimal(0);
  let hasUnlinkedInvoice = false;
  for (const inv of invoices) {
    assertBillingInvoiceScope(inv, po);
    assertComparableBillingCurrency(inv.currency, po.currency);
    amount = amount.add(inv.subtotal).add(inv.taxAmount);
    for (const line of inv.lines) {
      if (!line.purchaseOrderLineId) {
        hasUnlinkedInvoice = true;
        continue;
      }
      const prev = coveredQtyByPoLine.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0);
      coveredQtyByPoLine.set(line.purchaseOrderLineId, prev.add(line.quantity));
    }
  }
  return { coveredQtyByPoLine, amount, hasUnlinkedInvoice };
}

function autoDraftLinesAlreadyCover(
  existingLines: Array<{ purchaseOrderLineId: string | null; quantity: Prisma.Decimal }>,
  targets: InvoiceDraftLineInput[],
): boolean {
  const byPo = new Map<string, Prisma.Decimal>();
  for (const l of existingLines) {
    if (!l.purchaseOrderLineId || byPo.has(l.purchaseOrderLineId)) return false;
    byPo.set(l.purchaseOrderLineId, l.quantity);
  }
  if (byPo.size !== targets.length) return false;
  for (const t of targets) {
    if (!t.purchaseOrderLineId) return false;
    if (!byPo.get(t.purchaseOrderLineId)?.equals(t.quantity)) return false;
  }
  return true;
}

/**
 * Refresh an open auto-from-PO DRAFT so later receipts / Registrar factura do not
 * leave under-covered lines ([D-108] idempotent hit).
 */
async function syncAutoFromPoDraftLines(tx: Prisma.TransactionClient, params: {
  draftId: string;
  tenantId: string;
  existingLines: Array<{ purchaseOrderLineId: string | null; quantity: Prisma.Decimal }>;
  draftLines: InvoiceDraftLineInput[];
  invoiceLetter: string | null;
  actorUserId: string;
  internalNotes: string;
}): Promise<void> {
  if (autoDraftLinesAlreadyCover(params.existingLines, params.draftLines)) {
    return;
  }

  // D-145: a saved edit is provenance to protect, not a basis for recalculating fiscal lines.
  const savedEdit = await tx.auditLog.findFirst({
    where: {
      tenantId: params.tenantId,
      entityType: "SupplierInvoice",
      entityId: params.draftId,
      action: "supplier_invoice.updated",
    },
    select: { id: true },
  });
  if (savedEdit) {
    throw new ServiceError(
      "CONFLICT",
      "El borrador ya tiene ediciones guardadas. Abrí Completar factura y agregá las cantidades nuevas manualmente.",
    );
  }

  const forceZeroTax = params.invoiceLetter === "C" || params.invoiceLetter === "E";

  const claim = await tx.supplierInvoice.updateMany({
    where: { id: params.draftId, status: "DRAFT" },
    data: {
      internalNotes: params.internalNotes,
      updatedBy: params.actorUserId,
    },
  });
  if (claim.count !== 1) {
    throw new ServiceError("CONFLICT", "La factura ya no está en borrador");
  }

  await tx.supplierInvoiceLine.deleteMany({ where: { invoiceId: params.draftId } });
  for (let i = 0; i < params.draftLines.length; i++) {
    const line = params.draftLines[i]!;
    const qty = new Prisma.Decimal(line.quantity);
    const price = new Prisma.Decimal(line.unitPrice);
    const rate = new Prisma.Decimal(forceZeroTax ? "0" : line.taxRate);
    const money = resolveInvoiceLineMoney({
      quantity: qty,
      unitPrice: price,
      taxRate: rate,
      discountPct: parseDiscountPct(line.discountPct),
      pricesIncludeTax: false,
    });
    await tx.supplierInvoiceLine.create({
      data: {
        invoiceId: params.draftId,
        description: line.description,
        quantity: qty,
        unitPrice: money.unitPriceNet,
        taxRate: rate,
        discountPct: parseDiscountPct(line.discountPct),
        lineSubtotal: money.lineSubtotal,
        lineTax: money.lineTax,
        lineTotal: money.lineTotal,
        wbsNodeId: line.wbsNodeId ?? null,
        purchaseOrderLineId: line.purchaseOrderLineId ?? null,
        costAnalysisLineId: line.costAnalysisLineId ?? null,
        costType: (line.costType as "MATERIAL" | "LABOR" | "EQUIPMENT" | "SUBCONTRACT" | "OTHER") ?? "MATERIAL",
        sortOrder: i,
      },
    });
  }
  await recalcSupplierInvoiceTotals(tx, params.draftId);

}
