import { Prisma, prisma, PurchaseOrder } from "@bloqer/database";
import type { CreatePurchaseOrderInput, UpdatePurchaseOrderInput } from "@bloqer/validators";
import { sortByWbsCode } from "../budget/wbs-code-rules";
import { auditProcurement } from "./procurement-audit";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import { calcLine, recalcPurchaseOrderTotals } from "./purchase-order-calc.service";
import { headerTotalsWithIibbPerception } from "../finance/document-header-tax";
import { DEFAULT_IIBB_PERCEPTION_RATE_PCT } from "@bloqer/domain";
import {
  canEditPurchaseOrders,
  canViewProcurementProjectArea,
} from "./procurement-access";
import { PO_INVOICE_LINKABLE_STATUSES } from "./procurement-constants";
import { assertProjectAllowsOperationalMutation, lockProjectForOperationalMutation } from "../project/project-operational-guard";
import { requireProjectAccess, requireProjectAccessIfPresent } from "../security/access";
import { assertCompanyMatchesProject, assertCostAnalysisLineForWbs, assertWbsLineForProject, assertPurchaseOrderRelations, procurementOrderLineScopeInclude, procurementOrderParentScopeInclude, lockProcurementCompanyForNumbering } from "./procurement-wbs";
import {
  computeDominantCostTypeFromApuLines,
  loadWbsDominantCostTypes,
  resolveLineCostType,
} from "../cost-control/cost-type";
import type { CostCategory } from "@bloqer/database";
import { assertContactRoleInTenant } from "../contact/assert-contact-role";
import { getCompanyProcurementSettingsForProject } from "./company-procurement-settings.service";
import { assertDirectPoAllowed } from "./procurement-policy.service";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { indexStoredDocumentLines, resolveInvoiceLineMoney, parseDiscountPct } from "../finance/invoice-line-money";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
  serializeFxRateDecimal,
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
  evaluateLineVarianceLenient,
  isComparablePurchaseBaseline,
  resolveBudgetRefKind,
  type BudgetRefKind,
} from "./purchase-variance.service";
import {
  resolveUserDisplayNames,
  userDisplayNameFromMap,
} from "../user/resolve-user-display-names";
import { loadMaterialApuCommitmentByLineId } from "../materials/material-commitment";
import { assertProductUnitCompatible, lockProductsForUnitReferences } from "../inventory/product-unit";

export {
  submitPurchaseOrder,
  approvePurchaseOrder,
  returnPurchaseOrder,
  confirmPurchaseOrder,
  authorizeAndCommitPurchaseOrder,
  canAuthorizeAndCommitPo,
  willApproveAutoConfirmPo,
} from "./purchase-order-workflow.service";

// ─── View types ───────────────────────────────────────────────────────────────

export type PurchaseOrderLineView = {
  id: string;
  purchaseOrderId: string;
  purchaseRequestLineId: string | null;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  productId: string | null;
  costAnalysisLineId: string | null;
  costType: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discountPct: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
  receivedQuantity: string;
  remainingQuantity: string;
  sortOrder: number;
  budgetUnitCostSnapshot: string | null;
  budgetCurrency: string | null;
  currencyComparable: boolean;
  budgetWarning: string | null;
  budgetUnit: string | null;
  budgetRefKind: BudgetRefKind;
  suggestedApu: { description: string; unit: string; unitCost: string } | null;
  varianceTier: string;
  variancePct: string | null;
  varianceJustification: string | null;
};

export type PurchaseOrderView = Omit<
  PurchaseOrder,
  | "subtotal"
  | "taxAmount"
  | "totalAmount"
  | "totalAmountArs"
  | "fxRate"
  | "iibbPerceptionRate"
  | "iibbPerceptionAmount"
> & {
  subtotal: string;
  taxAmount: string;
  iibbPerceptionRate: string;
  iibbPerceptionAmount: string;
  totalAmount: string;
  totalAmountArs: string;
  fxRate: string;
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
    costType: CostCategory | null;
    purchaseRequestLineId: string | null;
    description: string; unit: string;
    quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; taxRate: Prisma.Decimal;
    discountPct: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal; lineTax: Prisma.Decimal; lineTotal: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal; sortOrder: number;
    budgetUnitCostSnapshot: Prisma.Decimal | null;
    varianceTier: string;
    variancePct: Prisma.Decimal | null;
    varianceJustification: string | null;
    wbsNode: { code: string; name: string; budget: { currency: string } } | null;
  },
  purchaseCurrency: string,
): PurchaseOrderLineView {
  const remaining = l.quantity.minus(l.receivedQuantity);
  const budgetCurrency = l.wbsNode?.budget.currency ?? null;
  const currencyComparable = Boolean(budgetCurrency && purchaseCurrency && budgetCurrency === purchaseCurrency);
  const priced = l.unitPrice.mul(new Prisma.Decimal(1).minus(l.discountPct.div(100))).gt(0);
  return {
    id:                l.id,
    purchaseOrderId:   l.purchaseOrderId,
    purchaseRequestLineId: l.purchaseRequestLineId ?? null,
    wbsNodeId:         l.wbsNodeId,
    wbsNodeCode:       l.wbsNode?.code ?? null,
    wbsNodeName:       l.wbsNode?.name ?? null,
    productId:         l.productId,
    costAnalysisLineId: l.costAnalysisLineId,
    costType: l.costType ?? "MATERIAL",
    description:       l.description,
    unit:              l.unit,
    quantity:          serializeQtyDecimal(l.quantity),
    unitPrice:         serializeUnitPriceDecimal(l.unitPrice),
    taxRate:           serializeRatePctDecimal(l.taxRate),
    discountPct:       serializeRatePctDecimal(l.discountPct),
    lineSubtotal:      serializeMoneyDecimal(l.lineSubtotal),
    lineTax:           serializeMoneyDecimal(l.lineTax),
    lineTotal:         serializeMoneyDecimal(l.lineTotal),
    receivedQuantity:  serializeQtyDecimal(l.receivedQuantity),
    remainingQuantity: remaining.lessThan(0) ? serializeQtyDecimal(0) : serializeQtyDecimal(remaining),
    sortOrder:         l.sortOrder,
    budgetUnitCostSnapshot: currencyComparable && l.budgetUnitCostSnapshot != null ? serializeUnitPriceDecimal(l.budgetUnitCostSnapshot) : null,
    budgetCurrency,
    currencyComparable,
    budgetWarning: currencyComparable ? null : "La referencia presupuestaria y la compra no tienen una moneda comparable. No se calcula desvío ni se convierte el precio.",
    budgetUnit:        null,
    budgetRefKind:     l.budgetUnitCostSnapshot != null ? "UNIT_PRICE" : "NONE",
    suggestedApu:      null,
    varianceTier:      currencyComparable ? l.varianceTier : priced ? "NO_BUDGET_BASELINE" : "NONE",
    variancePct:       currencyComparable && l.variancePct != null ? serializeRatePctDecimal(l.variancePct) : null,
    varianceJustification: l.varianceJustification,
  };
}

function serializePO(
  po: PurchaseOrder & {
    supplierContact: { legalName: string; fantasyName: string | null };
    purchaseRequest?: { requestedByUserId: string | null } | null;
    selectedProcurementQuote?: unknown;
    lines: Array<Parameters<typeof serializeLine>[0]>;
  },
  names: {
    approvedByName: string | null;
    createdByName: string | null;
    originRequestedByName: string | null;
  } = { approvedByName: null, createdByName: null, originRequestedByName: null },
): PurchaseOrderView {
  const supplierName = po.supplierContact.fantasyName ?? po.supplierContact.legalName;
  const { supplierContact, lines, purchaseRequest, selectedProcurementQuote, ...header } = po;
  void supplierContact;
  void selectedProcurementQuote;
  return {
    ...header,
    originRequestedByUserId: po.originRequestedByUserId ?? purchaseRequest?.requestedByUserId ?? null,
    subtotal:    serializeMoneyDecimal(po.subtotal),
    taxAmount:   serializeMoneyDecimal(po.taxAmount),
    iibbPerceptionRate: serializeRatePctDecimal(po.iibbPerceptionRate),
    iibbPerceptionAmount: serializeMoneyDecimal(po.iibbPerceptionAmount),
    totalAmount: serializeMoneyDecimal(po.totalAmount),
    totalAmountArs: serializeMoneyDecimal(po.totalAmountArs),
    fxRate: serializeFxRateDecimal(po.fxRate),
    approvedByName: names.approvedByName,
    createdByName: names.createdByName,
    originRequestedByName: names.originRequestedByName,
    code:        `OC-${String(po.number).padStart(3, "0")}`,
    supplierName,
    lines:       lines.map((line) => serializeLine(line, po.currency)),
  };
}

const lineInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: procurementOrderLineScopeInclude,
};

const poInclude = {
  ...procurementOrderParentScopeInclude,
  supplierContact: { select: { legalName: true, fantasyName: true, tenantId: true } },
  purchaseRequest: { select: { requestedByUserId: true, tenantId: true, companyId: true, projectId: true } },
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

/**
 * Purchase orders that can be linked on a supplier invoice (create/edit).
 * Includes fully received OCs — invoicing is the next step after receipt.
 *
 * `includeIds`: always return these project POs (same tenant) even if status is
 * outside the linkable set — used when editing a draft that already points at one.
 */
export async function listLinkablePurchaseOrders(
  projectId: string,
  ctx: ServiceContext,
  opts?: { includeIds?: string[] },
): Promise<LinkablePurchaseOrder[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para listar órdenes de compra");
  }
  await requireProjectAccess(projectId, ctx);

  const includeIds = [...new Set((opts?.includeIds ?? []).filter(Boolean))];

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      projectId,
      tenantId: ctx.tenantId,
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}), // companyId NOT NULL
      OR: [
        { status: { in: [...PO_INVOICE_LINKABLE_STATUSES] } },
        ...(includeIds.length > 0 ? [{ id: { in: includeIds } }] : []),
      ],
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
  /** APU CostCategory ([D-099]). */
  category: string;
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
  budgetCurrency: string;
  budgetWarning: string | null;
  budgetUnitCost: string | null;
  budgetUnit: string | null;
  availableSaldo: string | null;
  wouldExceedBudget: boolean;
  /** Purchasable MATERIAL / LABOR / EQUIPMENT APU hints under this ITEM ([D-068], [D-109]). */
  apuLines: ProcurementApuOption[];
  /**
   * APU sole CostCategory for this ITEM ([D-099] amend 2026-09).
   *
   * - sole positive category (e.g. baño químico = 100% EQP) → that one.
   * - mixed / empty / all-zero → null (UI defaults to MATERIAL; user picks).
   *
   * Used by the OC/factura line editor to pre-select `costType` when the user
   * picks the partida but does not pick a specific insumo APU.
   */
  dominantCostType: CostCategory | null;
};

export async function listProcurementWbsOptions(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProcurementWbsOption[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para opciones de compra / EDT");
  }
  await requireProjectAccess(projectId, ctx);

  const nodes = await prisma.wbsNode.findMany({
    where: {
      type: "ITEM",
      budget: { projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx), status: { in: ["APPROVED", "CLOSED"] } },
    },
    select: {
      id: true,
      code: true,
      name: true,
      budgetId: true,
      budget: { select: { name: true, versionNumber: true, currency: true } },
      costItem: {
        select: {
          budgetId: true,
          // We fetch all analysisLines (all categories) so we can compute the
          // dominant CostCategory for the ITEM ([D-099]). Purchasable natures
          // (MATERIAL / LABOR / EQUIPMENT, non lump-sum) are exposed as `apuLines`
          // for Pedir from Materiales / Mano de obra / Equipos ([D-068]).
          analysisLines: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              budgetId: true,
              description: true,
              unit: true,
              unitCost: true,
              productId: true,
              category: true,
              totalCost: true,
              isLumpSum: true,
            },
          },
        },
      },
    },
  });

  const ordered = sortByWbsCode(
    nodes,
    (a, b) =>
      a.budget.name.localeCompare(b.budget.name, "es") ||
      a.budget.versionNumber - b.budget.versionNumber,
  );
  if (ordered.some((node) => node.costItem && (node.costItem.budgetId !== node.budgetId ||
      node.costItem.analysisLines.some((line) => line.budgetId !== node.budgetId)))) {
    throw new ServiceError("CONFLICT", "La partida y su análisis de costo tienen relaciones presupuestarias inconsistentes");
  }
  const commitments = await loadMaterialApuCommitmentByLineId(projectId, ctx, {
    categories: ["MATERIAL", "LABOR", "EQUIPMENT"],
  });

  const refs = await Promise.all(ordered.map((n) => getWbsBudgetReference(n.id, ctx.tenantId, { ctx })));

  const result: ProcurementWbsOption[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const n = ordered[i]!;
    const ref = refs[i]!;
    const allLines = n.costItem?.analysisLines ?? [];
    // Purchasable APU natures for Pedir / OC tipado ([D-068] + [D-099] LAB/EQP boards).
    const purchasableLines = allLines.filter(
      (l) =>
        (l.category === "MATERIAL" || l.category === "LABOR" || l.category === "EQUIPMENT") &&
        !l.isLumpSum,
    );
    result.push({
      id: n.id,
      code: n.code,
      name: n.name,
      budgetName: `${n.budget.name} v${n.budget.versionNumber}`,
      budgetCurrency: n.budget.currency,
      budgetWarning: ref.currencyWarning,
      budgetUnitCost: ref.budgetUnitCost,
      budgetUnit: ref.budgetUnit,
      availableSaldo: ref.availableSaldo,
      wouldExceedBudget: ref.wouldExceedBudget,
      dominantCostType: computeDominantCostTypeFromApuLines(allLines),
      apuLines: purchasableLines.map((l) => {
        const c = commitments.get(l.id);
        return {
          id: l.id,
          description: l.description,
          unit: l.unit,
          unitCost: serializeUnitPriceDecimal(l.unitCost),
          productId: l.productId,
          category: l.category,
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
  po: Prisma.PurchaseOrderGetPayload<{ include: typeof poInclude }>,
): Promise<PurchaseOrderView> {
  // Relation checks run before looking up actor names or exposing joined labels.
  assertPurchaseOrderRelations(po);
  const nameById = await resolveUserDisplayNames([
    po.approvedByUserId,
    po.createdBy,
    po.originRequestedByUserId ?? po.purchaseRequest?.requestedByUserId,
  ]);
  return serializePO(po, {
    approvedByName: userDisplayNameFromMap(nameById, po.approvedByUserId),
    createdByName: userDisplayNameFromMap(nameById, po.createdBy),
    originRequestedByName: userDisplayNameFromMap(nameById, po.originRequestedByUserId ?? po.purchaseRequest?.requestedByUserId),
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
  if (isCrossCompany(po.companyId, ctx)) throw new ServiceError("FORBIDDEN", "La orden no pertenece a la empresa activa");
  await requireProjectAccessIfPresent(po.projectId, ctx);
  return hydrateLiveBudgetRefs(await toPurchaseOrderView(po), ctx);
}

/** Fill Ref. presup. + live variance on DRAFT; never rewrite stored variance after submit. */
async function hydrateLiveBudgetRefs(
  view: PurchaseOrderView,
  ctx: ServiceContext,
): Promise<PurchaseOrderView> {
  const isDraft = view.status === "DRAFT";
  const settings = isDraft
    ? await getCompanyProcurementSettingsForProject(view.projectId, { ...ctx, companyId: view.companyId })
    : null;
  const lines = await Promise.all(
    view.lines.map(async (line) => {
      if (!line.wbsNodeId) return line;
      const baseline = await budgetBaselineForPurchaseLine(line.wbsNodeId, {
        productId: line.productId,
        description: line.description,
        unit: line.unit,
        costAnalysisLineId: line.costAnalysisLineId,
      });
      const comparable = isComparablePurchaseBaseline(line.unit, baseline.unit);
      const budgetCurrency = baseline.currency ?? line.budgetCurrency;
      const currencyComparable = Boolean(budgetCurrency && view.currency && budgetCurrency === view.currency);
      const liveCost =
        comparable && currencyComparable && baseline.unitCost ? serializeUnitPriceDecimal(baseline.unitCost) : null;
      const snapshot = isDraft
        ? liveCost
        : comparable && currencyComparable
          ? line.budgetUnitCostSnapshot ?? liveCost
          : null;
      const budgetRefKind = resolveBudgetRefKind(line.unit, baseline.unit, snapshot);
      const suggestedApu =
        !currencyComparable || budgetRefKind === "UNIT_PRICE" ? null : (baseline.suggestedApu ?? null);

      if (!isDraft || !settings) {
        return {
          ...line,
          budgetUnitCostSnapshot: snapshot,
          budgetCurrency,
          currencyComparable,
          budgetUnit: baseline.unit,
          budgetRefKind,
          suggestedApu,
        };
      }

      const result = evaluateLineVarianceLenient(
        {
          budgetCurrency,
          purchaseCurrency: view.currency,
          unit: line.unit,
          unitPrice: line.unitPrice,
          discountPct: line.discountPct,
          budgetUnitCost: snapshot,
          budgetUnit: baseline.unit,
          varianceJustification: line.varianceJustification,
        },
        settings,
      );
      return {
        ...line,
        budgetUnitCostSnapshot: snapshot,
        budgetCurrency,
        currencyComparable,
        budgetUnit: baseline.unit,
        budgetRefKind,
        suggestedApu,
        variancePct: result.variancePct,
        varianceTier: result.varianceTier,
        varianceUnitMismatch: result.varianceUnitMismatch,
      };
    }),
  );
  return { ...view, lines };
}

export async function listPurchaseOrdersByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PurchaseOrderView[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver órdenes de compra");
  }
  await requireProjectAccess(projectId, ctx);

  const orders = await prisma.purchaseOrder.findMany({
    where: { projectId, tenantId: ctx.tenantId, ...(ctx.companyId ? { companyId: ctx.companyId } : {}) }, // companyId NOT NULL
    include: poInclude,
    orderBy: { number: "asc" },
  });
  for (const order of orders) assertPurchaseOrderRelations(order);
  const nameById = await resolveUserDisplayNames(
    orders.flatMap((o) => [o.approvedByUserId, o.createdBy, o.originRequestedByUserId ?? o.purchaseRequest?.requestedByUserId]),
  );
  return orders.map((o) =>
    serializePO(o, {
      approvedByName: userDisplayNameFromMap(nameById, o.approvedByUserId),
      createdByName: userDisplayNameFromMap(nameById, o.createdBy),
      originRequestedByName: userDisplayNameFromMap(nameById, o.originRequestedByUserId ?? o.purchaseRequest?.requestedByUserId),
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

  await assertProjectAllowsOperationalMutation(input.projectId, ctx);
  if (input.lines.some((line) => line.purchaseRequestLineId)) {
    throw new ServiceError("CONFLICT", "Una orden directa no puede adjudicar líneas de una solicitud de compra");
  }

  const companyId = await resolveCompanyId(input.projectId, ctx);
  await assertCompanyMatchesProject(companyId, input.projectId, ctx.tenantId);
  const documentCtx = { ...ctx, companyId };

  await assertContactRoleInTenant(input.supplierContactId, "SUPPLIER", ctx.tenantId);

  assertWbsRequiredOnLines(input.lines);
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i]!;
    await assertWbsLineForProject(line.wbsNodeId, input.projectId, ctx.tenantId, { ctx: documentCtx });
    if (line.costAnalysisLineId) {
      await assertCostAnalysisLineForWbs(line.costAnalysisLineId, line.wbsNodeId, ctx.tenantId, { ctx: documentCtx });
    }
  }
  let estimatedSubtotal = new Prisma.Decimal(0);
  let estimatedTax = new Prisma.Decimal(0);
  for (const line of input.lines) {
    const qty = new Prisma.Decimal(line.quantity);
    const price = new Prisma.Decimal(line.unitPrice);
    const rate = new Prisma.Decimal(line.taxRate ?? "0");
    const calc = calcLine(qty, price, rate, parseDiscountPct(line.discountPct));
    estimatedSubtotal = estimatedSubtotal.plus(calc.lineSubtotal);
    estimatedTax = estimatedTax.plus(calc.lineTax);
  }
  const estimatedHeader = headerTotalsWithIibbPerception({
    lineSubtotals: [estimatedSubtotal],
    lineTaxes: [estimatedTax],
    iibbPerceptionRate: new Prisma.Decimal(
      input.iibbPerceptionRate ?? DEFAULT_IIBB_PERCEPTION_RATE_PCT,
    ),
  });
  const estimatedTotal = estimatedHeader.totalAmount;
  const settings = await getCompanyProcurementSettingsForProject(input.projectId, documentCtx);
  const fx = computeDocumentFxAmounts(input.currency ?? "ARS", estimatedTotal, input.fxRate ? new Prisma.Decimal(input.fxRate) : null);
  assertDirectPoAllowed(settings, fx.amountArs, ctx, {
    emergencyReason: input.emergencyReason,
  });

  const purchaseOrderId = await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, input.projectId, ctx);
    await lockProcurementCompanyForNumbering(tx, companyId, ctx.tenantId);
    await lockProductsForUnitReferences(tx, input.lines.flatMap((line) => line.productId ? [line.productId] : []), ctx.tenantId);
    await assertContactRoleInTenant(input.supplierContactId, "SUPPLIER", ctx.tenantId, { tx });
    const apuCategoryByIdx = new Map<number, CostCategory>();
    for (const [i, line] of input.lines.entries()) {
      await assertWbsLineForProject(line.wbsNodeId, input.projectId, ctx.tenantId, { ctx: documentCtx, db: tx });
      if (line.costAnalysisLineId) apuCategoryByIdx.set(i, await assertCostAnalysisLineForWbs(line.costAnalysisLineId, line.wbsNodeId, ctx.tenantId, { ctx: documentCtx, db: tx }));
      if (line.productId) {
        const product = await tx.product.findFirst({ where: { id: line.productId, tenantId: ctx.tenantId, ...companyScopeFilter(documentCtx) }, select: { id: true, unit: true } });
        if (!product) throw new ServiceError("CONFLICT", "El producto no pertenece a la empresa de la orden");
        assertProductUnitCompatible(product.unit, line.unit ?? "");
      }
    }
    const wbsDominantByCreate = await loadWbsDominantCostTypes([...new Set(input.lines.map((line) => line.wbsNodeId))], ctx.tenantId, tx);
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
        fxRate: fx.fxRate,
        totalAmountArs: fx.amountArs,
        iibbPerceptionRate: new Prisma.Decimal(input.iibbPerceptionRate ?? DEFAULT_IIBB_PERCEPTION_RATE_PCT),
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        emergencyReason: input.emergencyReason?.trim() || null,
        originRequestedByUserId: ctx.actorUserId,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!;
      const qty = new Prisma.Decimal(line.quantity);
      const price = new Prisma.Decimal(line.unitPrice);
      const rate = new Prisma.Decimal(line.taxRate ?? "0");
      const { lineSubtotal, lineTax, lineTotal } = calcLine(
        qty,
        price,
        rate,
        parseDiscountPct(line.discountPct),
      );
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
      const costType = resolveLineCostType({
        costType: line.costType ?? null,
        apuCategory: apuCategoryByIdx.get(i) ?? null,
        wbsDominantCostType: line.wbsNodeId ? wbsDominantByCreate.get(line.wbsNodeId) ?? null : null,
      });
      await tx.purchaseOrderLine.create({
        data: {
          purchaseOrderId: created.id,
          wbsNodeId: line.wbsNodeId,
          productId: line.productId ?? null,
          costAnalysisLineId: line.costAnalysisLineId ?? null,
          costType,
          description: line.description,
          unit: line.unit ?? "",
          quantity: qty,
          unitPrice: price,
          taxRate: rate,
          discountPct: parseDiscountPct(line.discountPct),
          lineSubtotal,
          lineTax,
          lineTotal,
          budgetUnitCostSnapshot: isComparablePurchaseBaseline(line.unit ?? "", baseline.unit) && Boolean(baseline.currency) && baseline.currency === (input.currency ?? "ARS")
            ? baseline.unitCost
            : null,
          varianceJustification: line.varianceJustification?.trim() || null,
          sortOrder: line.sortOrder ?? 0,
        },
      });
    }

    await recalcPurchaseOrderTotals(tx, created.id);

    await auditProcurement(
      ctx,
      "purchase_order.created",
      "PurchaseOrder",
      created.id,
      { projectId: created.projectId, companyId: created.companyId },
      { after: { number: created.number }, tx },
    );
    return created.id;
  }, { maxWait: 10_000, timeout: 30_000 });

  // The display graph is read after commit, without holding the numbering/project locks.
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId }, include: poInclude });
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

  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude });
  if (!existing) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(existing.companyId, ctx)) throw new ServiceError("FORBIDDEN", "La orden no pertenece a la empresa activa");
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  assertPurchaseOrderRelations(existing);
  assertDraft(existing);
  if (!existing.purchaseRequestId && input.lines?.some((line) => line.purchaseRequestLineId)) {
    throw new ServiceError("CONFLICT", "Una orden directa no puede adjudicar líneas de una solicitud de compra");
  }

  if (input.supplierContactId) {
    await assertContactRoleInTenant(input.supplierContactId, "SUPPLIER", ctx.tenantId);
    if (
      existing.purchaseRequestId &&
      input.supplierContactId !== existing.supplierContactId
    ) {
      throw new ServiceError(
        "CONFLICT",
        "No se puede cambiar el proveedor de una OC generada desde solicitud de compra",
      );
    }
  }

  if (input.lines) {
    assertWbsRequiredOnLines(input.lines);
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!;
      await assertWbsLineForProject(line.wbsNodeId, existing.projectId, ctx.tenantId, { ctx: { ...ctx, companyId: existing.companyId } });
      if (line.costAnalysisLineId) {
        await assertCostAnalysisLineForWbs(line.costAnalysisLineId, line.wbsNodeId, ctx.tenantId, { ctx: { ...ctx, companyId: existing.companyId } });
      }
    }
    await assertPoLinesWithinSelectedQuote(
      id,
      input.lines.map((l, i) => ({
        description: l.description,
        wbsNodeId: l.wbsNodeId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        sortOrder: l.sortOrder ?? i,
        purchaseRequestLineId: l.purchaseRequestLineId ?? null,
      })),
      ctx.tenantId,
    );
  }

  const purchaseOrderId = await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    await lockProcurementCompanyForNumbering(tx, existing.companyId, ctx.tenantId);
    const current = await tx.purchaseOrder.findFirst({ where: { id, tenantId: ctx.tenantId, companyId: existing.companyId, projectId: existing.projectId }, include: poInclude });
    if (!current || current.updatedAt.getTime() !== existing.updatedAt.getTime()) {
      throw new ServiceError("CONFLICT", "La orden cambió durante la edición. Recargá e intentá de nuevo.");
    }
    assertPurchaseOrderRelations(current);
    if (input.supplierContactId) await assertContactRoleInTenant(input.supplierContactId, "SUPPLIER", ctx.tenantId, { tx });
    const apuCategoryByIdx = new Map<number, CostCategory>();
    let wbsDominantByUpdate = new Map<string, CostCategory | null>();
    if (input.lines) {
      await lockProductsForUnitReferences(tx, input.lines.flatMap((line) => line.productId ? [line.productId] : []), ctx.tenantId);
      for (const [i, line] of input.lines.entries()) {
        const documentCtx = { ...ctx, companyId: existing.companyId };
        await assertWbsLineForProject(line.wbsNodeId, existing.projectId, ctx.tenantId, { ctx: documentCtx, db: tx });
        if (line.costAnalysisLineId) apuCategoryByIdx.set(i, await assertCostAnalysisLineForWbs(line.costAnalysisLineId, line.wbsNodeId, ctx.tenantId, { ctx: documentCtx, db: tx }));
        if (line.productId) {
          const product = await tx.product.findFirst({ where: { id: line.productId, tenantId: ctx.tenantId, ...companyScopeFilter(documentCtx) }, select: { id: true, unit: true } });
          if (!product) throw new ServiceError("CONFLICT", "El producto no pertenece a la empresa de la orden");
          assertProductUnitCompatible(product.unit, line.unit ?? "");
        }
      }
      wbsDominantByUpdate = await loadWbsDominantCostTypes([...new Set(input.lines.map((line) => line.wbsNodeId))], ctx.tenantId, tx);
    }
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
        ...(input.iibbPerceptionRate !== undefined
          ? { iibbPerceptionRate: new Prisma.Decimal(input.iibbPerceptionRate) }
          : {}),
        updatedBy:            ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      headerClaim.count,
      "La orden de compra ya no está en borrador. Recargá e intentá de nuevo.",
    );

    if (input.lines) {
      const previousLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
      const previousById = indexStoredDocumentLines(input.lines, previousLines);
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]!;
        const prev = previousLines.find(
          (p) =>
            line.purchaseRequestLineId != null &&
            p.purchaseRequestLineId === line.purchaseRequestLineId,
        ) ?? previousLines.find(
          (p) =>
            p.wbsNodeId === line.wbsNodeId &&
            p.description === line.description,
        ) ?? previousLines.find((p) => p.sortOrder === (line.sortOrder ?? i));
        const qty   = new Prisma.Decimal(line.quantity);
        const price = new Prisma.Decimal(line.unitPrice);
        const rate  = new Prisma.Decimal(line.taxRate ?? "0");
        const { lineSubtotal, lineTax, lineTotal } = resolveInvoiceLineMoney({
          quantity: qty, unitPrice: price, taxRate: rate,
          discountPct: parseDiscountPct(line.discountPct),
          previous: line.id ? previousById.get(line.id) : undefined,
        });
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
        const comparable = isComparablePurchaseBaseline(line.unit ?? "", baseline.unit);
        const budgetSnapshot = comparable && Boolean(baseline.currency) && baseline.currency === existing.currency ? baseline.unitCost : null;
        const costType = resolveLineCostType({
          costType: line.costType ?? null,
          apuCategory: apuCategoryByIdx.get(i) ?? null,
          wbsDominantCostType: line.wbsNodeId ? wbsDominantByUpdate.get(line.wbsNodeId) ?? null : null,
        });
        await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: id,
            purchaseRequestLineId:
              line.purchaseRequestLineId ?? prev?.purchaseRequestLineId ?? null,
            procurementQuoteLineId: prev?.procurementQuoteLineId ?? null,
            isActiveAward: prev?.isActiveAward ?? true,
            wbsNodeId:       line.wbsNodeId,
            productId:       line.productId ?? null,
            costAnalysisLineId: line.costAnalysisLineId ?? null,
            costType,
            description:     line.description,
            unit:            line.unit ?? "",
            quantity:        qty,
            unitPrice:       price,
            taxRate:         rate,
            discountPct:     parseDiscountPct(line.discountPct),
            lineSubtotal,
            lineTax,
            lineTotal,
            sortOrder:       line.sortOrder ?? prev?.sortOrder ?? i,
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
    } else if (input.iibbPerceptionRate !== undefined) {
      await recalcPurchaseOrderTotals(tx, id);
    }

    const header = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    const fx = computeDocumentFxAmounts(header.currency, header.totalAmount, input.fxRate ? new Prisma.Decimal(input.fxRate) : header.fxRate);
    await tx.purchaseOrder.update({ where: { id }, data: { fxRate: fx.fxRate, totalAmountArs: fx.amountArs } });

    await auditProcurement(
      ctx,
      "purchase_order.updated",
      "PurchaseOrder",
      id,
      { projectId: header.projectId, companyId: header.companyId },
      { after: { number: header.number }, tx },
    );
    return id;
  }, { maxWait: 10_000, timeout: 30_000 });

  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId }, include: poInclude });
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
  if (isCrossCompany(existing.companyId, ctx)) throw new ServiceError("FORBIDDEN", "La orden no pertenece a la empresa activa");
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);

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
    where: { OR: [{ purchaseOrderId: id }, { lines: { some: { purchaseOrderLine: { purchaseOrderId: id } } } }], status: { not: "CANCELLED" } },
  });
  if (linkedInvoices > 0) {
    throw new ServiceError("CONFLICT", "No se puede anular: hay facturas de proveedor vinculadas activas");
  }

  const wasDraft = existing.status === "DRAFT";

  const po = await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const current = await tx.purchaseOrder.findFirst({ where: { id, tenantId: ctx.tenantId, companyId: existing.companyId, projectId: existing.projectId }, include: poInclude });
    if (!current || ["CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(current.status)) {
      throw new ServiceError("CONFLICT", "La orden ya no se puede anular (estado cambió)");
    }
    assertPurchaseOrderRelations(current);
    if (await tx.purchaseReceipt.count({ where: { purchaseOrderId: id, status: "CONFIRMED" } })) {
      throw new ServiceError("CONFLICT", "No se puede anular: la orden tiene recepciones confirmadas");
    }
    if (await tx.supplierInvoice.count({ where: { OR: [{ purchaseOrderId: id }, { lines: { some: { purchaseOrderLine: { purchaseOrderId: id } } } }], status: { not: "CANCELLED" } } })) {
      throw new ServiceError("CONFLICT", "No se puede anular: hay facturas de proveedor vinculadas activas");
    }
    const draftReceipts = await tx.purchaseReceipt.findMany({
      where: { purchaseOrderId: id, tenantId: ctx.tenantId, projectId: current.projectId, companyId: current.companyId, status: "DRAFT" },
      select: { id: true, projectId: true, companyId: true },
    });

    if (draftReceipts.length > 0) {
      await tx.purchaseReceipt.updateMany({
        where: { purchaseOrderId: id, tenantId: ctx.tenantId, projectId: current.projectId, companyId: current.companyId, status: "DRAFT" },
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
        tenantId: ctx.tenantId,
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
  }, { maxWait: 10_000, timeout: 30_000 });

  return toPurchaseOrderView(po);
}
