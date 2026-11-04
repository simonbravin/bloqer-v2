import { Prisma, prisma, PurchaseOrderStatus } from "@bloqer/database";
import { auditProcurement } from "./procurement-audit";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { isCrossCompany } from "../company-scope";
import { requireProjectAccessIfPresent } from "../security/access";
import { assertContactRoleInTenant } from "../contact/assert-contact-role";
import { assertPurchaseOrderRelations, assertWbsLineForProject, assertCostAnalysisLineForWbs, procurementOrderLineScopeInclude, procurementOrderParentScopeInclude } from "./procurement-wbs";
import { recalcPurchaseOrderTotals } from "./purchase-order-calc.service";
import {
  canApprovePurchaseOrders,
  canEditPurchaseOrders,
} from "./procurement-access";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { serializeFxRateDecimal, serializeMoneyDecimal, serializeRatePctDecimal, serializeUnitPriceDecimal } from "../finance/money-decimal";
import { assertProjectAllowsOperationalMutation, lockProjectForOperationalMutation } from "../project/project-operational-guard";
import {
  getCompanyProcurementSettingsForProject,
  type CompanyProcurementSettingsView,
} from "./company-procurement-settings.service";
import {
  assertDirectPoAllowed,
  assertHighLevelApprover,
  assertSelfApprovalAllowed,
  assertStandardApprover,
  isSelfApprovalAllowed,
  isStandardApprover,
} from "./procurement-policy.service";
import {
  evaluateLineVariance,
  formatMissingVarianceJustificationError,
  isComparablePurchaseBaseline,
  poRequiresHighLevelApproval,
  varianceJustificationReasonEs,
} from "./purchase-variance.service";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import {
  assertPoLinesWithinSelectedQuote,
  onPurchaseOrderConfirmed,
} from "./purchase-request-to-po.service";
import {
  notifyPurchaseOrderApproved,
  notifyPurchaseOrderConfirmed,
  notifyPurchaseOrderPendingApproval,
  notifyPurchaseOrderReturned,
} from "./procurement-notifications.service";
import {
  budgetBaselineForPurchaseLine,
  getWbsBudgetReference,
} from "./procurement-budget-baseline";
import type { PurchaseOrderView } from "./purchase-order.service";

async function reloadPoView(id: string, ctx: ServiceContext): Promise<PurchaseOrderView> {
  const { getPurchaseOrderById } = await import("./purchase-order.service");
  return getPurchaseOrderById(id, ctx);
}

const poInclude = {
  ...procurementOrderParentScopeInclude,
  supplierContact: { select: { legalName: true, fantasyName: true, tenantId: true } },
  purchaseRequest: { select: { requestedByUserId: true, tenantId: true, companyId: true, projectId: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: procurementOrderLineScopeInclude,
  },
};

async function loadPo(id: string, ctx: ServiceContext, db: typeof prisma | Prisma.TransactionClient = prisma) {
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: poInclude });
  if (!po || po.tenantId !== ctx.tenantId || isCrossCompany(po.companyId, ctx)) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (db === prisma) await requireProjectAccessIfPresent(po.projectId, ctx);
  assertPurchaseOrderRelations(po);
  return po;
}

async function recheckPoForMutation(tx: Prisma.TransactionClient, before: Awaited<ReturnType<typeof loadPo>>, ctx: ServiceContext) {
  const current = await loadPo(before.id, ctx, tx);
  if (current.status !== before.status || current.updatedAt.getTime() !== before.updatedAt.getTime()) {
    throw new ServiceError("CONFLICT", "La orden cambió durante la operación. Recargá e intentá de nuevo.");
  }
  const documentCtx = { ...ctx, companyId: current.companyId };
  for (const line of current.lines) {
    if (!line.wbsNodeId) throw new ServiceError("CONFLICT", "Todas las líneas deben tener EDT antes de operar la orden");
    await assertWbsLineForProject(line.wbsNodeId, current.projectId, ctx.tenantId, { ctx: documentCtx, db: tx });
    if (line.costAnalysisLineId) await assertCostAnalysisLineForWbs(line.costAnalysisLineId, line.wbsNodeId, ctx.tenantId, { ctx: documentCtx, db: tx });
  }
  return current;
}

async function applyVarianceSnapshots(
  tx: Prisma.TransactionClient,
  purchaseOrderId: string,
  tenantId: string,
  settings: Awaited<ReturnType<typeof getCompanyProcurementSettingsForProject>>,
  ctx: ServiceContext,
  purchaseCurrency: string,
): Promise<{
  requiresExtraApproval: boolean;
  requiresJustification: boolean;
  missingJustification: string[];
  saldoWarnings: string[];
}> {
  const lines = await tx.purchaseOrderLine.findMany({
    where: { purchaseOrderId },
    include: { wbsNode: { select: { id: true, code: true } } },
  });

  let requiresExtraApproval = false;
  let requiresJustification = false;
  const missingJustification: string[] = [];
  const saldoWarnings: string[] = [];

  const pendingByWbs = new Map<string, Prisma.Decimal>();
  for (const line of lines) {
    if (!line.wbsNodeId) continue;
    const prev = pendingByWbs.get(line.wbsNodeId) ?? new Prisma.Decimal(0);
    pendingByWbs.set(line.wbsNodeId, prev.plus(line.lineSubtotal));
  }

  for (const line of lines) {
    if (!line.wbsNodeId) {
      throw new ServiceError(
        "CONFLICT",
        "Todas las líneas deben tener EDT antes de enviar la orden",
      );
    }

    const baseline = await budgetBaselineForPurchaseLine(
      line.wbsNodeId,
      {
        productId: line.productId,
        description: line.description,
        unit: line.unit,
        costAnalysisLineId: line.costAnalysisLineId,
      },
      tx,
    );
    const comparable = isComparablePurchaseBaseline(line.unit, baseline.unit);
    // Never reuse a stored lump-sum snapshot as $/u (e.g. partida `gl` total).
    const budgetUnitCost = comparable && Boolean(baseline.currency) && baseline.currency === purchaseCurrency ? baseline.unitCost : null;

    const result = evaluateLineVariance(
      {
        budgetCurrency: baseline.currency,
        purchaseCurrency,
        unit: line.unit,
        unitPrice: serializeUnitPriceDecimal(line.unitPrice),
        discountPct: serializeRatePctDecimal(line.discountPct),
        budgetUnitCost: budgetUnitCost != null ? serializeUnitPriceDecimal(budgetUnitCost) : null,
        budgetUnit: baseline.unit,
        varianceJustification: line.varianceJustification,
      },
      settings,
    );
    if (result.requiresExtraApproval) requiresExtraApproval = true;
    if (result.requiresJustification && !line.varianceJustification?.trim()) {
      requiresJustification = true;
      missingJustification.push(
        `${line.description} (${varianceJustificationReasonEs(result.varianceTier)})`,
      );
    }
    await tx.purchaseOrderLine.update({
      where: { id: line.id },
      data: {
        budgetUnitCostSnapshot: budgetUnitCost,
        variancePct: result.variancePct ? new Prisma.Decimal(result.variancePct) : null,
        varianceTier: result.varianceTier,
        varianceUnitMismatch: result.varianceUnitMismatch,
      },
    });
  }

  for (const [wbsNodeId, pendingSubtotal] of pendingByWbs) {
    const ref = await getWbsBudgetReference(wbsNodeId, tenantId, {
      excludePurchaseOrderId: purchaseOrderId,
      pendingLineSubtotal: serializeMoneyDecimal(pendingSubtotal),
      pendingCurrency: purchaseCurrency,
      db: tx,
      ctx,
    });
    if (ref.currencyWarning) saldoWarnings.push(ref.currencyWarning);
    if (ref.wouldExceedBudget) {
      saldoWarnings.push(
        `${ref.code}: el compromiso proyectado supera el presupuestado de materiales`,
      );
    }
  }

  return { requiresExtraApproval, requiresJustification, missingJustification, saldoWarnings };
}

function resolveOriginUserId(po: {
  originRequestedByUserId: string | null;
  purchaseRequestId: string | null;
  purchaseRequest: { requestedByUserId: string | null } | null;
}): string | null {
  return po.originRequestedByUserId ?? po.purchaseRequest?.requestedByUserId ?? null;
}

/**
 * [D-105]/[D-106] Pure UI/service gate for one-step Autorizar y comprometer.
 * Non-high-level: EDIT OC. High-level (threshold or EXTRA_APPROVAL): OWNER/ADMIN only.
 * Self-approval [BR-APR-004] still applies.
 *
 * Prefer live document totals (`totalAmount` + FX) over stored `totalAmountArs`:
 * DRAFT line edits update `totalAmount` via recalc but do not refresh `totalAmountArs`.
 */
export function canAuthorizeAndCommitPo(
  settings: Pick<
    CompanyProcurementSettingsView,
    "allowAuthorizeAndCommit" | "allowSelfApproval" | "poApprovalThresholdArs"
  >,
  po: {
    status: PurchaseOrderStatus | string;
    /** Preferred: document total in document currency (kept current on DRAFT edits). */
    totalAmount?: Prisma.Decimal | string | null;
    currency?: string | null;
    fxRate?: Prisma.Decimal | string | null;
    /** Fallback when live totals are unavailable (e.g. unit tests). */
    totalAmountArs?: Prisma.Decimal | string | null;
    originRequestedByUserId?: string | null;
    /** Fallback when originRequestedByUserId is null (same as service resolveOriginUserId). */
    purchaseRequestRequestedByUserId?: string | null;
    lines?: Array<{ varianceTier?: string | null }>;
  },
  ctx: Pick<ServiceContext, "roles" | "actorUserId">,
): boolean {
  if (!settings.allowAuthorizeAndCommit) return false;
  if (po.status !== "DRAFT" && po.status !== "SUBMITTED") return false;

  const totalArs = resolveAuthorizeAndCommitTotalArs(po);
  if (totalArs == null) return false;

  const requiresExtraApproval = (po.lines ?? []).some((l) => l.varianceTier === "EXTRA_APPROVAL");
  const requiresHighLevelAmount = poRequiresHighLevelApproval(totalArs, settings);
  const highLevel = requiresHighLevelAmount || requiresExtraApproval;

  if (highLevel) {
    // [D-106] Admin-only shortcut for high-level POs.
    if (!ctx.roles.some((r) => r === "OWNER" || r === "ADMIN")) return false;
  } else if (!canEditPurchaseOrders(ctx.roles)) {
    return false;
  }

  const originId = po.originRequestedByUserId ?? po.purchaseRequestRequestedByUserId ?? null;
  return isSelfApprovalAllowed(
    settings,
    originId,
    ctx.actorUserId,
    requiresExtraApproval,
    requiresHighLevelAmount,
  );
}

/**
 * [D-107] Whether approving this PO would auto-confirm under company policy (UI copy).
 * High-level POs never auto-confirm.
 */
export function willApproveAutoConfirmPo(
  settings: Pick<
    CompanyProcurementSettingsView,
    "autoConfirmOnApprove" | "poApprovalThresholdArs"
  >,
  po: {
    totalAmount?: Prisma.Decimal | string | null;
    currency?: string | null;
    fxRate?: Prisma.Decimal | string | null;
    totalAmountArs?: Prisma.Decimal | string | null;
    lines?: Array<{ varianceTier?: string | null }>;
  },
): boolean {
  if (!settings.autoConfirmOnApprove) return false;
  const totalArs = resolveAuthorizeAndCommitTotalArs(po);
  if (totalArs == null) return false;
  const requiresExtraApproval = (po.lines ?? []).some((l) => l.varianceTier === "EXTRA_APPROVAL");
  const requiresHighLevelAmount = poRequiresHighLevelApproval(totalArs, settings);
  return !(requiresHighLevelAmount || requiresExtraApproval);
}

/** UI eligibility derived in services from the same policy as approve/return. */
export function getPurchaseOrderApprovalAvailability(
  settings: Pick<CompanyProcurementSettingsView, "allowSelfApproval" | "poApprovalThresholdArs">,
  po: Parameters<typeof canAuthorizeAndCommitPo>[1],
  ctx: Pick<ServiceContext, "roles" | "actorUserId">,
): { canApprove: boolean; canReturn: boolean; approvalBlockedReason: string | null } {
  if (po.status !== "SUBMITTED") return { canApprove: false, canReturn: false, approvalBlockedReason: null };
  if (!canApprovePurchaseOrders(ctx.roles)) return { canApprove: false, canReturn: false, approvalBlockedReason: "Tu rol no permite aprobar ni devolver esta orden" };
  const totalArs = resolveAuthorizeAndCommitTotalArs(po);
  if (totalArs == null) return { canApprove: false, canReturn: false, approvalBlockedReason: "Falta un tipo de cambio válido para evaluar la aprobación" };
  const extra = (po.lines ?? []).some((line) => line.varianceTier === "EXTRA_APPROVAL");
  const highAmount = poRequiresHighLevelApproval(totalArs, settings);
  try {
    if (highAmount || extra) assertHighLevelApprover(ctx.roles, highAmount, extra);
    else assertStandardApprover(ctx.roles);
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return { canApprove: false, canReturn: false, approvalBlockedReason: error.message };
  }
  const originId = po.originRequestedByUserId ?? po.purchaseRequestRequestedByUserId ?? null;
  const canApprove = isSelfApprovalAllowed(settings, originId, ctx.actorUserId, extra, highAmount);
  return { canApprove, canReturn: true, approvalBlockedReason: canApprove ? null : "Quien solicitó esta compra no puede aprobarla con la política actual; debe hacerlo otro aprobador autorizado" };
}

function resolveAuthorizeAndCommitTotalArs(po: {
  totalAmount?: Prisma.Decimal | string | null;
  currency?: string | null;
  fxRate?: Prisma.Decimal | string | null;
  totalAmountArs?: Prisma.Decimal | string | null;
}): Prisma.Decimal | null {
  if (po.totalAmount != null && po.currency) {
    try {
      const amount =
        po.totalAmount instanceof Prisma.Decimal
          ? po.totalAmount
          : new Prisma.Decimal(po.totalAmount);
      const rate =
        po.fxRate == null
          ? null
          : po.fxRate instanceof Prisma.Decimal
            ? po.fxRate
            : new Prisma.Decimal(po.fxRate);
      return computeDocumentFxAmounts(po.currency, amount, rate).amountArs;
    } catch {
      // Missing FX for foreign currency → not eligible for the shortcut in UI.
      return null;
    }
  }
  if (po.totalAmountArs == null) return null;
  return po.totalAmountArs instanceof Prisma.Decimal
    ? po.totalAmountArs
    : new Prisma.Decimal(po.totalAmountArs);
}

/**
 * [D-105] Authorize + commit in one transaction (persists APPROVED then CONFIRMED).
 * Notifies only PURCHASE_ORDER_CONFIRMED — never the “pending confirm” APPROVED bell.
 */
export async function authorizeAndCommitPurchaseOrder(
  id: string,
  ctx: ServiceContext,
): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);

  const existing = await loadPo(id, ctx);
  if (existing.status !== "DRAFT" && existing.status !== "SUBMITTED") {
    throw new ServiceError(
      "CONFLICT",
      "Solo se puede autorizar y comprometer una orden en borrador o pendiente de aprobación",
    );
  }
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);

  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, { ...ctx, companyId: existing.companyId });
  if (!settings.allowAuthorizeAndCommit) {
    throw new ServiceError(
      "CONFLICT",
      "La política de autorizar y comprometer no está habilitada para esta empresa",
    );
  }

  const lineCount = await prisma.purchaseOrderLine.count({ where: { purchaseOrderId: id } });
  if (lineCount === 0) throw new ServiceError("CONFLICT", "La orden debe tener al menos una línea");

  const fromStatus = existing.status;

  const result = await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    const checkedOrder = await recheckPoForMutation(tx, existing, ctx);
    await assertContactRoleInTenant(checkedOrder.supplierContactId, "SUPPLIER", ctx.tenantId, { tx });
    await recalcPurchaseOrderTotals(tx, id);
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (po.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El monto total debe ser mayor a cero");
    }

    const fx = computeDocumentFxAmounts(po.currency, po.totalAmount, po.fxRate);
    const totalArs = fx.amountArs;

    if (!po.purchaseRequestId) {
      assertDirectPoAllowed(settings, totalArs, ctx, {
        emergencyReason: po.emergencyReason,
      });
    }

    const currentLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: id },
      select: {
        description: true,
        wbsNodeId: true,
        quantity: true,
        unitPrice: true,
        discountPct: true,
        sortOrder: true,
        purchaseRequestLineId: true,
      },
    });
    await assertPoLinesWithinSelectedQuote(id, currentLines, ctx.tenantId, tx);

    const { requiresExtraApproval, requiresJustification, missingJustification } =
      await applyVarianceSnapshots(tx, id, ctx.tenantId, settings, { ...ctx, companyId: existing.companyId }, existing.currency);
    if (requiresJustification) {
      throw new ServiceError(
        "CONFLICT",
        formatMissingVarianceJustificationError(missingJustification),
      );
    }

    const requiresHighLevelAmount = poRequiresHighLevelApproval(totalArs, settings);
    const highLevel = requiresHighLevelAmount || requiresExtraApproval;

    // [D-105] EDIT for low-level; [D-106] OWNER/ADMIN for high-level.
    if (highLevel) {
      assertHighLevelApprover(ctx.roles, requiresHighLevelAmount, requiresExtraApproval);
    } else if (!canEditPurchaseOrders(ctx.roles)) {
      throw new ServiceError(
        "FORBIDDEN",
        "Sin permisos para autorizar y comprometer órdenes de compra",
      );
    }

    const originId = resolveOriginUserId(existing);
    assertSelfApprovalAllowed(
      settings,
      originId,
      ctx.actorUserId,
      requiresExtraApproval,
      requiresHighLevelAmount,
    );

    const now = new Date();
    const flipped = await tx.purchaseOrder.updateMany({
      where: { id, tenantId: ctx.tenantId, status: fromStatus },
      data: {
        status: "CONFIRMED",
        fxRate: fx.fxRate,
        totalAmountArs: totalArs,
        approvedByUserId: ctx.actorUserId,
        approvedAt: now,
        confirmedByUserId: ctx.actorUserId,
        confirmedAt: now,
        returnReason: null,
        returnedAt: null,
        returnedByUserId: null,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La orden cambió de estado. Recargá e intentá de nuevo.",
    );

    await onPurchaseOrderConfirmed(id, ctx, tx);

    if (fromStatus === "DRAFT") {
      await auditProcurement(
        ctx,
        "purchase_order.submitted",
        "PurchaseOrder",
        id,
        { projectId: po.projectId, companyId: po.companyId },
        { after: { status: "CONFIRMED", authorizeAndCommit: true }, tx },
      );
    }
    await auditProcurement(
      ctx,
      "purchase_order.approved",
      "PurchaseOrder",
      id,
      { projectId: po.projectId, companyId: po.companyId },
      { after: { authorizeAndCommit: true }, tx },
    );
    await auditProcurement(
      ctx,
      "purchase_order.confirmed",
      "PurchaseOrder",
      id,
      { projectId: po.projectId, companyId: po.companyId },
      {
        after: {
          authorizeAndCommit: true,
          totalAmountArs: serializeMoneyDecimal(totalArs),
        },
        tx,
      },
    );

    return {
      projectId: po.projectId,
      companyId: po.companyId,
      number: po.number,
      originRequestedByUserId: originId,
      createdBy: po.createdBy,
    };
  }, { maxWait: 10_000, timeout: 30_000 });

  // [D-105]/[D-106] Never send PURCHASE_ORDER_APPROVED (“pendiente confirmar”) on this shortcut.
  await notifyPurchaseOrderConfirmed({
    ctx,
    purchaseOrderId: id,
    projectId: result.projectId,
    companyId: result.companyId,
    code: `OC-${String(result.number).padStart(3, "0")}`,
    recipientUserIds: [result.originRequestedByUserId, result.createdBy].filter(
      Boolean,
    ) as string[],
  });

  return reloadPoView(id, ctx);
}

export async function submitPurchaseOrder(id: string, ctx: ServiceContext): Promise<PurchaseOrderView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para enviar órdenes de compra");
  }

  const existing = await loadPo(id, ctx);
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se pueden enviar órdenes en borrador");
  }
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);

  const lineCount = await prisma.purchaseOrderLine.count({ where: { purchaseOrderId: id } });
  if (lineCount === 0) throw new ServiceError("CONFLICT", "La orden debe tener al menos una línea");

  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, { ...ctx, companyId: existing.companyId });

  const submitResult = await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    const checkedOrder = await recheckPoForMutation(tx, existing, ctx);
    await assertContactRoleInTenant(checkedOrder.supplierContactId, "SUPPLIER", ctx.tenantId, { tx });
    await recalcPurchaseOrderTotals(tx, id);
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (po.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El monto total debe ser mayor a cero");
    }

    const fx = computeDocumentFxAmounts(po.currency, po.totalAmount, po.fxRate);
    const totalArs = fx.amountArs;

    // Re-gate direct PO on submit ([BR-PUR-008]) — create alone is not enough if lines were edited.
    if (!po.purchaseRequestId) {
      assertDirectPoAllowed(settings, totalArs, ctx, {
        emergencyReason: po.emergencyReason,
      });
    }

    // Quote-sourced OC: cannot inflate past selected competitive quote.
    const currentLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: id },
      select: {
        description: true,
        wbsNodeId: true,
        quantity: true,
        unitPrice: true,
        discountPct: true,
        sortOrder: true,
        purchaseRequestLineId: true,
      },
    });
    await assertPoLinesWithinSelectedQuote(id, currentLines, ctx.tenantId, tx);

    const { requiresExtraApproval, requiresJustification, missingJustification, saldoWarnings } =
      await applyVarianceSnapshots(tx, id, ctx.tenantId, settings, { ...ctx, companyId: existing.companyId }, existing.currency);
    if (requiresJustification) {
      throw new ServiceError("CONFLICT", formatMissingVarianceJustificationError(missingJustification));
    }

    const highLevel = poRequiresHighLevelApproval(totalArs, settings) || requiresExtraApproval;

    let nextStatus: PurchaseOrderStatus = "SUBMITTED";
    let approvedBy: string | null = null;
    let approvedAt: Date | null = null;
    let confirmedBy: string | null = null;
    let confirmedAt: Date | null = null;

    // Auto-approve only when actor may approve; otherwise leave SUBMITTED (do not throw).
    // [D-107] When autoConfirmOnApprove is ON, Enviar can land on CONFIRMED (same as approve).
    if (!highLevel && isStandardApprover(ctx.roles)) {
      const originId = resolveOriginUserId(existing);
      if (
        isSelfApprovalAllowed(settings, originId, ctx.actorUserId, false, false)
      ) {
        const now = new Date();
        approvedBy = ctx.actorUserId ?? null;
        approvedAt = now;
        if (settings.autoConfirmOnApprove) {
          nextStatus = "CONFIRMED";
          confirmedBy = ctx.actorUserId ?? null;
          confirmedAt = now;
        } else {
          nextStatus = "APPROVED";
        }
      }
    }

    const flipped = await tx.purchaseOrder.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: {
        status: nextStatus,
        fxRate: fx.fxRate,
        totalAmountArs: totalArs,
        approvedByUserId: approvedBy,
        approvedAt,
        confirmedByUserId: confirmedBy,
        confirmedAt,
        returnReason: null,
        returnedAt: null,
        returnedByUserId: null,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La orden ya no está en borrador. Recargá e intentá de nuevo.",
    );

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
    if (nextStatus === "APPROVED" || nextStatus === "CONFIRMED") {
      await auditProcurement(
        ctx,
        "purchase_order.approved",
        "PurchaseOrder",
        id,
        { projectId: po.projectId, companyId: po.companyId },
        {
          after: {
            autoApproved: true,
            ...(nextStatus === "CONFIRMED" ? { autoConfirmOnApprove: true } : {}),
          },
          tx,
        },
      );
    }
    if (nextStatus === "CONFIRMED") {
      await onPurchaseOrderConfirmed(id, ctx, tx);
      await auditProcurement(
        ctx,
        "purchase_order.confirmed",
        "PurchaseOrder",
        id,
        { projectId: po.projectId, companyId: po.companyId },
        {
          after: {
            autoConfirmOnApprove: true,
            totalAmountArs: serializeMoneyDecimal(totalArs),
          },
          tx,
        },
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
  }, { maxWait: 10_000, timeout: 30_000 });

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
  } else if (submitResult.nextStatus === "CONFIRMED") {
    await notifyPurchaseOrderConfirmed({
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

  const existing = await loadPo(id, ctx);
  if (!existing || existing.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  }
  if (existing.status !== "SUBMITTED") {
    throw new ServiceError("CONFLICT", "La orden no está pendiente de aprobación");
  }
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);

  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, { ...ctx, companyId: existing.companyId });

  const outcome = await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    const checkedOrder = await recheckPoForMutation(tx, existing, ctx);
    await assertContactRoleInTenant(checkedOrder.supplierContactId, "SUPPLIER", ctx.tenantId, { tx });
    await recalcPurchaseOrderTotals(tx, id);
    const poBefore = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    const fx = computeDocumentFxAmounts(poBefore.currency, poBefore.totalAmount, poBefore.fxRate);

    const { requiresExtraApproval, requiresJustification, missingJustification } = await applyVarianceSnapshots(
      tx,
      id,
      ctx.tenantId,
      settings,
      { ...ctx, companyId: existing.companyId },
      existing.currency,
    );
    if (requiresJustification) {
      throw new ServiceError("CONFLICT", formatMissingVarianceJustificationError(missingJustification));
    }
    const requiresHighLevelAmount = poRequiresHighLevelApproval(fx.amountArs, settings);
    const highLevel = requiresHighLevelAmount || requiresExtraApproval;

    if (highLevel) {
      assertHighLevelApprover(ctx.roles, true, requiresExtraApproval);
    } else {
      assertStandardApprover(ctx.roles);
    }

    const originId = resolveOriginUserId({
      ...existing,
      purchaseRequest: existing.purchaseRequest,
    });
    assertSelfApprovalAllowed(
      settings,
      originId,
      ctx.actorUserId,
      requiresExtraApproval,
      requiresHighLevelAmount,
    );

    // [D-107] Non-high-level + policy → SUBMITTED→CONFIRMED in one act.
    const autoConfirm = settings.autoConfirmOnApprove && !highLevel;
    const now = new Date();
    const approved = await tx.purchaseOrder.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "SUBMITTED" },
      data: autoConfirm
        ? {
            status: "CONFIRMED",
            fxRate: fx.fxRate,
            totalAmountArs: fx.amountArs,
            approvedByUserId: ctx.actorUserId,
            approvedAt: now,
            confirmedByUserId: ctx.actorUserId,
            confirmedAt: now,
            updatedBy: ctx.actorUserId,
          }
        : {
            status: "APPROVED",
            fxRate: fx.fxRate,
            totalAmountArs: fx.amountArs,
            approvedByUserId: ctx.actorUserId,
            approvedAt: now,
            updatedBy: ctx.actorUserId,
          },
    });
    if (approved.count !== 1) {
      throw new ServiceError("CONFLICT", "La orden ya no está pendiente de aprobación");
    }

    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });

    await auditProcurement(
      ctx,
      "purchase_order.approved",
      "PurchaseOrder",
      id,
      { projectId: po.projectId, companyId: po.companyId },
      { after: autoConfirm ? { autoConfirmOnApprove: true } : undefined, tx },
    );

    if (autoConfirm) {
      await onPurchaseOrderConfirmed(id, ctx, tx);
      await auditProcurement(
        ctx,
        "purchase_order.confirmed",
        "PurchaseOrder",
        id,
        { projectId: po.projectId, companyId: po.companyId },
        {
          after: {
            autoConfirmOnApprove: true,
            totalAmountArs: serializeMoneyDecimal(fx.amountArs),
          },
          tx,
        },
      );
    }

    return { autoConfirm, originId };
  }, { maxWait: 10_000, timeout: 30_000 });

  const code = `OC-${String(existing.number).padStart(3, "0")}`;
  const recipientUserIds = [outcome.originId, existing.createdBy].filter(Boolean) as string[];

  if (outcome.autoConfirm) {
    // Same as D-105: never send “pendiente confirmar”.
    await notifyPurchaseOrderConfirmed({
      ctx,
      purchaseOrderId: id,
      projectId: existing.projectId,
      companyId: existing.companyId,
      code,
      recipientUserIds,
    });
  } else {
    await notifyPurchaseOrderApproved({
      ctx,
      purchaseOrderId: id,
      projectId: existing.projectId,
      companyId: existing.companyId,
      code,
      recipientUserIds,
    });
  }

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

  const existing = await loadPo(id, ctx);
  if (!existing || existing.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  }
  if (existing.status !== "SUBMITTED") {
    throw new ServiceError("CONFLICT", "Solo se pueden devolver órdenes pendientes de aprobación");
  }

  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, { ...ctx, companyId: existing.companyId });
  // Use snapshots from submit — do not re-run variance writes on return.
  const requiresExtraApproval = existing.lines.some((l) => l.varianceTier === "EXTRA_APPROVAL");
  const highLevel =
    poRequiresHighLevelApproval(computeDocumentFxAmounts(existing.currency, existing.totalAmount, existing.fxRate).amountArs, settings) || requiresExtraApproval;
  if (highLevel) {
    assertHighLevelApprover(ctx.roles, true, requiresExtraApproval);
  } else {
    assertStandardApprover(ctx.roles);
  }

  await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    await recheckPoForMutation(tx, existing, ctx);
    const returned = await tx.purchaseOrder.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "SUBMITTED" },
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
    if (returned.count !== 1) {
      throw new ServiceError("CONFLICT", "La orden ya no está pendiente de aprobación");
    }

    await auditProcurement(
      ctx,
      "purchase_order.returned_for_changes",
      "PurchaseOrder",
      id,
      { projectId: existing.projectId, companyId: existing.companyId },
      { after: { returnReason: trimmed }, tx },
    );
  }, { maxWait: 10_000, timeout: 30_000 });

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

  const existing = await loadPo(id, ctx);
  if (!existing || existing.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  }
  if (existing.status !== "APPROVED") {
    throw new ServiceError("CONFLICT", "La orden debe estar aprobada antes de confirmar al proveedor");
  }
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);

  // Load policy outside the interactive transaction (avoids extra pool hop while holding locks).
  const settings = await getCompanyProcurementSettingsForProject(existing.projectId, { ...ctx, companyId: existing.companyId });

  await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    const checkedOrder = await recheckPoForMutation(tx, existing, ctx);
    await assertContactRoleInTenant(checkedOrder.supplierContactId, "SUPPLIER", ctx.tenantId, { tx });
    await recalcPurchaseOrderTotals(tx, id);
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (po.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El monto total debe ser mayor a cero");
    }
    const fx = computeDocumentFxAmounts(
      po.currency,
      po.totalAmount,
      options?.fxRate ? new Prisma.Decimal(options.fxRate) : po.fxRate,
    );

    // Defense in depth ([BR-PUR-008]): block confirm of direct OC over threshold without emergency.
    if (!po.purchaseRequestId) {
      assertDirectPoAllowed(settings, fx.amountArs, ctx, {
        emergencyReason: po.emergencyReason,
      });
    }

    // D-129: changing the approved FX is a new approval in this same transaction.
    // Equal numeric FX keeps the existing EDIT-only confirmation permission.
    if (!fx.fxRate.equals(po.fxRate)) {
      const variance = await applyVarianceSnapshots(tx, id, ctx.tenantId, settings, { ...ctx, companyId: po.companyId }, po.currency);
      if (variance.requiresJustification) {
        throw new ServiceError(
          "CONFLICT",
          `El cambio de tipo de cambio requiere revisar la justificación de: ${variance.missingJustification.slice(0, 4).join("; ")}. La orden sigue aprobada; un aprobador habilitado debe revisar el documento antes de confirmarlo.`,
        );
      }
      const highAmount = poRequiresHighLevelApproval(fx.amountArs, settings);
      try {
        if (highAmount || variance.requiresExtraApproval) assertHighLevelApprover(ctx.roles, highAmount, variance.requiresExtraApproval);
        else assertStandardApprover(ctx.roles);
        assertSelfApprovalAllowed(settings, resolveOriginUserId(checkedOrder), ctx.actorUserId, variance.requiresExtraApproval, highAmount);
      } catch (error) {
        if (!(error instanceof ServiceError) || error.code !== "FORBIDDEN") throw error;
        throw new ServiceError("FORBIDDEN", `El cambio de tipo de cambio requiere una nueva aprobación. Un aprobador habilitado debe revisar y confirmar la orden. ${error.message}`);
      }

      const approvedAt = new Date();
      const reapproved = await tx.purchaseOrder.updateMany({
        where: { id, tenantId: ctx.tenantId, status: "APPROVED" },
        data: { fxRate: fx.fxRate, totalAmountArs: fx.amountArs, approvedByUserId: ctx.actorUserId, approvedAt, updatedBy: ctx.actorUserId },
      });
      assertOptimisticRowUpdate(reapproved.count, "La orden ya no está aprobada para revisar el tipo de cambio");
      await auditProcurement(ctx, "purchase_order.approved", "PurchaseOrder", id, { projectId: po.projectId, companyId: po.companyId }, {
        before: { fxRate: serializeFxRateDecimal(po.fxRate), totalAmountArs: serializeMoneyDecimal(po.totalAmountArs), approvedByUserId: po.approvedByUserId, approvedAt: po.approvedAt?.toISOString() ?? null },
        after: { fxRate: serializeFxRateDecimal(fx.fxRate), totalAmountArs: serializeMoneyDecimal(fx.amountArs), approvedByUserId: ctx.actorUserId, approvedAt: approvedAt.toISOString(), reapprovedOnFxChange: true },
        tx,
      });
    }

    const confirmed = await tx.purchaseOrder.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "APPROVED" },
      data: {
        status: "CONFIRMED",
        fxRate: fx.fxRate,
        totalAmountArs: fx.amountArs,
        confirmedByUserId: ctx.actorUserId,
        confirmedAt: new Date(),
        updatedBy: ctx.actorUserId,
      },
    });
    if (confirmed.count !== 1) {
      throw new ServiceError("CONFLICT", "La orden ya no está aprobada para confirmar");
    }

    await onPurchaseOrderConfirmed(id, ctx, tx);

    await auditProcurement(
      ctx,
      "purchase_order.confirmed",
      "PurchaseOrder",
      id,
      { projectId: po.projectId, companyId: po.companyId },
      { after: { totalAmountArs: serializeMoneyDecimal(fx.amountArs) }, tx },
    );
  }, { maxWait: 10_000, timeout: 30_000 });

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
