import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { toIsoDateLocal } from "@bloqer/utils";
import type { CreateSupplierInvoiceFromPurchaseOrderInput } from "@bloqer/validators";
import { ServiceContext, ServiceError } from "../types";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { canViewApProjectArea } from "./ap-access";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import {
  createSupplierInvoice,
  getSupplierInvoiceById,
  type ProjectSupplierInvoiceListRow,
  type SupplierInvoiceView,
} from "./supplier-invoice.service";
import {
  buildAutoFromPoInternalNotes,
  buildInvoiceDraftLinesFromPo,
  computePendingToInvoiceAmount,
  sumPoLinesReceivedAmount,
  type PoLineForInvoiceDraft,
} from "./supplier-invoice-from-po-pure";

const LINKABLE_PO_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;

export type PurchaseOrderBillingSummary = {
  receivedAmount: string;
  invoicedAmount: string;
  paidAmount: string;
  pendingToInvoice: string;
  hasReceivedQuantity: boolean;
  draftInvoiceCount: number;
};

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toIsoDateLocal(d);
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
    lineTotal: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal;
  },
): PoLineForInvoiceDraft {
  return {
    id: line.id,
    description: line.description,
    unitPrice: line.unitPrice.toString(),
    taxRate: line.taxRate.toString(),
    orderQuantity: line.quantity.toString(),
    receivedQuantity: line.receivedQuantity.toString(),
    lineTotal: line.lineTotal.toString(),
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
      totalAmount: true,
      status: true,
      payable: { select: { paidAmount: true, status: true } },
    },
  });

  let invoicedAmount = new Prisma.Decimal(0);
  let paidAmount = new Prisma.Decimal(0);
  let draftInvoiceCount = 0;

  for (const inv of invoices) {
    if (inv.status === "DRAFT") {
      draftInvoiceCount += 1;
      continue;
    }
    invoicedAmount = invoicedAmount.add(inv.totalAmount);
    if (inv.payable && inv.payable.status !== "CANCELLED") {
      paidAmount = paidAmount.add(inv.payable.paidAmount);
    }
  }

  const pendingToInvoice = computePendingToInvoiceAmount(receivedAmount, invoicedAmount);

  return {
    receivedAmount: receivedAmount.toFixed(2),
    invoicedAmount: invoicedAmount.toFixed(2),
    paidAmount: paidAmount.toFixed(2),
    pendingToInvoice: pendingToInvoice.toFixed(2),
    hasReceivedQuantity,
    draftInvoiceCount,
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
    },
    orderBy: [{ number: "asc" }, { id: "asc" }],
  });

  return invoices.map((inv) => ({
    ...inv,
    subtotal: inv.subtotal.toString(),
    taxAmount: inv.taxAmount.toString(),
    totalAmount: inv.totalAmount.toString(),
    code: `FP-${String(inv.number).padStart(5, "0")}`,
    supplierName: inv.supplierContact.fantasyName ?? inv.supplierContact.legalName,
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
      purchaseOrderId: true,
      totalAmount: true,
      currency: true,
      supplierContactId: true,
      status: true,
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

  if (inv.totalAmount.greaterThan(receivedAmount) && receivedAmount.greaterThan(0)) {
    warnings.push(
      `El total de la factura (${inv.totalAmount.toFixed(2)}) supera el valor recibido acumulado de la OC (${receivedAmount.toFixed(2)}).`,
    );
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
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear facturas de proveedor");
  }

  await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);

  const po = await loadPoForBilling(input.purchaseOrderId, ctx);
  if (po.projectId !== input.projectId) {
    throw new ServiceError("CONFLICT", "La orden de compra no pertenece a este proyecto");
  }
  if (!LINKABLE_PO_STATUSES.includes(po.status as (typeof LINKABLE_PO_STATUSES)[number])) {
    throw new ServiceError(
      "CONFLICT",
      "Solo se puede facturar desde órdenes de compra emitidas o con recepción",
    );
  }

  const internalNotes = buildAutoFromPoInternalNotes(input.purchaseOrderId, input.purchaseReceiptId);
  const existingDraft = await prisma.supplierInvoice.findFirst({
    where: {
      tenantId: ctx.tenantId,
      purchaseOrderId: input.purchaseOrderId,
      status: "DRAFT",
      internalNotes,
    },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      supplierContact: { select: { legalName: true, fantasyName: true } },
    },
  });
  if (existingDraft) {
    return getSupplierInvoiceById(existingDraft.id, ctx, input.projectId);
  }

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
      receipt.lines.map((l) => [l.purchaseOrderLineId, l.quantityReceived.toString()]),
    );
  }

  const poLines = po.lines.map(toPoLineDraft);
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

  const summary = await getPurchaseOrderBillingSummary(input.purchaseOrderId, ctx);
  const invoicedAmount = new Prisma.Decimal(summary.invoicedAmount);

  if (receivedAmount.lessThanOrEqualTo(0)) {
    throw new ServiceError(
      "CONFLICT",
      input.purchaseReceiptId
        ? "La recepción no tiene cantidades facturables"
        : "La orden de compra no tiene cantidades recibidas para facturar",
    );
  }

  const basis = input.purchaseReceiptId
    ? "received"
    : invoicedAmount.greaterThan(0)
      ? "remaining"
      : (input.basis ?? "received");
  const draftLines = buildInvoiceDraftLinesFromPo(poLines, {
    basis,
    receiptQuantities,
    receivedAmount,
    invoicedAmount,
  });

  if (draftLines.length === 0) {
    throw new ServiceError("CONFLICT", "No hay líneas pendientes de facturación para esta OC");
  }

  return createSupplierInvoice(
    {
      projectId: input.projectId,
      supplierContactId: po.supplierContactId,
      issueDate: toIsoDateLocal(),
      dueDate: defaultDueDate(),
      currency: po.currency,
      purchaseOrderId: input.purchaseOrderId,
      internalNotes,
      notes: input.purchaseReceiptId
        ? `Generada desde recepción vinculada a ${po.number}`
        : `Generada desde OC-${String(po.number).padStart(3, "0")}`,
      lines: draftLines.map((l, i) => ({ ...l, sortOrder: i })),
    },
    ctx,
  );
}
