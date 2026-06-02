import { Prisma, prisma, PurchaseOrder } from "@bloqer/database";
import type { CreatePurchaseOrderInput, UpdatePurchaseOrderInput } from "@bloqer/validators";
import { auditProcurement } from "./procurement-audit";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { calcLine, recalcPurchaseOrderTotals } from "./purchase-order-calc.service";
import {
  canEditPurchaseOrders,
  canViewProcurementProjectArea,
} from "./procurement-access";
import { PO_RECEIPT_ELIGIBLE_STATUSES } from "./procurement-constants";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { assertCompanyMatchesProject, assertWbsLineForProject } from "./procurement-wbs";
import { getCompanyProcurementSettingsForProject } from "./company-procurement-settings.service";
import { assertDirectPoAllowed } from "./procurement-policy.service";
import { sortTreeOrder } from "@bloqer/utils";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { onPurchaseOrderDraftCancelled } from "./purchase-request-to-po.service";

export {
  submitPurchaseOrder,
  approvePurchaseOrder,
  confirmPurchaseOrder,
  issuePurchaseOrder,
} from "./purchase-order-workflow.service";

// ─── View types ───────────────────────────────────────────────────────────────

export type PurchaseOrderLineView = {
  id: string;
  purchaseOrderId: string;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  productId: string | null;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
  receivedQuantity: string;
  remainingQuantity: string;
  sortOrder: number;
  varianceTier: string;
  variancePct: string | null;
  varianceJustification: string | null;
};

export type PurchaseOrderView = Omit<PurchaseOrder, "subtotal" | "taxAmount" | "totalAmount"> & {
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  code: string;
  supplierName: string;
  lines: PurchaseOrderLineView[];
};

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeLine(
  l: {
    id: string; purchaseOrderId: string; wbsNodeId: string | null; productId: string | null;
    description: string; unit: string;
    quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; taxRate: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal; lineTax: Prisma.Decimal; lineTotal: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal; sortOrder: number;
    varianceTier: string;
    variancePct: Prisma.Decimal | null;
    varianceJustification: string | null;
    wbsNode: { code: string; name: string } | null;
  },
): PurchaseOrderLineView {
  const remaining = l.quantity.minus(l.receivedQuantity);
  return {
    id:                l.id,
    purchaseOrderId:   l.purchaseOrderId,
    wbsNodeId:         l.wbsNodeId,
    wbsNodeCode:       l.wbsNode?.code ?? null,
    wbsNodeName:       l.wbsNode?.name ?? null,
    productId:         l.productId,
    description:       l.description,
    unit:              l.unit,
    quantity:          l.quantity.toString(),
    unitPrice:         l.unitPrice.toString(),
    taxRate:           l.taxRate.toString(),
    lineSubtotal:      l.lineSubtotal.toString(),
    lineTax:           l.lineTax.toString(),
    lineTotal:         l.lineTotal.toString(),
    receivedQuantity:  l.receivedQuantity.toString(),
    remainingQuantity: remaining.lessThan(0) ? "0" : remaining.toString(),
    sortOrder:         l.sortOrder,
    varianceTier:      l.varianceTier,
    variancePct:       l.variancePct?.toString() ?? null,
    varianceJustification: l.varianceJustification,
  };
}

function serializePO(
  po: PurchaseOrder & {
    supplierContact: { legalName: string; fantasyName: string | null };
    lines: Array<Parameters<typeof serializeLine>[0]>;
  },
): PurchaseOrderView {
  const supplierName = po.supplierContact.fantasyName ?? po.supplierContact.legalName;
  return {
    ...po,
    subtotal:    po.subtotal.toString(),
    taxAmount:   po.taxAmount.toString(),
    totalAmount: po.totalAmount.toString(),
    code:        `OC-${String(po.number).padStart(3, "0")}`,
    supplierName,
    lines:       po.lines.map(serializeLine),
  };
}

const lineInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: { wbsNode: { select: { code: true, name: true } } },
};

const poInclude = {
  supplierContact: { select: { legalName: true, fantasyName: true } },
  lines: lineInclude,
};

// ─── Resolve company ──────────────────────────────────────────────────────────

async function resolveCompanyId(projectId: string, ctx: ServiceContext): Promise<string> {
  if (ctx.companyId) return ctx.companyId;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { companyId: true } });
  if (project?.companyId) return project.companyId;
  const company = await prisma.company.findFirst({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!company) throw new ServiceError("CONFLICT", "No hay empresa activa para la orden de compra");
  return company.id;
}

// ─── Linkable PO helper (for SupplierInvoice form) ───────────────────────────

export type LinkablePurchaseOrder = {
  id: string;
  code: string;
  supplierContactId: string;
  currency: string;
  status: string;
};

export async function listLinkablePurchaseOrders(
  projectId: string,
  ctx: ServiceContext,
): Promise<LinkablePurchaseOrder[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para listar órdenes de compra");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      projectId,
      tenantId: ctx.tenantId,
      status: { in: [...PO_RECEIPT_ELIGIBLE_STATUSES] },
    },
    select: { id: true, number: true, supplierContactId: true, currency: true, status: true },
    orderBy: { number: "asc" },
  });

  return orders.map((o) => ({
    id:                o.id,
    code:              `OC-${String(o.number).padStart(3, "0")}`,
    supplierContactId: o.supplierContactId,
    currency:          o.currency,
    status:            o.status,
  }));
}

// ─── WBS options helper ───────────────────────────────────────────────────────

export type ProcurementWbsOption = {
  id: string;
  code: string;
  name: string;
  budgetName: string;
};

export async function listProcurementWbsOptions(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProcurementWbsOption[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para opciones de compra / WBS");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const nodes = await prisma.wbsNode.findMany({
    where: {
      type: "ITEM",
      budget: { projectId, status: { in: ["APPROVED", "CLOSED"] } },
    },
    select: {
      id: true,
      code: true,
      name: true,
      parentId: true,
      sortOrder: true,
      budget: { select: { name: true, versionNumber: true } },
    },
  });

  const ordered = sortTreeOrder(nodes, (a, b) => a.code.localeCompare(b.code));

  return ordered.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
    budgetName: `${n.budget.name} v${n.budget.versionNumber}`,
  }));
}

// ─── Guard ────────────────────────────────────────────────────────────────────

function assertDraft(po: PurchaseOrder): void {
  if (po.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `La orden de compra en estado "${po.status}" no puede editarse.`);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getPurchaseOrderById(id: string, ctx: ServiceContext): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver órdenes de compra");
  }
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude });
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializePO(po);
}

export async function listPurchaseOrdersByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PurchaseOrderView[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver órdenes de compra");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const orders = await prisma.purchaseOrder.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: poInclude,
    orderBy: { number: "asc" },
  });
  return orders.map(serializePO);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  ctx: ServiceContext,
): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear órdenes de compra");
  }

  await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);

  // BR-SUP-001: validate supplier role
  const supplierRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId: input.supplierContactId, role: "SUPPLIER" } },
  });
  if (!supplierRole || supplierRole.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El contacto seleccionado no tiene rol de proveedor activo");
  }

  for (const line of input.lines) {
    if (line.wbsNodeId) {
      await assertWbsLineForProject(line.wbsNodeId, input.projectId, ctx.tenantId);
    }
  }

  const companyId = await resolveCompanyId(input.projectId, ctx);
  await assertCompanyMatchesProject(companyId, input.projectId, ctx.tenantId);

  let estimatedTotal = new Prisma.Decimal(0);
  for (const line of input.lines) {
    const qty = new Prisma.Decimal(line.quantity);
    const price = new Prisma.Decimal(line.unitPrice);
    const rate = new Prisma.Decimal(line.taxRate ?? "0");
    estimatedTotal = estimatedTotal.plus(calcLine(qty, price, rate).lineTotal);
  }
  const settings = await getCompanyProcurementSettingsForProject(input.projectId, ctx);
  const fx = computeDocumentFxAmounts(input.currency ?? "ARS", estimatedTotal, null);
  assertDirectPoAllowed(settings, fx.amountArs, ctx);

  const maxNum = await prisma.purchaseOrder.aggregate({
    where: { tenantId: ctx.tenantId, companyId },
    _max: { number: true },
  });
  const number = (maxNum._max.number ?? 0) + 1;

  const po = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        tenantId:            ctx.tenantId,
        companyId,
        projectId:           input.projectId,
        supplierContactId:   input.supplierContactId,
        number,
        issueDate:           new Date(input.issueDate),
        expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
        currency:            input.currency ?? "ARS",
        notes:               input.notes ?? null,
        internalNotes:       input.internalNotes ?? null,
        originRequestedByUserId: ctx.actorUserId,
        createdBy:           ctx.actorUserId,
        updatedBy:           ctx.actorUserId,
      },
    });

    for (const line of input.lines) {
      const qty   = new Prisma.Decimal(line.quantity);
      const price = new Prisma.Decimal(line.unitPrice);
      const rate  = new Prisma.Decimal(line.taxRate ?? "0");
      const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
      await tx.purchaseOrderLine.create({
        data: {
          purchaseOrderId: created.id,
          wbsNodeId:       line.wbsNodeId ?? null,
          productId:       line.productId ?? null,
          description:     line.description,
          unit:            line.unit ?? "",
          quantity:        qty,
          unitPrice:       price,
          taxRate:         rate,
          lineSubtotal,
          lineTax,
          lineTotal,
          sortOrder:       line.sortOrder ?? 0,
        },
      });
    }

    await recalcPurchaseOrderTotals(tx, created.id);

    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: created.id }, include: poInclude });
    await auditProcurement(
      ctx,
      "purchase_order.created",
      "PurchaseOrder",
      po.id,
      { projectId: po.projectId, companyId: po.companyId },
      { after: { number: po.number }, tx },
    );
    return po;
  });

  return serializePO(po);
}

export async function updatePurchaseOrder(
  id: string,
  input: UpdatePurchaseOrderInput,
  ctx: ServiceContext,
): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar órdenes de compra");
  }

  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);
  assertDraft(existing);

  if (input.supplierContactId) {
    const supplierRole = await prisma.contactRole.findUnique({
      where: { contactId_role: { contactId: input.supplierContactId, role: "SUPPLIER" } },
    });
    if (!supplierRole || supplierRole.status !== "ACTIVE") {
      throw new ServiceError("CONFLICT", "El contacto seleccionado no tiene rol de proveedor activo");
    }
  }

  if (input.lines) {
    for (const line of input.lines) {
      if (line.wbsNodeId) {
        const wbsNode = await prisma.wbsNode.findUnique({
          where: { id: line.wbsNodeId },
          include: { budget: { select: { projectId: true, status: true } } },
        });
        if (!wbsNode) throw new ServiceError("NOT_FOUND", `Nodo WBS no encontrado: ${line.wbsNodeId}`);
        if (wbsNode.type !== "ITEM") throw new ServiceError("CONFLICT", "Solo se permiten nodos WBS de tipo ITEM");
        if (wbsNode.budget.projectId !== existing.projectId) {
          throw new ServiceError("CONFLICT", "El nodo WBS no pertenece al proyecto");
        }
        if (!["APPROVED", "CLOSED"].includes(wbsNode.budget.status)) {
          throw new ServiceError("CONFLICT", "Solo se permiten nodos WBS de presupuestos APROBADOS o CERRADOS");
        }
      }
    }
  }

  const po = await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierContactId:    input.supplierContactId ?? existing.supplierContactId,
        issueDate:            input.issueDate ? new Date(input.issueDate) : existing.issueDate,
        expectedDeliveryDate: input.expectedDeliveryDate !== undefined
          ? (input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null)
          : existing.expectedDeliveryDate,
        notes:                input.notes !== undefined ? input.notes : existing.notes,
        internalNotes:        input.internalNotes !== undefined ? input.internalNotes : existing.internalNotes,
        updatedBy:            ctx.actorUserId,
      },
    });

    if (input.lines) {
      const previousLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      for (const line of input.lines) {
        const prev = previousLines.find(
          (p) =>
            p.wbsNodeId === (line.wbsNodeId ?? null) &&
            p.description === line.description,
        );
        const qty   = new Prisma.Decimal(line.quantity);
        const price = new Prisma.Decimal(line.unitPrice);
        const rate  = new Prisma.Decimal(line.taxRate ?? "0");
        const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
        await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: id,
            wbsNodeId:       line.wbsNodeId ?? null,
            productId:       line.productId ?? null,
            description:     line.description,
            unit:            line.unit ?? "",
            quantity:        qty,
            unitPrice:       price,
            taxRate:         rate,
            lineSubtotal,
            lineTax,
            lineTotal,
            sortOrder:       line.sortOrder ?? 0,
            budgetUnitCostSnapshot: prev?.budgetUnitCostSnapshot ?? null,
            varianceJustification:
              line.varianceJustification !== undefined
                ? line.varianceJustification
                : prev?.varianceJustification ?? null,
            varianceTier: prev?.varianceTier ?? "NONE",
            variancePct: prev?.variancePct ?? null,
            varianceUnitMismatch: prev?.varianceUnitMismatch ?? false,
          },
        });
      }
      await recalcPurchaseOrderTotals(tx, id);
    }

    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: poInclude });
    await auditProcurement(
      ctx,
      "purchase_order.updated",
      "PurchaseOrder",
      id,
      { projectId: po.projectId, companyId: po.companyId },
      { after: { number: po.number }, tx },
    );
    return po;
  });

  return serializePO(po);
}

export async function cancelPurchaseOrder(id: string, ctx: ServiceContext): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para anular órdenes de compra");
  }

  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  if (existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "La orden de compra ya está anulada");
  }
  if (existing.status === "PARTIALLY_RECEIVED" || existing.status === "RECEIVED") {
    throw new ServiceError("CONFLICT", "No se puede anular una orden con recepciones registradas");
  }

  // Block if any CONFIRMED receipts exist
  const confirmedReceipts = await prisma.purchaseReceipt.count({
    where: { purchaseOrderId: id, status: "CONFIRMED" },
  });
  if (confirmedReceipts > 0) {
    throw new ServiceError("CONFLICT", "No se puede anular: la orden tiene recepciones confirmadas");
  }

  // Block if any non-CANCELLED supplier invoices are linked
  const linkedInvoices = await prisma.supplierInvoice.count({
    where: { purchaseOrderId: id, status: { not: "CANCELLED" } },
  });
  if (linkedInvoices > 0) {
    throw new ServiceError("CONFLICT", "No se puede anular: hay facturas de proveedor vinculadas activas");
  }

  const wasDraft = existing.status === "DRAFT";

  const po = await prisma.$transaction(async (tx) => {
    const draftReceipts = await tx.purchaseReceipt.findMany({
      where: { purchaseOrderId: id, status: "DRAFT" },
      select: { id: true, projectId: true, companyId: true },
    });

    if (draftReceipts.length > 0) {
      await tx.purchaseReceipt.updateMany({
        where: { purchaseOrderId: id, status: "DRAFT" },
        data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
      });
      for (const receipt of draftReceipts) {
        await auditProcurement(
          ctx,
          "purchase_receipt.cancelled",
          "PurchaseReceipt",
          receipt.id,
          { projectId: receipt.projectId, companyId: receipt.companyId },
          {
            after: {
              purchaseOrderId: id,
              number: existing.number,
              cancelledByPurchaseOrder: true,
            },
            tx,
          },
        );
      }
    }

    const cancelled = await tx.purchaseOrder.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
      include: poInclude,
    });

    if (wasDraft && existing.purchaseRequestId) {
      await onPurchaseOrderDraftCancelled(id, ctx, tx);
    }

    await auditProcurement(
      ctx,
      "purchase_order.cancelled",
      "PurchaseOrder",
      id,
      { projectId: cancelled.projectId, companyId: cancelled.companyId },
      {
        after: {
          number: cancelled.number,
          cancelledDraftReceiptCount: draftReceipts.length,
        },
        tx,
      },
    );

    return cancelled;
  });

  return serializePO(po);
}
