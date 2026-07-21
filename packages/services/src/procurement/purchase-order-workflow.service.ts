import { Prisma, prisma, PurchaseOrderStatus } from "@bloqer/database";
import { auditProcurement } from "./procurement-audit";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { recalcPurchaseOrderTotals } from "./purchase-order-calc.service";
import {
  canApprovePurchaseOrders,
  canEditPurchaseOrders,
} from "./procurement-access";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { getCompanyProcurementSettingsForProject } from "./company-procurement-settings.service";
import {
  assertHighLevelApprover,
  assertSelfApprovalAllowed,
  assertStandardApprover,
  isSelfApprovalAllowed,
  isStandardApprover,
} from "./procurement-policy.service";
import { evaluateLineVariance, poRequiresHighLevelApproval } from "./purchase-variance.service";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { onPurchaseOrderConfirmed } from "./purchase-request-to-po.service";
import {
  notifyPurchaseOrderApproved,
  notifyPurchaseOrderConfirmed,
  notifyPurchaseOrderPendingApproval,
  notifyPurchaseOrderReturned,
} from "./procurement-notifications.service";
import { budgetBaselineForWbs, getWbsBudgetReference } from "./procurement-budget-baseline";
import type { PurchaseOrderView } from "./purchase-order.service";

async function reloadPoView(id: string, ctx: ServiceContext): Promise<PurchaseOrderView> {
  const { getPurchaseOrderById } = await import("./purchase-order.service");
  return getPurchaseOrderById(id, ctx);
}

const poInclude = {
  supplierContact: { select: { legalName: true, fantasyName: true } },
  purchaseRequest: { select: { requestedByUserId: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { wbsNode: { select: { code: true, name: true } } },
  },
};

async function loadPo(id: string, tenantId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude });
  if (!po || po.tenantId !== tenantId) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  return po;
}

async function applyVarianceSnapshots(
  tx: Prisma.TransactionClient,
  purchaseOrderId: string,
  tenantId: string,
  settings: Awaited<ReturnType<typeof getCompanyProcurementSettingsForProject>>,
): Promise<{
  requiresExtraApproval: boolean;
  requiresJustification: boolean;
  saldoWarnings: string[];
}> {
  const lines = await tx.purchaseOrderLine.findMany({
    where: { purchaseOrderId },
    include: { wbsNode: { select: { id: true, code: true } } },
  });

  let requiresExtraApproval = false;
  let requiresJustification = false;
  const saldoWarnings: string[] = [];

  const pendingByWbs = new Map<string, Prisma.Decimal>();
  for (const line of lines) {
    if (!line.wbsNodeId) continue;
    const prev = pendingByWbs.get(line.wbsNodeId) ?? new Prisma.Decimal(0);
    pendingByWbs.set(line.wbsNodeId, prev.plus(line.lineTotal));
  }

  for (const line of lines) {
    if (!line.wbsNodeId) {
      throw new ServiceError(
        "CONFLICT",
        "Todas las líneas deben tener WBS antes de enviar la orden",
      );
    }

    const baseline = await budgetBaselineForWbs(line.wbsNodeId, tx);
    let budgetUnitCost = line.budgetUnitCostSnapshot;
    if (!budgetUnitCost && baseline.unitCost) {
      budgetUnitCost = baseline.unitCost;
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { budgetUnitCostSnapshot: budgetUnitCost },
      });
    }

    const result = evaluateLineVariance(
      {
        unit: line.unit,
        unitPrice: line.unitPrice.toString(),
        budgetUnitCost: budgetUnitCost?.toString() ?? null,
        budgetUnit: baseline.unit,
        varianceJustification: line.varianceJustification,
      },
      settings,
    );
    if (result.requiresExtraApproval) requiresExtraApproval = true;
    if (result.requiresJustification && !line.varianceJustification?.trim()) {
      requiresJustification = true;
    }
    await tx.purchaseOrderLine.update({
      where: { id: line.id },
      data: {
        variancePct: result.variancePct ? new Prisma.Decimal(result.variancePct) : null,
        varianceTier: result.varianceTier,
        varianceUnitMismatch: result.varianceUnitMismatch,
      },
    });
  }

  for (const [wbsNodeId, pendingTotal] of pendingByWbs) {
    const ref = await getWbsBudgetReference(wbsNodeId, tenantId, {
      excludePurchaseOrderId: purchaseOrderId,
      pendingLineTotal: pendingTotal.toString(),
      db: tx,
    });
    if (ref.wouldExceedBudget) {
      saldoWarnings.push(
        `${ref.code}: el compromiso proyectado supera el presupuestado de materiales`,
      );
    }
  }

  return { requiresExtraApproval, requiresJustification, saldoWarnings };
}

function resolveOriginUserId(po: {
  originRequestedByUserId: string | null;
  purchaseRequestId: string | null;
  purchaseRequest: { requestedByUserId: string | null } | null;
}): string | null {
  return po.originRequestedByUserId ?? po.purchaseRequest?.requestedByUserId ?? null;
}

export async function submitPurchaseOrder(id: string, ctx: ServiceContext): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para enviar órdenes de compra");
  }

  const existing = await loadPo(id, ctx.tenantId);
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se pueden enviar órdenes en borrador");
  }
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);

  const lineCount = await prisma.purchaseOrderLine.count({ where: { purchaseOrderId: id } });
  if (lineCount === 0) throw new ServiceError("CONFLICT", "La orden debe tener al menos una línea");

  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, ctx);

  const submitResult = await prisma.$transaction(async (tx) => {
    await recalcPurchaseOrderTotals(tx, id);
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (po.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El monto total debe ser mayor a cero");
    }

    const { requiresExtraApproval, requiresJustification, saldoWarnings } =
      await applyVarianceSnapshots(tx, id, ctx.tenantId, settings);
    if (requiresJustification) {
      throw new ServiceError("CONFLICT", "Completá la justificación de desvío presupuestario en las líneas");
    }

    const fx = computeDocumentFxAmounts(po.currency, po.totalAmount, po.fxRate);
    const totalArs = fx.amountArs;
    const highLevel = poRequiresHighLevelApproval(totalArs, settings) || requiresExtraApproval;

    let nextStatus: PurchaseOrderStatus = "SUBMITTED";
    let approvedBy: string | null = null;
    let approvedAt: Date | null = null;

    // Auto-approve only when actor may approve; otherwise leave SUBMITTED (do not throw).
    if (!highLevel && isStandardApprover(ctx.roles)) {
      const originId = resolveOriginUserId(existing);
      if (
        isSelfApprovalAllowed(settings, originId, ctx.actorUserId, false, false)
      ) {
        nextStatus = "APPROVED";
        approvedBy = ctx.actorUserId ?? null;
        approvedAt = new Date();
      }
    }

    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: nextStatus,
        fxRate: fx.fxRate,
        totalAmountArs: totalArs,
        approvedByUserId: approvedBy,
        approvedAt,
        returnReason: null,
        returnedAt: null,
        returnedByUserId: null,
        updatedBy: ctx.actorUserId,
      },
    });

    await auditProcurement(
      ctx,
      "purchase_order.submitted",
      "PurchaseOrder",
      id,
      { projectId: po.projectId, companyId: po.companyId },
      {
        after: {
          status: nextStatus,
          ...(saldoWarnings.length > 0 ? { saldoWarnings } : {}),
        },
        tx,
      },
    );
    if (nextStatus === "APPROVED") {
      await auditProcurement(
        ctx,
        "purchase_order.approved",
        "PurchaseOrder",
        id,
        { projectId: po.projectId, companyId: po.companyId },
        { after: { autoApproved: true }, tx },
      );
    }

    return {
      nextStatus,
      requiresExtraApproval,
      totalArs,
      projectId: po.projectId,
      companyId: po.companyId,
      number: po.number,
      originRequestedByUserId: resolveOriginUserId(existing),
      createdBy: po.createdBy,
    };
  });

  if (submitResult.nextStatus === "SUBMITTED") {
    const highLevel =
      poRequiresHighLevelApproval(submitResult.totalArs, settings) ||
      submitResult.requiresExtraApproval;
    await notifyPurchaseOrderPendingApproval({
      ctx,
      purchaseOrderId: id,
      projectId: submitResult.projectId,
      companyId: submitResult.companyId,
      code: `OC-${String(submitResult.number).padStart(3, "0")}`,
      requiresHighLevel: highLevel,
      requiresVarianceExtra: submitResult.requiresExtraApproval,
    });
  } else if (submitResult.nextStatus === "APPROVED") {
    await notifyPurchaseOrderApproved({
      ctx,
      purchaseOrderId: id,
      projectId: submitResult.projectId,
      companyId: submitResult.companyId,
      code: `OC-${String(submitResult.number).padStart(3, "0")}`,
      recipientUserIds: [
        submitResult.originRequestedByUserId,
        submitResult.createdBy,
      ].filter(Boolean) as string[],
    });
  }

  return reloadPoView(id, ctx);
}

export async function approvePurchaseOrder(id: string, ctx: ServiceContext): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canApprovePurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para aprobar órdenes de compra");
  }

  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { purchaseRequest: { select: { requestedByUserId: true } } },
  });
  if (!existing || existing.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  }
  if (existing.status !== "SUBMITTED") {
    throw new ServiceError("CONFLICT", "La orden no está pendiente de aprobación");
  }

  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, ctx);

  await prisma.$transaction(async (tx) => {
    const { requiresExtraApproval } = await applyVarianceSnapshots(
      tx,
      id,
      ctx.tenantId,
      settings,
    );
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    const highLevel =
      poRequiresHighLevelApproval(po.totalAmountArs, settings) || requiresExtraApproval;

    if (highLevel) {
      assertHighLevelApprover(ctx.roles, true, requiresExtraApproval);
    } else {
      assertStandardApprover(ctx.roles);
    }

    const originId = resolveOriginUserId({
      ...existing,
      purchaseRequest: existing.purchaseRequest,
    });
    assertSelfApprovalAllowed(settings, originId, ctx.actorUserId, requiresExtraApproval, highLevel);

    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedByUserId: ctx.actorUserId,
        approvedAt: new Date(),
        updatedBy: ctx.actorUserId,
      },
    });

    await auditProcurement(
      ctx,
      "purchase_order.approved",
      "PurchaseOrder",
      id,
      { projectId: po.projectId, companyId: po.companyId },
      { tx },
    );
  });

  const originId = resolveOriginUserId({
    ...existing,
    purchaseRequest: existing.purchaseRequest,
  });
  await notifyPurchaseOrderApproved({
    ctx,
    purchaseOrderId: id,
    projectId: existing.projectId,
    companyId: existing.companyId,
    code: `OC-${String(existing.number).padStart(3, "0")}`,
    recipientUserIds: [originId, existing.createdBy].filter(Boolean) as string[],
  });

  return reloadPoView(id, ctx);
}

export async function returnPurchaseOrder(
  id: string,
  reason: string,
  ctx: ServiceContext,
): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canApprovePurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para devolver órdenes de compra");
  }

  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new ServiceError("VALIDATION", "Indicá el motivo de la devolución");
  }

  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      purchaseRequest: { select: { requestedByUserId: true } },
      lines: { select: { varianceTier: true } },
    },
  });
  if (!existing || existing.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  }
  if (existing.status !== "SUBMITTED") {
    throw new ServiceError("CONFLICT", "Solo se pueden devolver órdenes pendientes de aprobación");
  }

  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, ctx);
  // Use snapshots from submit — do not re-run variance writes on return.
  const requiresExtraApproval = existing.lines.some((l) => l.varianceTier === "EXTRA_APPROVAL");
  const highLevel =
    poRequiresHighLevelApproval(existing.totalAmountArs, settings) || requiresExtraApproval;
  if (highLevel) {
    assertHighLevelApprover(ctx.roles, true, requiresExtraApproval);
  } else {
    assertStandardApprover(ctx.roles);
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "DRAFT",
        returnReason: trimmed,
        returnedAt: new Date(),
        returnedByUserId: ctx.actorUserId,
        approvedByUserId: null,
        approvedAt: null,
        updatedBy: ctx.actorUserId,
      },
    });

    await auditProcurement(
      ctx,
      "purchase_order.returned_for_changes",
      "PurchaseOrder",
      id,
      { projectId: existing.projectId, companyId: existing.companyId },
      { after: { returnReason: trimmed }, tx },
    );
  });

  const originId = resolveOriginUserId({
    ...existing,
    purchaseRequest: existing.purchaseRequest,
  });
  await notifyPurchaseOrderReturned({
    ctx,
    purchaseOrderId: id,
    projectId: existing.projectId,
    companyId: existing.companyId,
    code: `OC-${String(existing.number).padStart(3, "0")}`,
    reason: trimmed,
    recipientUserIds: [originId, existing.createdBy].filter(Boolean) as string[],
  });

  return reloadPoView(id, ctx);
}

export async function confirmPurchaseOrder(
  id: string,
  ctx: ServiceContext,
  options?: { fxRate?: string },
): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para confirmar órdenes al proveedor");
  }

  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  }
  if (existing.status !== "APPROVED") {
    throw new ServiceError("CONFLICT", "La orden debe estar aprobada antes de confirmar al proveedor");
  }
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);

  await prisma.$transaction(async (tx) => {
    await recalcPurchaseOrderTotals(tx, id);
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    const fx = computeDocumentFxAmounts(
      po.currency,
      po.totalAmount,
      options?.fxRate ? new Prisma.Decimal(options.fxRate) : po.fxRate,
    );

    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        fxRate: fx.fxRate,
        totalAmountArs: fx.amountArs,
        confirmedByUserId: ctx.actorUserId,
        confirmedAt: new Date(),
        updatedBy: ctx.actorUserId,
      },
    });

    await onPurchaseOrderConfirmed(id, ctx, tx);

    await auditProcurement(
      ctx,
      "purchase_order.confirmed",
      "PurchaseOrder",
      id,
      { projectId: po.projectId, companyId: po.companyId },
      { after: { totalAmountArs: fx.amountArs.toString() }, tx },
    );
  });

  const withOrigin = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { purchaseRequest: { select: { requestedByUserId: true } } },
  });
  if (withOrigin) {
    const originId = resolveOriginUserId(withOrigin);
    await notifyPurchaseOrderConfirmed({
      ctx,
      purchaseOrderId: id,
      projectId: withOrigin.projectId,
      companyId: withOrigin.companyId,
      code: `OC-${String(withOrigin.number).padStart(3, "0")}`,
      recipientUserIds: [originId, withOrigin.createdBy].filter(Boolean) as string[],
    });
  }

  return reloadPoView(id, ctx);
}
