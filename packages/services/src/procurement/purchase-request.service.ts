import { Prisma, prisma, type PurchaseRequest, type CostCategory } from "@bloqer/database";
import type { CreatePurchaseRequestInput } from "@bloqer/validators";
import { auditProcurement } from "./procurement-audit";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canEditPurchaseRequests, canViewPurchaseRequests } from "./procurement-access";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { assertCostAnalysisLineForWbs, assertWbsLineForProject } from "./procurement-wbs";
import { loadWbsDominantCostTypes, resolveLineCostType } from "../cost-control/cost-type";
import {
  assertWbsRequiredOnLines,
  budgetBaselineForPurchaseLine,
} from "./procurement-budget-baseline";
import { notifyPurchaseRequestSubmitted } from "./procurement-notifications.service";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeUnitPriceDecimal,
} from "../finance/money-decimal";
import {
  computeEstimatedAmount,
  computeLineSummaries,
  type PurchaseRequestEstimatedAmountSource,
} from "./purchase-request-list-enrichment";
import {
  resolveUserDisplayNames,
  userDisplayNameFromMap,
} from "../user/resolve-user-display-names";

export type PurchaseRequestLineView = {
  id: string;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  productId: string | null;
  costAnalysisLineId: string | null;
  costType: string;
  lineType: string;
  description: string;
  unit: string;
  quantity: string;
  budgetUnitCostSnapshot: string | null;
  /** APU unit cost from costAnalysisLine (for DRAFT estimate before submit snapshot). */
  apuUnitCost: string | null;
};

export type { PurchaseRequestEstimatedAmountSource };

export type PurchaseRequestView = Omit<PurchaseRequest, never> & {
  code: string;
  requestedByName: string | null;
  selectedSupplierName: string | null;
  lines: PurchaseRequestLineView[];
  /** Σ qty × ref. APU (insumos ligados) or selected quote total when available. */
  estimatedAmount: string | null;
  estimatedAmountCurrency: string | null;
  estimatedAmountSource: PurchaseRequestEstimatedAmountSource | null;
  primaryWbsNodeCode: string | null;
  primaryWbsNodeName: string | null;
  hasMultipleWbs: boolean;
  linesCount: number;
  firstLineDescription: string | null;
};

async function resolveCompanyId(projectId: string, ctx: ServiceContext): Promise<string> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId },
    select: { companyId: true },
  });
  if (!project?.companyId) {
    throw new ServiceError("CONFLICT", "El proyecto no tiene empresa asignada");
  }
  if (ctx.companyId && ctx.companyId !== project.companyId) {
    throw new ServiceError("CONFLICT", "La empresa activa no coincide con la del proyecto");
  }
  return project.companyId;
}

async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  companyId: string,
): Promise<number> {
  const max = await tx.purchaseRequest.aggregate({
    where: { tenantId, companyId },
    _max: { number: true },
  });
  return (max._max.number ?? 0) + 1;
}

type SelectedQuoteForList = {
  totalAmount: Prisma.Decimal;
  currency: string;
};

function serialize(
  pr: PurchaseRequest & { lines: PurchaseRequestLineView[] },
  requestedByName: string | null = null,
  selectedSupplierName: string | null = null,
  selectedQuote: SelectedQuoteForList | null = null,
): PurchaseRequestView {
  const summaries = computeLineSummaries(pr.lines);
  const estimated = computeEstimatedAmount(
    pr,
    pr.lines.map((l) => ({
      wbsNodeId: l.wbsNodeId,
      wbsNodeCode: l.wbsNodeCode,
      wbsNodeName: l.wbsNodeName,
      costAnalysisLineId: l.costAnalysisLineId,
      description: l.description,
      quantity: l.quantity,
      budgetUnitCostSnapshot: l.budgetUnitCostSnapshot,
      apuUnitCost: l.apuUnitCost,
    })),
    selectedQuote
      ? {
          totalAmount: serializeMoneyDecimal(selectedQuote.totalAmount),
          currency: selectedQuote.currency,
        }
      : null,
  );
  return {
    ...pr,
    code: `SC-${String(pr.number).padStart(3, "0")}`,
    requestedByName,
    selectedSupplierName,
    lines: pr.lines,
    ...summaries,
    ...estimated,
  };
}

const prLineInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    wbsNode: { select: { code: true, name: true } },
    costAnalysisLine: { select: { unitCost: true } },
  },
};

const selectedQuoteInclude = {
  where: { status: "SELECTED" as const },
  select: {
    totalAmount: true,
    currency: true,
    supplierContact: { select: { legalName: true, fantasyName: true } },
  },
  take: 1,
};

function mapPrLines(
  lines: Array<{
    id: string;
    wbsNodeId: string | null;
    productId: string | null;
    costAnalysisLineId: string | null;
    costType: CostCategory | null;
    lineType: string;
    description: string;
    unit: string;
    quantity: Prisma.Decimal;
    budgetUnitCostSnapshot: Prisma.Decimal | null;
    wbsNode: { code: string; name: string } | null;
    costAnalysisLine: { unitCost: Prisma.Decimal } | null;
  }>,
): PurchaseRequestLineView[] {
  return lines.map((l) => ({
    id: l.id,
    wbsNodeId: l.wbsNodeId,
    wbsNodeCode: l.wbsNode?.code ?? null,
    wbsNodeName: l.wbsNode?.name ?? null,
    productId: l.productId,
    costAnalysisLineId: l.costAnalysisLineId,
    costType: l.costType ?? "MATERIAL",
    lineType: l.lineType,
    description: l.description,
    unit: l.unit,
    quantity: serializeQtyDecimal(l.quantity),
    budgetUnitCostSnapshot: l.budgetUnitCostSnapshot != null ? serializeUnitPriceDecimal(l.budgetUnitCostSnapshot) : null,
    apuUnitCost:
      l.costAnalysisLine?.unitCost != null
        ? serializeUnitPriceDecimal(l.costAnalysisLine.unitCost)
        : null,
  }));
}

function selectedQuoteFromRows(
  quotes: Array<{
    totalAmount: Prisma.Decimal;
    currency: string;
    supplierContact: { legalName: string; fantasyName: string | null };
  }>,
): {
  quote: SelectedQuoteForList;
  supplierName: string;
} | null {
  const q = quotes[0];
  if (!q) return null;
  return {
    quote: { totalAmount: q.totalAmount, currency: q.currency },
    supplierName: q.supplierContact.fantasyName ?? q.supplierContact.legalName,
  };
}

function assertDraftPr(status: string): void {
  if (status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se puede editar una solicitud en borrador");
  }
}

export async function listPurchaseRequestsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PurchaseRequestView[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const rows = await prisma.purchaseRequest.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: {
      lines: prLineInclude,
      quotes: selectedQuoteInclude,
    },
    orderBy: { number: "desc" },
  });
  const nameById = await resolveUserDisplayNames(rows.map((r) => r.requestedByUserId));
  return rows.map((r) => {
    const selected = selectedQuoteFromRows(r.quotes);
    return serialize(
      {
        ...r,
        lines: mapPrLines(r.lines),
      },
      userDisplayNameFromMap(nameById, r.requestedByUserId),
      selected?.supplierName ?? null,
      selected?.quote ?? null,
    );
  });
}

export async function getPurchaseRequestById(id: string, ctx: ServiceContext): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const pr = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      lines: prLineInclude,
      quotes: selectedQuoteInclude,
    },
  });
  if (!pr || pr.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  const nameById = await resolveUserDisplayNames([pr.requestedByUserId]);
  const selected = selectedQuoteFromRows(pr.quotes);
  return serialize(
    {
      ...pr,
      lines: mapPrLines(pr.lines),
    },
    userDisplayNameFromMap(nameById, pr.requestedByUserId),
    selected?.supplierName ?? null,
    selected?.quote ?? null,
  );
}

export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput,
  ctx: ServiceContext,
): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear solicitudes de compra");
  }
  await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);
  const companyId = await resolveCompanyId(input.projectId, ctx);

  assertWbsRequiredOnLines(input.lines);
  const apuCategoryByIdx = new Map<number, CostCategory>();
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i]!;
    await assertWbsLineForProject(line.wbsNodeId, input.projectId, ctx.tenantId);
    if (line.costAnalysisLineId) {
      apuCategoryByIdx.set(
        i,
        await assertCostAnalysisLineForWbs(line.costAnalysisLineId, line.wbsNodeId, ctx.tenantId),
      );
    }
  }
  // APU-derived dominant CostCategory used when the line only references the WBS
  // (no insumo APU, no manual costType) ([D-099]).
  const wbsIds = Array.from(new Set(input.lines.map((l) => l.wbsNodeId).filter((v): v is string => Boolean(v))));
  const wbsDominant = await loadWbsDominantCostTypes(wbsIds, ctx.tenantId);

  const pr = await prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, ctx.tenantId, companyId);
    const created = await tx.purchaseRequest.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        projectId: input.projectId,
        number,
        requestedByUserId: ctx.actorUserId,
        neededByDate: new Date(input.neededByDate),
        notes: input.notes ?? null,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
        lines: {
          create: input.lines.map((line, i) => ({
            wbsNodeId: line.wbsNodeId,
            productId: line.productId ?? null,
            costAnalysisLineId: line.costAnalysisLineId ?? null,
            costType: resolveLineCostType({
              costType: line.costType ?? null,
              apuCategory: apuCategoryByIdx.get(i) ?? null,
              wbsDominantCostType: line.wbsNodeId ? wbsDominant.get(line.wbsNodeId) ?? null : null,
            }),
            lineType: line.lineType,
            description: line.description,
            unit: line.unit ?? "",
            quantity: new Prisma.Decimal(line.quantity),
            sortOrder: line.sortOrder ?? i,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    await auditProcurement(
      ctx,
      "purchase_request.created",
      "PurchaseRequest",
      created.id,
      { projectId: created.projectId, companyId: created.companyId },
      { after: { number: created.number }, tx },
    );
    return created;
  });

  return getPurchaseRequestById(pr.id, ctx);
}

export async function submitPurchaseRequest(id: string, ctx: ServiceContext): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const existing = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!existing || existing.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  assertDraftPr(existing.status);
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);

  await prisma.$transaction(async (tx) => {
    for (const line of existing.lines) {
      if (!line.wbsNodeId) {
        throw new ServiceError(
          "CONFLICT",
          "Todas las líneas deben tener EDT antes de enviar la solicitud",
        );
      }
      const baseline = await budgetBaselineForPurchaseLine(
        line.wbsNodeId,
        {
          costAnalysisLineId: line.costAnalysisLineId,
          productId: line.productId,
          description: line.description,
          unit: line.unit,
        },
        tx,
      );
      await tx.purchaseRequestLine.update({
        where: { id: line.id },
        data: {
          budgetUnitCostSnapshot: baseline.unitCost,
          budgetQuantitySnapshot: baseline.quantity,
        },
      });
    }
    const flipped = await tx.purchaseRequest.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La solicitud ya no está en borrador. Recargá e intentá de nuevo.",
    );
    await auditProcurement(
      ctx,
      "purchase_request.submitted",
      "PurchaseRequest",
      id,
      { projectId: existing.projectId, companyId: existing.companyId },
      { after: { status: "SUBMITTED" }, tx },
    );
  });

  const code = `SC-${String(existing.number).padStart(3, "0")}`;
  await notifyPurchaseRequestSubmitted({
    ctx,
    purchaseRequestId: id,
    projectId: existing.projectId,
    companyId: existing.companyId,
    code,
  });

  return getPurchaseRequestById(id, ctx);
}

export async function getActivePurchaseOrderForRequest(
  purchaseRequestId: string,
  ctx: ServiceContext,
): Promise<{ id: string; code: string; status: string; projectId: string } | null> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const po = await prisma.purchaseOrder.findFirst({
    where: {
      purchaseRequestId,
      tenantId: ctx.tenantId,
      status: { not: "CANCELLED" },
    },
    select: { id: true, number: true, status: true, projectId: true },
  });
  if (!po) return null;
  return {
    id: po.id,
    code: `OC-${String(po.number).padStart(3, "0")}`,
    status: po.status,
    projectId: po.projectId,
  };
}

export async function cancelPurchaseRequest(id: string, ctx: ServiceContext): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "La solicitud no puede anularse en este estado");
  }

  const activePo = await prisma.purchaseOrder.count({
    where: {
      purchaseRequestId: id,
      status: { not: "CANCELLED" },
    },
  });
  if (activePo > 0) {
    throw new ServiceError(
      "CONFLICT",
      "Hay órdenes de compra vinculadas a esta solicitud. Anulá la OC primero.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const flipped = await tx.purchaseRequest.updateMany({
      where: {
        id,
        tenantId: ctx.tenantId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La solicitud cambió de estado. Recargá e intentá de nuevo.",
    );
    await tx.procurementQuote.updateMany({
      where: {
        purchaseRequestId: id,
        status: { in: ["DRAFT", "RECEIVED", "SELECTED"] },
      },
      data: { status: "REJECTED" },
    });
  });
  await auditProcurement(ctx, "purchase_request.cancelled", "PurchaseRequest", id, {
    projectId: existing.projectId,
    companyId: existing.companyId,
  });

  return getPurchaseRequestById(id, ctx);
}
