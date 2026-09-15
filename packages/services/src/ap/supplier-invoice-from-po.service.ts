import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { toIsoDateInTimeZone, addCalendarDays, calendarPartsInTimeZone, formatCalendarDate } from "@bloqer/utils";
import type { CreateSupplierInvoiceFromPurchaseOrderInput } from "@bloqer/validators";
import { ServiceContext, ServiceError } from "../types";
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
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import {
  createSupplierInvoice,
  getSupplierInvoiceById,
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
  sumPoLinesReceivedAmount,
  type CostCategoryCode,
  type InvoiceDraftLineInput,
  type PoLineForInvoiceDraft,
} from "./supplier-invoice-from-po-pure";
import { getCompanyProcurementSettingsForProject } from "../procurement/company-procurement-settings.service";
import {
  evaluateThreeWayLineQtyMatch,
  invoiceExceedsReceivedWithTolerance,
} from "../procurement/three-way-match-pure";
import { resolveSuggestedApInvoiceLetter } from "../finance/resolve-suggested-invoice-letter";
import { PO_INVOICE_LINKABLE_STATUSES } from "../procurement/procurement-constants";

export {
  buildAutoFromPoInternalNotes,
  looksLikeGeneratedFromPurchaseOrderNotes,
  parseAutoFromPoPurchaseOrderId,
  isSupplierInvoiceLockedFromPurchaseOrder,
} from "./supplier-invoice-from-po-markers";

export type PurchaseOrderBillingSummary = {
  receivedAmount: string;
  /** Amount on ISSUED invoices only (CxP / job-cost issued). */
  invoicedAmount: string;
  /** Amount reserved by open DRAFT invoices (blocks duplicate auto-drafts). */
  draftReservedAmount: string;
  paidAmount: string;
  /** Received − (ISSUED + DRAFT reserved). */
  pendingToInvoice: string;
  hasReceivedQuantity: boolean;
  draftInvoiceCount: number;
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

async function loadPoForBilling(purchaseOrderId: string, ctx: ServiceContext) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return po;
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
  const poLines = po.lines.map(toPoLineDraft);
  const receivedAmount = sumPoLinesReceivedAmount(poLines);
  const hasReceivedQuantity = po.lines.some((l) => l.receivedQuantity.greaterThan(0));

  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      purchaseOrderId,
      status: { in: ["DRAFT", "ISSUED"] },
    },
    select: {
      id: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      status: true,
      createdAt: true,
      payable: { select: { paidAmount: true, status: true } },
      lines: { select: { purchaseOrderLineId: true, quantity: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let invoicedAmount = new Prisma.Decimal(0);
  let draftReservedAmount = new Prisma.Decimal(0);
  let paidAmount = new Prisma.Decimal(0);
  let draftInvoiceCount = 0;
  let openDraftInvoiceId: string | null = null;
  const invoicedQtyByPoLine = new Map<string, Prisma.Decimal>();

  for (const inv of invoices) {
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
    if (inv.payable && inv.payable.status !== "CANCELLED") {
      paidAmount = paidAmount.add(inv.payable.paidAmount);
    }
    for (const line of inv.lines) {
      if (!line.purchaseOrderLineId) continue;
      const prev = invoicedQtyByPoLine.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0);
      invoicedQtyByPoLine.set(line.purchaseOrderLineId, prev.add(line.quantity));
    }
  }

  const settings = await getCompanyProcurementSettingsForProject(po.projectId, ctx);
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

  return {
    receivedAmount: serializeMoneyDecimal(receivedAmount),
    invoicedAmount: serializeMoneyDecimal(invoicedAmount),
    draftReservedAmount: serializeMoneyDecimal(draftReservedAmount),
    paidAmount: serializeMoneyDecimal(paidAmount),
    pendingToInvoice: serializeMoneyDecimal(pendingToInvoice),
    hasReceivedQuantity,
    draftInvoiceCount,
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

  const summary = await getPurchaseOrderBillingSummary(purchaseOrderId, ctx);
  const poLines = po.lines.map(toPoLineDraft);
  const receivedAmount = sumPoLinesReceivedAmount(poLines);
  const issuedQtyByPoLine = new Map(
    summary.lineMatches.map((l) => {
      // lineMatches.include draft+issued; for Traer líneas we want pending vs all reserved.
      return [l.poLineId, new Prisma.Decimal(l.invoicedQty)] as const;
    }),
  );
  const coveredAmount = new Prisma.Decimal(summary.invoicedAmount).add(
    new Prisma.Decimal(summary.draftReservedAmount),
  );
  const basis = coveredAmount.greaterThan(0) ? "remaining" : "received";
  const lines = buildInvoiceDraftLinesFromPo(poLines, {
    basis,
    receivedAmount,
    invoicedAmount: coveredAmount,
    invoicedQtyByPoLine: issuedQtyByPoLine,
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
): Promise<ProjectSupplierInvoiceListRow[]> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles) && !canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de la OC");
  }

  await loadPoForBilling(purchaseOrderId, ctx);

  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      purchaseOrderId,
      status: { not: "CANCELLED" },
    },
    include: {
      supplierContact: { select: { legalName: true, fantasyName: true } },
      payable: { select: { id: true, status: true } },
      lines: { select: { purchaseOrderLineId: true } },
    },
    orderBy: [{ number: "asc" }, { id: "asc" }],
  });

  return invoices.map((inv) => ({
    ...inv,
    subtotal: serializeMoneyDecimal(inv.subtotal),
    taxAmount: serializeMoneyDecimal(inv.taxAmount),
    iibbPerceptionRate: serializeRatePctDecimal(inv.iibbPerceptionRate),
    iibbPerceptionAmount: serializeMoneyDecimal(inv.iibbPerceptionAmount),
    totalAmount: serializeMoneyDecimal(inv.totalAmount),
    code: `FP-${String(inv.number).padStart(5, "0")}`,
    supplierName: inv.supplierContact.fantasyName ?? inv.supplierContact.legalName,
    subcontractCertificationCode: null,
    subcontractId: null,
    payable: inv.payable ? { id: inv.payable.id, status: inv.payable.status } : null,
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
      projectId: true,
      purchaseOrderId: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      currency: true,
      supplierContactId: true,
      status: true,
      lines: { select: { purchaseOrderLineId: true, quantity: true, description: true } },
    },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (!inv.purchaseOrderId || inv.status === "CANCELLED") return [];

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: inv.purchaseOrderId },
    include: { lines: true },
  });
  if (!po) return [];

  const warnings: string[] = [];
  const receivedAmount = sumPoLinesReceivedAmount(po.lines.map(toPoLineDraft));

  const settings = inv.projectId
    ? await getCompanyProcurementSettingsForProject(inv.projectId, ctx)
    : await getCompanyProcurementSettingsForProject(po.projectId, ctx);
  const matchTol = new Prisma.Decimal(settings.invoiceMatchTolerancePct);

  // Compare neto+IVA to received (lineTotal sum); exclude IIBB percepción ([D-112]).
  const invoiceGoodsTax = inv.subtotal.plus(inv.taxAmount);
  if (
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
      tenantId: ctx.tenantId,
      purchaseOrderId: inv.purchaseOrderId,
      status: "ISSUED",
      id: { not: supplierInvoiceId },
    },
    select: { lines: { select: { purchaseOrderLineId: true, quantity: true } } },
  });
  const invoicedQtyByPoLine = new Map<string, Prisma.Decimal>();
  for (const other of otherIssued) {
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
    select: { tenantId: true, number: true },
  });
  if (!po || po.tenantId !== ctx.tenantId) return null;
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

  const po = await loadPoForBilling(input.purchaseOrderId, ctx);
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
  const existingDraft = await prisma.supplierInvoice.findFirst({
    where: {
      tenantId: ctx.tenantId,
      purchaseOrderId: input.purchaseOrderId,
      status: "DRAFT",
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

  let receiptQuantities: Map<string, string> | undefined;
  if (input.purchaseReceiptId) {
    const receipt = await prisma.purchaseReceipt.findUnique({
      where: { id: input.purchaseReceiptId },
      include: { lines: true },
    });
    if (!receipt) throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
    if (receipt.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (receipt.purchaseOrderId !== input.purchaseOrderId) {
      throw new ServiceError("CONFLICT", "La recepción no pertenece a esta orden de compra");
    }
    if (receipt.status !== "CONFIRMED") {
      throw new ServiceError("CONFLICT", "Solo se puede facturar desde recepciones confirmadas");
    }
    receiptQuantities = new Map(
      receipt.lines.map((l) => [l.purchaseOrderLineId, serializeQtyDecimal(l.quantityReceived)]),
    );
  }

  const poLines = po.lines.map(toPoLineDraft);
  // Exclude the open auto-draft so a later receipt can refresh its lines ([D-108]).
  const coveredQtyByPoLine = await loadCoveredQtyByPoLine(
    input.purchaseOrderId,
    ctx.tenantId,
    existingDraft?.id ?? null,
  );

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
    : sumPoLinesReceivedAmount(poLines);

  if (receivedAmount.lessThanOrEqualTo(0)) {
    if (existingDraft) {
      return options?.asSystemFromReceiptPolicy
        ? serializeSupplierInvoice({ ...existingDraft, subcontractCertification: null })
        : getSupplierInvoiceById(existingDraft.id, ctx, input.projectId);
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
        receivedAmount: sumPoLinesReceivedAmount(poLines),
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
        receivedAmount: sumPoLinesReceivedAmount(poLines),
        invoicedAmount: coveredMoney,
        invoicedQtyByPoLine: coveredQtyByPoLine,
      });

  if (draftLines.length === 0) {
    if (existingDraft) {
      return options?.asSystemFromReceiptPolicy
        ? serializeSupplierInvoice({ ...existingDraft, subcontractCertification: null })
        : getSupplierInvoiceById(existingDraft.id, ctx, input.projectId);
    }
    throw new ServiceError("CONFLICT", "No hay líneas pendientes de facturación para esta OC");
  }

  if (existingDraft) {
    await syncAutoFromPoDraftLines({
      draftId: existingDraft.id,
      existingLines: existingDraft.lines,
      draftLines,
      invoiceLetter: existingDraft.invoiceLetter,
      actorUserId: ctx.actorUserId,
      internalNotes,
    });
    if (options?.asSystemFromReceiptPolicy) {
      const refreshed = await prisma.supplierInvoice.findUniqueOrThrow({
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
    return getSupplierInvoiceById(existingDraft.id, ctx, input.projectId);
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
      ? { bypassApMutateGate: true, trustedSystemPath: "receipt-auto-draft" }
      : undefined,
  );
}

/** Qty already on ISSUED + other DRAFTs (optionally excluding one auto-draft being refreshed). */
async function loadCoveredQtyByPoLine(
  purchaseOrderId: string,
  tenantId: string,
  excludeDraftId: string | null,
): Promise<Map<string, Prisma.Decimal>> {
  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      tenantId,
      purchaseOrderId,
      status: { in: ["DRAFT", "ISSUED"] },
      ...(excludeDraftId ? { id: { not: excludeDraftId } } : {}),
    },
    select: { lines: { select: { purchaseOrderLineId: true, quantity: true } } },
  });
  const map = new Map<string, Prisma.Decimal>();
  for (const inv of invoices) {
    for (const line of inv.lines) {
      if (!line.purchaseOrderLineId) continue;
      const prev = map.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0);
      map.set(line.purchaseOrderLineId, prev.add(line.quantity));
    }
  }
  return map;
}

function autoDraftLinesAlreadyCover(
  existingLines: Array<{ purchaseOrderLineId: string | null; quantity: Prisma.Decimal }>,
  targets: InvoiceDraftLineInput[],
): boolean {
  const byPo = new Map<string, string>();
  for (const l of existingLines) {
    if (!l.purchaseOrderLineId) continue;
    byPo.set(l.purchaseOrderLineId, serializeQtyDecimal(l.quantity));
  }
  if (byPo.size !== targets.length) return false;
  for (const t of targets) {
    if (!t.purchaseOrderLineId) return false;
    if (byPo.get(t.purchaseOrderLineId) !== t.quantity) return false;
  }
  return true;
}

/**
 * Refresh an open auto-from-PO DRAFT so later receipts / Registrar factura do not
 * leave under-covered lines ([D-108] idempotent hit).
 */
async function syncAutoFromPoDraftLines(params: {
  draftId: string;
  existingLines: Array<{ purchaseOrderLineId: string | null; quantity: Prisma.Decimal }>;
  draftLines: InvoiceDraftLineInput[];
  invoiceLetter: string | null;
  actorUserId: string;
  internalNotes: string;
}): Promise<void> {
  if (autoDraftLinesAlreadyCover(params.existingLines, params.draftLines)) {
    return;
  }

  const forceZeroTax = params.invoiceLetter === "C" || params.invoiceLetter === "E";

  await prisma.$transaction(async (tx) => {
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
  });
}
