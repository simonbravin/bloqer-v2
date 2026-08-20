import { Prisma, prisma, PurchaseOrder } from "@bloqer/database";
import type { CreatePurchaseOrderInput, UpdatePurchaseOrderInput } from "@bloqer/validators";
import { sortTreeOrder } from "@bloqer/utils";
import { auditProcurement } from "./procurement-audit";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { calcLine, recalcPurchaseOrderTotals } from "./purchase-order-calc.service";
import {
  canEditPurchaseOrders,
  canViewProcurementProjectArea,
} from "./procurement-access";
import { PO_RECEIPT_ELIGIBLE_STATUSES } from "./procurement-constants";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { assertCompanyMatchesProject, assertCostAnalysisLineForWbs, assertWbsLineForProject } from "./procurement-wbs";
import { assertContactRoleInTenant } from "../contact/assert-contact-role";
import { getCompanyProcurementSettingsForProject } from "./company-procurement-settings.service";
import { assertDirectPoAllowed } from "./procurement-policy.service";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
} from "../finance/money-decimal";
import {
  assertPoLinesWithinSelectedQuote,
  onPurchaseOrderCancelledLinkedToRequest,
} from "./purchase-request-to-po.service";
import {
  assertWbsRequiredOnLines,
  budgetBaselineForPurchaseLine,
  getWbsBudgetReference,
} from "./procurement-budget-baseline";
import {
  resolveUserDisplayNames,
  userDisplayNameFromMap,
} from "../user/resolve-user-display-names";
import { loadMaterialApuCommitmentByLineId } from "../materials/material-commitment";

export {
  submitPurchaseOrder,
  approvePurchaseOrder,
  returnPurchaseOrder,
  confirmPurchaseOrder,
} from "./purchase-order-workflow.service";

// ─── View types ───────────────────────────────────────────────────────────────

export type PurchaseOrderLineView = {
  id: string;
  purchaseOrderId: string;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  productId: string | null;
  costAnalysisLineId: string | null;
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
  budgetUnitCostSnapshot: string | null;
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
  approvedByName: string | null;
  createdByName: string | null;
  originRequestedByName: string | null;
  lines: PurchaseOrderLineView[];
};

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeLine(
  l: {
    id: string; purchaseOrderId: string; wbsNodeId: string | null; productId: string | null;
    costAnalysisLineId: string | null;
    description: string; unit: string;
    quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; taxRate: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal; lineTax: Prisma.Decimal; lineTotal: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal; sortOrder: number;
    budgetUnitCostSnapshot: Prisma.Decimal | null;
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
    costAnalysisLineId: l.costAnalysisLineId,
    description:       l.description,
    unit:              l.unit,
    quantity:          serializeQtyDecimal(l.quantity),
    unitPrice:         serializeUnitPriceDecimal(l.unitPrice),
    taxRate:           serializeRatePctDecimal(l.taxRate),
    lineSubtotal:      serializeMoneyDecimal(l.lineSubtotal),
    lineTax:           serializeMoneyDecimal(l.lineTax),
    lineTotal:         serializeMoneyDecimal(l.lineTotal),
    receivedQuantity:  serializeQtyDecimal(l.receivedQuantity),
    remainingQuantity: remaining.lessThan(0) ? serializeQtyDecimal(0) : serializeQtyDecimal(remaining),
    sortOrder:         l.sortOrder,
    budgetUnitCostSnapshot: l.budgetUnitCostSnapshot != null ? serializeUnitPriceDecimal(l.budgetUnitCostSnapshot) : null,
    varianceTier:      l.varianceTier,
    variancePct:       l.variancePct != null ? serializeRatePctDecimal(l.variancePct) : null,
    varianceJustification: l.varianceJustification,
  };
}

function serializePO(
  po: PurchaseOrder & {
    supplierContact: { legalName: string; fantasyName: string | null };
    lines: Array<Parameters<typeof serializeLine>[0]>;
  },
  names: {
    approvedByName: string | null;
    createdByName: string | null;
    originRequestedByName: string | null;
  } = { approvedByName: null, createdByName: null, originRequestedByName: null },
): PurchaseOrderView {
  const supplierName = po.supplierContact.fantasyName ?? po.supplierContact.legalName;
  return {
    ...po,
    subtotal:    serializeMoneyDecimal(po.subtotal),
    taxAmount:   serializeMoneyDecimal(po.taxAmount),
    totalAmount: serializeMoneyDecimal(po.totalAmount),
    approvedByName: names.approvedByName,
    createdByName: names.createdByName,
    originRequestedByName: names.originRequestedByName,
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

export type ProcurementApuOption = {
  id: string;
  description: string;
  unit: string;
  unitCost: string;
  productId: string | null;
  /**
   * Prefill qty = shortfall (need − ordered). Null when non-purchasable / zero need.
   * Falls back to need when nothing ordered yet.
   */
  quantity: string | null;
  /** Budget physical need ([D-047]). */
  needQty: string | null;
  /** Committed demand (CONFIRMED+ OC / SC without OC). */
  orderedQty: string | null;
  /** max(0, need − ordered). */
  shortfallQty: string | null;
};

export type ProcurementWbsOption = {
  id: string;
  code: string;
  name: string;
  budgetName: string;
  budgetUnitCost: string | null;
  budgetUnit: string | null;
  availableSaldo: string | null;
  wouldExceedBudget: boolean;
  /** MATERIAL APU hints under this ITEM ([D-068]). */
  apuLines: ProcurementApuOption[];
};

export async function listProcurementWbsOptions(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProcurementWbsOption[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para opciones de compra / EDT");
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
      costItem: {
        select: {
          analysisLines: {
            where: { category: "MATERIAL", isLumpSum: false },
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              description: true,
              unit: true,
              unitCost: true,
              productId: true,
            },
          },
        },
      },
    },
  });

  const ordered = sortTreeOrder(nodes, (a, b) => a.code.localeCompare(b.code));
  const commitments = await loadMaterialApuCommitmentByLineId(projectId, ctx.tenantId);

  const refs = await Promise.all(ordered.map((n) => getWbsBudgetReference(n.id, ctx.tenantId)));

  const result: ProcurementWbsOption[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const n = ordered[i]!;
    const ref = refs[i]!;
    result.push({
      id: n.id,
      code: n.code,
      name: n.name,
      budgetName: `${n.budget.name} v${n.budget.versionNumber}`,
      budgetUnitCost: ref.budgetUnitCost,
      budgetUnit: ref.budgetUnit,
      availableSaldo: ref.availableSaldo,
      wouldExceedBudget: ref.wouldExceedBudget,
      apuLines: (n.costItem?.analysisLines ?? []).map((l) => {
        const c = commitments.get(l.id);
        return {
          id: l.id,
          description: l.description,
          unit: l.unit,
          unitCost: serializeUnitPriceDecimal(l.unitCost),
          productId: l.productId,
          // Prefill remaining to buy (0 when fully covered).
          quantity: c?.shortfallQty ?? null,
          needQty: c?.needQty ?? null,
          orderedQty: c?.orderedQty ?? null,
          shortfallQty: c?.shortfallQty ?? null,
        };
      }),
    });
  }
  return result;
}

// ─── Guard ────────────────────────────────────────────────────────────────────

function assertDraft(po: PurchaseOrder): void {
  if (po.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `La orden de compra en estado "${po.status}" no puede editarse.`);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

async function toPurchaseOrderView(
  po: PurchaseOrder & {
    supplierContact: { legalName: string; fantasyName: string | null };
    lines: Array<Parameters<typeof serializeLine>[0]>;
  },
): Promise<PurchaseOrderView> {
  const nameById = await resolveUserDisplayNames([
    po.approvedByUserId,
    po.createdBy,
    po.originRequestedByUserId,
  ]);
  return serializePO(po, {
    approvedByName: userDisplayNameFromMap(nameById, po.approvedByUserId),
    createdByName: userDisplayNameFromMap(nameById, po.createdBy),
    originRequestedByName: userDisplayNameFromMap(nameById, po.originRequestedByUserId),
  });
}

export async function getPurchaseOrderById(id: string, ctx: ServiceContext): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver órdenes de compra");
  }
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude });
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return toPurchaseOrderView(po);
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
  const nameById = await resolveUserDisplayNames(
    orders.flatMap((o) => [o.approvedByUserId, o.createdBy, o.originRequestedByUserId]),
  );
  return orders.map((o) =>
    serializePO(o, {
      approvedByName: userDisplayNameFromMap(nameById, o.approvedByUserId),
      createdByName: userDisplayNameFromMap(nameById, o.createdBy),
      originRequestedByName: userDisplayNameFromMap(nameById, o.originRequestedByUserId),
    }),
  );
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

  await assertContactRoleInTenant(input.supplierContactId, "SUPPLIER", ctx.tenantId);

  assertWbsRequiredOnLines(input.lines);
  for (const line of input.lines) {
    await assertWbsLineForProject(line.wbsNodeId, input.projectId, ctx.tenantId);
    if (line.costAnalysisLineId) {
      await assertCostAnalysisLineForWbs(line.costAnalysisLineId, line.wbsNodeId, ctx.tenantId);
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
  assertDirectPoAllowed(settings, fx.amountArs, ctx, {
    emergencyReason: input.emergencyReason,
  });

  const po = await prisma.$transaction(async (tx) => {
    const maxNum = await tx.purchaseOrder.aggregate({
      where: { tenantId: ctx.tenantId, companyId },
      _max: { number: true },
    });
    const number = (maxNum._max.number ?? 0) + 1;

    const created = await tx.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        projectId: input.projectId,
        supplierContactId: input.supplierContactId,
        number,
        issueDate: new Date(input.issueDate),
        expectedDeliveryDate: input.expectedDeliveryDate
          ? new Date(input.expectedDeliveryDate)
          : null,
        currency: input.currency ?? "ARS",
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        emergencyReason: input.emergencyReason?.trim() || null,
        originRequestedByUserId: ctx.actorUserId,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    for (const line of input.lines) {
      const qty = new Prisma.Decimal(line.quantity);
      const price = new Prisma.Decimal(line.unitPrice);
      const rate = new Prisma.Decimal(line.taxRate ?? "0");
      const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
      const baseline = await budgetBaselineForPurchaseLine(
        line.wbsNodeId,
        {
          productId: line.productId,
          description: line.description,
          unit: line.unit ?? "",
          costAnalysisLineId: line.costAnalysisLineId,
        },
        tx,
      );
      await tx.purchaseOrderLine.create({
        data: {
          purchaseOrderId: created.id,
          wbsNodeId: line.wbsNodeId,
          productId: line.productId ?? null,
          costAnalysisLineId: line.costAnalysisLineId ?? null,
          description: line.description,
          unit: line.unit ?? "",
          quantity: qty,
          unitPrice: price,
          taxRate: rate,
          lineSubtotal,
          lineTax,
          lineTotal,
          budgetUnitCostSnapshot: baseline.unitCost,
          varianceJustification: line.varianceJustification?.trim() || null,
          sortOrder: line.sortOrder ?? 0,
        },
      });
    }

    await recalcPurchaseOrderTotals(tx, created.id);

    const po = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: created.id },
      include: poInclude,
    });
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

  return toPurchaseOrderView(po);
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
    await assertContactRoleInTenant(input.supplierContactId, "SUPPLIER", ctx.tenantId);
  }

  if (input.lines) {
    assertWbsRequiredOnLines(input.lines);
    for (const line of input.lines) {
      await assertWbsLineForProject(line.wbsNodeId, existing.projectId, ctx.tenantId);
      if (line.costAnalysisLineId) {
        await assertCostAnalysisLineForWbs(line.costAnalysisLineId, line.wbsNodeId, ctx.tenantId);
      }
    }
    await assertPoLinesWithinSelectedQuote(
      id,
      input.lines.map((l, i) => ({
        description: l.description,
        wbsNodeId: l.wbsNodeId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        sortOrder: l.sortOrder ?? i,
      })),
      ctx.tenantId,
    );
  }

  const po = await prisma.$transaction(async (tx) => {
    // Claim DRAFT so concurrent submit cannot leave a submitted PO with rewritten lines.
    const headerClaim = await tx.purchaseOrder.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: {
        supplierContactId:    input.supplierContactId ?? existing.supplierContactId,
        issueDate:            input.issueDate ? new Date(input.issueDate) : existing.issueDate,
        expectedDeliveryDate: input.expectedDeliveryDate !== undefined
          ? (input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null)
          : existing.expectedDeliveryDate,
        notes:                input.notes !== undefined ? input.notes : existing.notes,
        internalNotes:        input.internalNotes !== undefined ? input.internalNotes : existing.internalNotes,
        emergencyReason:
          input.emergencyReason !== undefined
            ? input.emergencyReason?.trim() || null
            : existing.emergencyReason,
        updatedBy:            ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      headerClaim.count,
      "La orden de compra ya no está en borrador. Recargá e intentá de nuevo.",
    );

    if (input.lines) {
      const previousLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      for (const line of input.lines) {
        const prev = previousLines.find(
          (p) =>
            p.wbsNodeId === line.wbsNodeId &&
            p.description === line.description,
        );
        const qty   = new Prisma.Decimal(line.quantity);
        const price = new Prisma.Decimal(line.unitPrice);
        const rate  = new Prisma.Decimal(line.taxRate ?? "0");
        const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
        const baseline = await budgetBaselineForPurchaseLine(
          line.wbsNodeId,
          {
            productId: line.productId,
            description: line.description,
            unit: line.unit ?? "",
            costAnalysisLineId: line.costAnalysisLineId,
          },
          tx,
        );
        const budgetSnapshot =
          prev?.wbsNodeId === line.wbsNodeId &&
          prev.description === line.description &&
          prev.budgetUnitCostSnapshot
            ? prev.budgetUnitCostSnapshot
            : baseline.unitCost;
        await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: id,
            wbsNodeId:       line.wbsNodeId,
            productId:       line.productId ?? null,
            costAnalysisLineId: line.costAnalysisLineId ?? null,
            description:     line.description,
            unit:            line.unit ?? "",
            quantity:        qty,
            unitPrice:       price,
            taxRate:         rate,
            lineSubtotal,
            lineTax,
            lineTotal,
            sortOrder:       line.sortOrder ?? 0,
            budgetUnitCostSnapshot: budgetSnapshot,
            varianceJustification:
              line.varianceJustification !== undefined
                ? line.varianceJustification?.trim() || null
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

  return toPurchaseOrderView(po);
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

    const cancelledResult = await tx.purchaseOrder.updateMany({
      where: {
        id,
        status: { notIn: ["CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED"] },
      },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    if (cancelledResult.count !== 1) {
      throw new ServiceError("CONFLICT", "La orden ya no se puede anular (estado cambió)");
    }

    const cancelled = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: poInclude,
    });

    if (existing.purchaseRequestId) {
      await onPurchaseOrderCancelledLinkedToRequest(id, ctx, tx);
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
          previousStatus: existing.status,
          wasDraft,
        },
        tx,
      },
    );

    return cancelled;
  });

  return toPurchaseOrderView(po);
}
