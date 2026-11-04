import { prisma, type CostCategory, type Prisma } from "@bloqer/database";
import { companyScopeFilter } from "../company-scope";
import { ServiceError, type ServiceContext } from "../types";
import { assertCompanyProjectScopeMatch } from "./assert-company-project-scope";

type ScopeOptions = { ctx?: ServiceContext; db?: Prisma.TransactionClient | typeof prisma };

/** Numbering belongs to Company, not Project; lock after Project and before SC/OC. */
export async function lockProcurementCompanyForNumbering(
  tx: Prisma.TransactionClient,
  companyId: string,
  tenantId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} AND "tenantId" = ${tenantId} FOR NO KEY UPDATE`;
}

export async function assertWbsLineForProject(
  wbsNodeId: string,
  projectId: string,
  tenantId: string,
  options?: ScopeOptions,
): Promise<void> {
  const db = options?.db ?? prisma;
  const wbsNode = await db.wbsNode.findFirst({
    where: { id: wbsNodeId, budget: { tenantId, ...(options?.ctx ? companyScopeFilter(options.ctx) : {}) } },
    include: {
      budget: { select: { projectId: true, status: true, tenantId: true } },
      costItem: { select: { budgetId: true, analysisLines: { select: { budgetId: true } } } },
    },
  });
  if (!wbsNode) throw new ServiceError("NOT_FOUND", `Ítem EDT no encontrado: ${wbsNodeId}`);
  if (wbsNode.costItem && (wbsNode.costItem.budgetId !== wbsNode.budgetId ||
      wbsNode.costItem.analysisLines.some((line) => line.budgetId !== wbsNode.budgetId))) {
    throw new ServiceError("CONFLICT", "La partida y su análisis de costo tienen relaciones presupuestarias inconsistentes");
  }
  if (wbsNode.type !== "ITEM") throw new ServiceError("CONFLICT", "Solo se permiten ítems EDT de tipo partida (hoja)");
  if (wbsNode.budget.projectId !== projectId) {
    throw new ServiceError("CONFLICT", "El ítem EDT no pertenece al proyecto");
  }
  if (!["APPROVED", "CLOSED"].includes(wbsNode.budget.status)) {
    throw new ServiceError("CONFLICT", "Solo se permiten ítems EDT de presupuestos APROBADOS o CERRADOS");
  }
}

export async function assertCompanyMatchesProject(
  companyId: string,
  projectId: string,
  tenantId: string,
): Promise<void> {
  const [project, company] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { companyId: true },
    }),
    prisma.company.findFirst({
      where: { id: companyId, tenantId },
      select: { id: true },
    }),
  ]);
  assertCompanyProjectScopeMatch({
    project,
    companyInTenant: Boolean(company),
    companyId,
  });
}

/** [D-068] Optional APU hint must belong to the same WBS ITEM cost item. Returns APU category for [D-099]. */
export async function assertCostAnalysisLineForWbs(
  costAnalysisLineId: string,
  wbsNodeId: string,
  tenantId: string,
  options?: ScopeOptions,
): Promise<CostCategory> {
  const db = options?.db ?? prisma;
  const line = await db.costAnalysisLine.findFirst({
    where: {
      id: costAnalysisLineId,
      budget: { tenantId, ...(options?.ctx ? companyScopeFilter(options.ctx) : {}) },
      costItem: { wbsNodeId, wbsNode: { budget: { tenantId, ...(options?.ctx ? companyScopeFilter(options.ctx) : {}) } } },
    },
    select: { id: true, category: true, budgetId: true, costItem: { select: { budgetId: true, wbsNode: { select: { budgetId: true } } } } },
  });
  if (!line || line.budgetId !== line.costItem.budgetId || line.budgetId !== line.costItem.wbsNode.budgetId) {
    throw new ServiceError(
      "CONFLICT",
      "El insumo APU no pertenece a la partida EDT seleccionada",
    );
  }
  return line.category;
}

const requestScopeSelect = { tenantId: true, companyId: true, projectId: true } as const;
const requestLineScopeSelect = { purchaseRequestId: true, purchaseRequest: { select: requestScopeSelect } } as const;
const quoteScopeSelect = {
  tenantId: true, purchaseRequestId: true, supplierContactId: true,
  purchaseRequest: { select: requestScopeSelect },
} as const;

/** Joined parent data used before returning or operating an OC line (ADR-018). */
export const procurementOrderLineScopeInclude = {
  wbsNode: { select: { id: true, code: true, name: true, budgetId: true, budget: { select: { tenantId: true, companyId: true, projectId: true, currency: true } } } },
  product: { select: { tenantId: true, companyId: true } },
  costAnalysisLine: { select: { budgetId: true, costItem: { select: { budgetId: true, wbsNodeId: true } } } },
  purchaseRequestLine: { select: requestLineScopeSelect },
  procurementQuoteLine: { select: {
    procurementQuoteId: true, purchaseRequestLineId: true,
    procurementQuote: { select: quoteScopeSelect },
    purchaseRequestLine: { select: requestLineScopeSelect },
  } },
} as const;

export const procurementOrderParentScopeInclude = {
  supplierContact: { select: { tenantId: true } },
  purchaseRequest: { select: requestScopeSelect },
  selectedProcurementQuote: { select: quoteScopeSelect },
  lines: { include: procurementOrderLineScopeInclude },
} as const;

type RequestRelationScope = { tenantId: string; companyId: string; projectId: string };
type RequestLineRelationScope = { purchaseRequestId: string; purchaseRequest: RequestRelationScope };
type QuoteRelationScope = { tenantId: string; purchaseRequestId: string; supplierContactId: string; purchaseRequest: RequestRelationScope };

type OrderRelationScope = {
  tenantId: string; companyId: string; projectId: string; supplierContactId: string;
  purchaseRequestId?: string | null;
  selectedProcurementQuoteId?: string | null;
  supplierContact: { tenantId: string };
  purchaseRequest?: RequestRelationScope | null;
  selectedProcurementQuote?: QuoteRelationScope | null;
  lines: Array<{
    wbsNodeId: string | null; productId: string | null; costAnalysisLineId: string | null;
    wbsNode: { id: string; budgetId: string; budget: { tenantId: string; companyId: string | null; projectId: string } } | null;
    product: { tenantId: string; companyId: string | null } | null;
    costAnalysisLine: { budgetId: string; costItem: { budgetId: string; wbsNodeId: string } } | null;
    purchaseRequestLineId?: string | null;
    purchaseRequestLine?: RequestLineRelationScope | null;
    procurementQuoteLineId?: string | null;
    procurementQuoteLine?: {
      procurementQuoteId: string; purchaseRequestLineId: string;
      procurementQuote: QuoteRelationScope;
      purchaseRequestLine: RequestLineRelationScope;
    } | null;
  }>;
};

/** Foreign IDs/parents must never introduce names, quantities or costs into an OC. */
export function assertPurchaseOrderRelations(po: OrderRelationScope): void {
  const inconsistent = () => { throw new ServiceError("CONFLICT", "La orden de compra contiene relaciones inconsistentes con su empresa, obra o presupuesto"); };
  const requestMatches = (request: RequestRelationScope) => request.tenantId === po.tenantId && request.companyId === po.companyId && request.projectId === po.projectId;
  const quoteMatches = (quote: QuoteRelationScope) => quote.tenantId === po.tenantId && quote.purchaseRequestId === po.purchaseRequestId && quote.supplierContactId === po.supplierContactId && requestMatches(quote.purchaseRequest);
  if (po.supplierContact.tenantId !== po.tenantId) inconsistent();
  if (po.purchaseRequestId && !po.purchaseRequest) inconsistent();
  if (po.purchaseRequest && !requestMatches(po.purchaseRequest)) inconsistent();
  if (po.selectedProcurementQuoteId && (!po.purchaseRequestId || !po.selectedProcurementQuote || !quoteMatches(po.selectedProcurementQuote))) inconsistent();
  for (const line of po.lines) {
    const node = line.wbsNode;
    if (line.wbsNodeId && (!node || node.id !== line.wbsNodeId || node.budget.tenantId !== po.tenantId ||
        node.budget.projectId !== po.projectId || (node.budget.companyId !== null && node.budget.companyId !== po.companyId))) inconsistent();
    if (line.productId && (!line.product || line.product.tenantId !== po.tenantId ||
        (line.product.companyId !== null && line.product.companyId !== po.companyId))) inconsistent();
    if (line.costAnalysisLineId) {
      const apu = line.costAnalysisLine;
      if (!node || !apu || apu.budgetId !== node.budgetId || apu.costItem.budgetId !== node.budgetId ||
          apu.costItem.wbsNodeId !== line.wbsNodeId) inconsistent();
    }
    if (line.purchaseRequestLineId) {
      const requestLine = line.purchaseRequestLine;
      if (!po.purchaseRequestId || !requestLine || requestLine.purchaseRequestId !== po.purchaseRequestId || !requestMatches(requestLine.purchaseRequest)) inconsistent();
    }
    if (line.procurementQuoteLineId) {
      const quoteLine = line.procurementQuoteLine;
      if (!po.selectedProcurementQuoteId || !quoteLine || quoteLine.procurementQuoteId !== po.selectedProcurementQuoteId ||
          !quoteMatches(quoteLine.procurementQuote) || quoteLine.purchaseRequestLine.purchaseRequestId !== po.purchaseRequestId ||
          !requestMatches(quoteLine.purchaseRequestLine.purchaseRequest) ||
          (line.purchaseRequestLineId && quoteLine.purchaseRequestLineId !== line.purchaseRequestLineId)) inconsistent();
    }
  }
}
