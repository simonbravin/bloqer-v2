import { effectiveUnitPriceNet } from "@bloqer/utils";
import { loadWbsDominantCostTypes, resolveLineCostType } from "../cost-control/cost-type";
import { parseDiscountPct } from "../finance/invoice-line-money";
import { Prisma, prisma, PurchaseOrderStatus } from "@bloqer/database";
import { auditProcurement } from "./procurement-audit";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canEditPurchaseOrders } from "./procurement-access";
import { getCompanyProcurementSettings } from "./company-procurement-settings.service";
import { recalcPurchaseOrderTotals } from "./purchase-order-calc.service";

const CONFIRMED_PLUS: PurchaseOrderStatus[] = [
  "CONFIRMED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
];

type Tx = Prisma.TransactionClient;

export type PurchaseRequestCoverage = {
  totalLineCount: number;
  awardedLineCount: number;
  fullyAwarded: boolean;
  allAwardedPosConfirmed: boolean;
};

export async function computePurchaseRequestCoverage(
  purchaseRequestId: string,
  db: Tx | typeof prisma = prisma,
): Promise<PurchaseRequestCoverage> {
  // Heal cancelled-OC award artifacts so re-award / quote edit cannot hit unique/FK traps.
  await db.purchaseOrderLine.updateMany({
    where: {
      purchaseOrder: { purchaseRequestId, status: "CANCELLED" },
      OR: [{ isActiveAward: true }, { procurementQuoteLineId: { not: null } }],
    },
    data: { isActiveAward: false, procurementQuoteLineId: null },
  });

  const lines = await db.purchaseRequestLine.findMany({
    where: { purchaseRequestId },
    select: {
      id: true,
      awardedPurchaseOrderId: true,
      awardedPurchaseOrder: { select: { status: true } },
    },
  });
  const totalLineCount = lines.length;
  // Treat cancelled / missing PO links as unawarded ([BR-PUR-024] integrity).
  const awarded = lines.filter(
    (l) =>
      l.awardedPurchaseOrderId != null &&
      l.awardedPurchaseOrder != null &&
      l.awardedPurchaseOrder.status !== "CANCELLED",
  );
  const orphanIds = lines
    .filter(
      (l) =>
        l.awardedPurchaseOrderId != null &&
        (l.awardedPurchaseOrder == null || l.awardedPurchaseOrder.status === "CANCELLED"),
    )
    .map((l) => l.id);
  if (orphanIds.length > 0) {
    await db.purchaseRequestLine.updateMany({
      where: { id: { in: orphanIds } },
      data: { awardedPurchaseOrderId: null },
    });
  }
  const awardedLineCount = awarded.length;
  const fullyAwarded = totalLineCount > 0 && awardedLineCount === totalLineCount;
  if (!fullyAwarded || awardedLineCount === 0) {
    return { totalLineCount, awardedLineCount, fullyAwarded, allAwardedPosConfirmed: false };
  }
  const poIds = [...new Set(awarded.map((l) => l.awardedPurchaseOrderId!))];
  const confirmedCount = await db.purchaseOrder.count({
    where: { id: { in: poIds }, status: { in: CONFIRMED_PLUS } },
  });
  return {
    totalLineCount,
    awardedLineCount,
    fullyAwarded,
    allAwardedPosConfirmed: confirmedCount === poIds.length,
  };
}

async function syncPurchaseRequestStatusAfterCoverage(
  purchaseRequestId: string,
  ctx: ServiceContext,
  tx: Tx,
): Promise<PurchaseRequestCoverage> {
  const coverage = await computePurchaseRequestCoverage(purchaseRequestId, tx);
  let nextStatus: "SUBMITTED" | "QUOTE_SELECTED" | "COMPLETED";
  if (coverage.fullyAwarded && coverage.allAwardedPosConfirmed) {
    nextStatus = "COMPLETED";
  } else if (coverage.fullyAwarded) {
    nextStatus = "QUOTE_SELECTED";
  } else {
    nextStatus = "SUBMITTED";
  }

  await tx.purchaseRequest.updateMany({
    where: {
      id: purchaseRequestId,
      tenantId: ctx.tenantId,
      status: { in: ["SUBMITTED", "QUOTE_SELECTED", "COMPLETED"] },
    },
    data: { status: nextStatus, updatedBy: ctx.actorUserId },
  });

  if (coverage.fullyAwarded) {
    await finalizeQuoteStatusesOnFullCoverage(purchaseRequestId, tx);
  }

  return coverage;
}

/** Mark contributing quotes SELECTED and unused RECEIVED → REJECTED when coverage is 100%. */
async function finalizeQuoteStatusesOnFullCoverage(
  purchaseRequestId: string,
  tx: Tx,
): Promise<void> {
  const contributing = await tx.purchaseOrder.findMany({
    where: {
      purchaseRequestId,
      status: { not: "CANCELLED" },
      selectedProcurementQuoteId: { not: null },
    },
    select: { selectedProcurementQuoteId: true },
  });
  const contributingIds = [
    ...new Set(
      contributing
        .map((p) => p.selectedProcurementQuoteId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (contributingIds.length > 0) {
    await tx.procurementQuote.updateMany({
      where: { id: { in: contributingIds }, purchaseRequestId },
      data: { status: "SELECTED" },
    });
  }

  await tx.procurementQuote.updateMany({
    where: {
      purchaseRequestId,
      status: { in: ["RECEIVED", "DRAFT"] },
      ...(contributingIds.length > 0 ? { id: { notIn: contributingIds } } : {}),
    },
    data: { status: "REJECTED" },
  });
}

async function rewindQuotesIfNoActiveAwards(
  purchaseRequestId: string,
  tx: Tx,
): Promise<void> {
  const activePos = await tx.purchaseOrder.findMany({
    where: { purchaseRequestId, status: { not: "CANCELLED" } },
    select: { selectedProcurementQuoteId: true },
  });
  const stillUsedQuoteIds = new Set(
    activePos
      .map((p) => p.selectedProcurementQuoteId)
      .filter((id): id is string => Boolean(id)),
  );

  if (activePos.length === 0) {
    await tx.procurementQuote.updateMany({
      where: { purchaseRequestId, status: { in: ["SELECTED", "REJECTED"] } },
      data: { status: "RECEIVED" },
    });
    return;
  }

  // Coverage incomplete: restore REJECTED / orphan SELECTED quotes so free lines can be re-awarded.
  await tx.procurementQuote.updateMany({
    where: {
      purchaseRequestId,
      status: { in: ["SELECTED", "REJECTED"] },
      ...(stillUsedQuoteIds.size > 0 ? { id: { notIn: [...stillUsedQuoteIds] } } : {}),
    },
    data: { status: "RECEIVED" },
  });
}

async function createOnePoFromQuoteLinesInTx(
  tx: Tx,
  ctx: ServiceContext,
  procurementQuoteId: string,
  purchaseRequestLineIds: string[],
  options: {
    skipMinQuotesCheck?: boolean;
    skipPrLock?: boolean;
    /** Pre-allocated OC number (batch awards in one TX). */
    documentNumber?: number;
  } = {},
): Promise<string> {
  const quote = await tx.procurementQuote.findUnique({
    where: { id: procurementQuoteId },
    include: {
      lines: { include: { purchaseRequestLine: true } },
      purchaseRequest: true,
    },
  });
  if (!quote || quote.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Cotización no encontrada");
  }
  if (quote.status !== "RECEIVED" && quote.status !== "SELECTED") {
    throw new ServiceError("CONFLICT", "Solo se pueden adjudicar cotizaciones recibidas");
  }
  const pr = quote.purchaseRequest;
  if (!["SUBMITTED", "QUOTE_SELECTED"].includes(pr.status)) {
    throw new ServiceError("CONFLICT", "Estado de solicitud incompatible");
  }

  if (!options.skipMinQuotesCheck) {
    const settings = await getCompanyProcurementSettings(pr.companyId, ctx);
    const receivedCount = await tx.procurementQuote.count({
      where: {
        purchaseRequestId: pr.id,
        status: { in: ["RECEIVED", "SELECTED"] },
      },
    });
    if (receivedCount < settings.minQuotesRequired) {
      throw new ServiceError(
        "CONFLICT",
        `Se requieren al menos ${settings.minQuotesRequired} cotizaciones recibidas antes de adjudicar`,
      );
    }
  }

  if (quote.validUntil && quote.validUntil < new Date()) {
    throw new ServiceError("CONFLICT", "La cotización está vencida");
  }

  if (!options.skipPrLock) {
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${pr.id} FOR UPDATE`;
  }

  const uniqueLineIds = [...new Set(purchaseRequestLineIds)];
  if (uniqueLineIds.length === 0) {
    throw new ServiceError("VALIDATION", "Seleccioná al menos un ítem");
  }

  const quoteLineByPrLine = new Map(
    quote.lines.map((ql) => [ql.purchaseRequestLineId, ql] as const),
  );

  const prLines = await tx.purchaseRequestLine.findMany({
    where: { purchaseRequestId: pr.id, id: { in: uniqueLineIds } },
  });
  if (prLines.length !== uniqueLineIds.length) {
    throw new ServiceError("CONFLICT", "Hay ítems que no pertenecen a esta solicitud");
  }

  for (const prl of prLines) {
    if (prl.awardedPurchaseOrderId) {
      throw new ServiceError(
        "CONFLICT",
        `El ítem "${prl.description}" ya está adjudicado a otra orden de compra`,
      );
    }
    if (!quoteLineByPrLine.has(prl.id)) {
      throw new ServiceError(
        "CONFLICT",
        `La cotización no incluye el ítem "${prl.description}"`,
      );
    }
  }

  const activeAwardClash = await tx.purchaseOrderLine.findFirst({
    where: {
      purchaseRequestLineId: { in: uniqueLineIds },
      isActiveAward: true,
    },
    select: { id: true, purchaseRequestLineId: true },
  });
  if (activeAwardClash) {
    throw new ServiceError(
      "CONFLICT",
      "Uno o más ítems ya tienen una adjudicación activa en otra orden de compra",
    );
  }

  const wbsIdsForDominant = Array.from(
    new Set(prLines.map((l) => l.wbsNodeId).filter((id): id is string => Boolean(id))),
  );
  const wbsDominant = await loadWbsDominantCostTypes(wbsIdsForDominant, ctx.tenantId);

  let number = options.documentNumber;
  if (number == null) {
    const maxNum = await tx.purchaseOrder.aggregate({
      where: { tenantId: ctx.tenantId, companyId: pr.companyId },
      _max: { number: true },
    });
    number = (maxNum._max.number ?? 0) + 1;
  }

  const po = await tx.purchaseOrder.create({
    data: {
      tenantId: ctx.tenantId,
      companyId: pr.companyId,
      projectId: pr.projectId,
      supplierContactId: quote.supplierContactId,
      purchaseRequestId: pr.id,
      selectedProcurementQuoteId: quote.id,
      originRequestedByUserId: pr.requestedByUserId,
      number,
      issueDate: new Date(),
      currency: quote.currency,
      fxRate: quote.fxRate,
      status: PurchaseOrderStatus.DRAFT,
      createdBy: ctx.actorUserId,
      updatedBy: ctx.actorUserId,
    },
  });

  for (const prl of prLines) {
    const ql = quoteLineByPrLine.get(prl.id)!;
    await tx.purchaseOrderLine.create({
      data: {
        purchaseOrderId: po.id,
        purchaseRequestLineId: prl.id,
        procurementQuoteLineId: ql.id,
        isActiveAward: true,
        wbsNodeId: prl.wbsNodeId,
        costAnalysisLineId: prl.costAnalysisLineId,
        productId: prl.productId,
        costType: resolveLineCostType({
          costType: prl.costType,
          apuCategory: null,
          wbsDominantCostType: prl.wbsNodeId ? wbsDominant.get(prl.wbsNodeId) ?? null : null,
        }),
        description: prl.description,
        unit: prl.unit,
        quantity: prl.quantity,
        unitPrice: ql.unitPrice,
        taxRate: ql.taxRate,
        discountPct: ql.discountPct,
        lineSubtotal: ql.lineSubtotal,
        lineTax: ql.lineTax,
        lineTotal: ql.lineTotal,
        budgetUnitCostSnapshot: prl.budgetUnitCostSnapshot,
        sortOrder: prl.sortOrder,
      },
    });
    await tx.purchaseRequestLine.update({
      where: { id: prl.id },
      data: { awardedPurchaseOrderId: po.id },
    });
  }

  await recalcPurchaseOrderTotals(tx, po.id);

  await auditProcurement(
    ctx,
    "purchase_order.created_from_quote",
    "PurchaseOrder",
    po.id,
    { projectId: pr.projectId, companyId: pr.companyId },
    {
      after: {
        procurementQuoteId: quote.id,
        purchaseRequestId: pr.id,
        lineIds: uniqueLineIds,
      },
      tx,
    },
  );

  await auditProcurement(
    ctx,
    "procurement_quote.selected",
    "ProcurementQuote",
    quote.id,
    { projectId: pr.projectId, companyId: pr.companyId },
    { after: { purchaseOrderId: po.id, lineIds: uniqueLineIds }, tx },
  );

  return po.id;
}

/**
 * Award a subset of free PR lines from one RECEIVED quote → one DRAFT PO.
 */
export async function createPurchaseOrderFromQuoteLines(
  procurementQuoteId: string,
  purchaseRequestLineIds: string[],
  ctx: ServiceContext,
): Promise<{ purchaseOrderId: string }> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para generar órdenes de compra");
  }

  const purchaseOrderId = await prisma.$transaction(async (tx) => {
    const quote = await tx.procurementQuote.findUnique({
      where: { id: procurementQuoteId },
      select: { purchaseRequestId: true, tenantId: true },
    });
    if (!quote || quote.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Cotización no encontrada");
    }
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${quote.purchaseRequestId} FOR UPDATE`;

    const poId = await createOnePoFromQuoteLinesInTx(
      tx,
      ctx,
      procurementQuoteId,
      purchaseRequestLineIds,
      { skipPrLock: true },
    );
    const coverage = await syncPurchaseRequestStatusAfterCoverage(
      quote.purchaseRequestId,
      ctx,
      tx,
    );
    if (coverage.fullyAwarded) {
      const prRow = await tx.purchaseRequest.findUnique({
        where: { id: quote.purchaseRequestId },
        select: { projectId: true, companyId: true },
      });
      await auditProcurement(
        ctx,
        "purchase_request.fully_awarded",
        "PurchaseRequest",
        quote.purchaseRequestId,
        { projectId: prRow?.projectId, companyId: prRow?.companyId },
        { after: coverage, tx },
      );
    }
    return poId;
  });

  return { purchaseOrderId };
}

/**
 * Batch award: one transaction creating N DRAFT POs (one per quote group).
 */
export async function createPurchaseOrdersFromAwards(
  purchaseRequestId: string,
  groups: Array<{ procurementQuoteId: string; purchaseRequestLineIds: string[] }>,
  ctx: ServiceContext,
): Promise<{ purchaseOrderIds: string[] }> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para generar órdenes de compra");
  }
  if (groups.length === 0) {
    throw new ServiceError("VALIDATION", "Seleccioná al menos un proveedor con ítems");
  }

  const allLineIds = groups.flatMap((g) => g.purchaseRequestLineIds);
  if (new Set(allLineIds).size !== allLineIds.length) {
    throw new ServiceError("CONFLICT", "Un mismo ítem no puede adjudicarse a dos proveedores");
  }

  const purchaseOrderIds = await prisma.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.findUnique({ where: { id: purchaseRequestId } });
    if (!pr || pr.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
    }
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${purchaseRequestId} FOR UPDATE`;

    const settings = await getCompanyProcurementSettings(pr.companyId, ctx);
    const receivedCount = await tx.procurementQuote.count({
      where: {
        purchaseRequestId,
        status: { in: ["RECEIVED", "SELECTED"] },
      },
    });
    if (receivedCount < settings.minQuotesRequired) {
      throw new ServiceError(
        "CONFLICT",
        `Se requieren al menos ${settings.minQuotesRequired} cotizaciones recibidas antes de adjudicar`,
      );
    }

    const maxNum = await tx.purchaseOrder.aggregate({
      where: { tenantId: ctx.tenantId, companyId: pr.companyId },
      _max: { number: true },
    });
    let nextNumber = (maxNum._max.number ?? 0) + 1;

    const ids: string[] = [];
    for (const group of groups) {
      const quote = await tx.procurementQuote.findUnique({
        where: { id: group.procurementQuoteId },
        select: { purchaseRequestId: true },
      });
      if (!quote || quote.purchaseRequestId !== purchaseRequestId) {
        throw new ServiceError("CONFLICT", "La cotización no pertenece a esta solicitud");
      }
      const poId = await createOnePoFromQuoteLinesInTx(
        tx,
        ctx,
        group.procurementQuoteId,
        group.purchaseRequestLineIds,
        {
          skipMinQuotesCheck: true,
          skipPrLock: true,
          documentNumber: nextNumber,
        },
      );
      nextNumber += 1;
      ids.push(poId);
    }

    const coverage = await syncPurchaseRequestStatusAfterCoverage(purchaseRequestId, ctx, tx);
    if (coverage.fullyAwarded) {
      await auditProcurement(
        ctx,
        "purchase_request.fully_awarded",
        "PurchaseRequest",
        purchaseRequestId,
        { projectId: pr.projectId, companyId: pr.companyId },
        { after: coverage, tx },
      );
    }
    return ids;
  });

  return { purchaseOrderIds };
}

/**
 * Legacy: award all still-free lines from the quote onto one DRAFT PO.
 */
export async function selectProcurementQuoteAndCreatePo(
  procurementQuoteId: string,
  ctx: ServiceContext,
): Promise<{ purchaseOrderId: string }> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseOrders(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para generar órdenes de compra");
  }

  const quote = await prisma.procurementQuote.findUnique({
    where: { id: procurementQuoteId },
    include: {
      lines: true,
      purchaseRequest: { include: { lines: true } },
    },
  });
  if (!quote || quote.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Cotización no encontrada");
  }

  const freeLineIds = quote.purchaseRequest.lines
    .filter((l) => !l.awardedPurchaseOrderId)
    .map((l) => l.id)
    .filter((id) => quote.lines.some((ql) => ql.purchaseRequestLineId === id));

  if (freeLineIds.length === 0) {
    throw new ServiceError(
      "CONFLICT",
      "No quedan ítems libres para adjudicar de esta cotización",
    );
  }

  return createPurchaseOrderFromQuoteLines(procurementQuoteId, freeLineIds, ctx);
}

export async function onPurchaseOrderConfirmed(
  purchaseOrderId: string,
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { purchaseRequestId: true, projectId: true, companyId: true },
  });
  if (!po?.purchaseRequestId) return;

  await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${po.purchaseRequestId} FOR UPDATE`;
  await syncPurchaseRequestStatusAfterCoverage(po.purchaseRequestId, ctx, tx);
}

/**
 * When a linked OC is cancelled, free awarded lines and recalculate SC status
 * (including from COMPLETED).
 */
export async function onPurchaseOrderCancelledLinkedToRequest(
  purchaseOrderId: string,
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { purchaseRequestId: true, selectedProcurementQuoteId: true },
  });
  if (!po?.purchaseRequestId) return;

  await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${po.purchaseRequestId} FOR UPDATE`;

  // Clear quote-line FK so edit/delete cotización works after Anular ([BR-PUR-024]).
  // Keep purchaseRequestLineId for history; isActiveAward=false frees the partial unique.
  await tx.purchaseOrderLine.updateMany({
    where: { purchaseOrderId },
    data: { isActiveAward: false, procurementQuoteLineId: null },
  });

  await tx.purchaseRequestLine.updateMany({
    where: { awardedPurchaseOrderId: purchaseOrderId },
    data: { awardedPurchaseOrderId: null },
  });

  await rewindQuotesIfNoActiveAwards(po.purchaseRequestId, tx);
  await syncPurchaseRequestStatusAfterCoverage(po.purchaseRequestId, ctx, tx);
}

/** @deprecated Use onPurchaseOrderCancelledLinkedToRequest */
export async function onPurchaseOrderDraftCancelled(
  purchaseOrderId: string,
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
): Promise<void> {
  return onPurchaseOrderCancelledLinkedToRequest(purchaseOrderId, ctx, tx);
}

/**
 * Quote-sourced OC: qty/price cannot exceed the awarded quote lines / SC lines.
 * Matches by purchaseRequestLineId (subset OK). Forbids add/remove of SC-linked lines.
 */
export async function assertPoLinesWithinSelectedQuote(
  purchaseOrderId: string,
  lines: Array<{
    description: string;
    wbsNodeId: string | null;
    quantity: string | Prisma.Decimal;
    unitPrice: string | Prisma.Decimal;
    discountPct?: string | Prisma.Decimal;
    sortOrder?: number;
    purchaseRequestLineId?: string | null;
  }>,
  tenantId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      selectedProcurementQuoteId: true,
      purchaseRequestId: true,
      tenantId: true,
      lines: {
        where: { isActiveAward: true },
        select: {
          purchaseRequestLineId: true,
          procurementQuoteLineId: true,
          sortOrder: true,
        },
      },
    },
  });
  if (!po || po.tenantId !== tenantId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  }
  if (!po.selectedProcurementQuoteId || !po.purchaseRequestId) return;

  const awardedPrLineIds = po.lines
    .map((l) => l.purchaseRequestLineId)
    .filter((id): id is string => Boolean(id));

  if (awardedPrLineIds.length === 0) {
    // Legacy PO without backfill FKs — fall back to sortOrder full-quote check.
    const quote = await db.procurementQuote.findUnique({
      where: { id: po.selectedProcurementQuoteId },
      include: {
        lines: {
          include: { purchaseRequestLine: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!quote) {
      throw new ServiceError("CONFLICT", "La cotización seleccionada ya no existe");
    }
    const sorted = [...lines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (sorted.length !== quote.lines.length) {
      throw new ServiceError(
        "CONFLICT",
        "La OC proveniente de cotización debe conservar las mismas líneas que la cotización seleccionada",
      );
    }
    for (let i = 0; i < quote.lines.length; i++) {
      assertLineCeilings(sorted[i]!, quote.lines[i]!);
    }
    return;
  }

  if (lines.length !== awardedPrLineIds.length) {
    throw new ServiceError(
      "CONFLICT",
      "No se pueden agregar ni quitar ítems de una OC generada desde solicitud de compra",
    );
  }

  const inputPrIds = lines.map((l) => l.purchaseRequestLineId).filter((id): id is string => Boolean(id));
  if (inputPrIds.length !== lines.length) {
    throw new ServiceError(
      "CONFLICT",
      "Las líneas de una OC adjudicada deben conservar el vínculo con la solicitud",
    );
  }
  const awardedSet = new Set(awardedPrLineIds);
  for (const id of inputPrIds) {
    if (!awardedSet.has(id)) {
      throw new ServiceError(
        "CONFLICT",
        "No se pueden cambiar los ítems adjudicados de la solicitud",
      );
    }
  }
  if (new Set(inputPrIds).size !== inputPrIds.length) {
    throw new ServiceError("CONFLICT", "Hay ítems duplicados en la orden de compra");
  }

  const quoteLines = await db.procurementQuoteLine.findMany({
    where: {
      procurementQuoteId: po.selectedProcurementQuoteId,
      purchaseRequestLineId: { in: awardedPrLineIds },
    },
    include: { purchaseRequestLine: true },
  });
  const byPrLine = new Map(quoteLines.map((ql) => [ql.purchaseRequestLineId, ql]));

  for (const line of lines) {
    const prLineId = line.purchaseRequestLineId!;
    const ql = byPrLine.get(prLineId);
    if (!ql) {
      throw new ServiceError(
        "CONFLICT",
        `La línea "${line.description}" no corresponde a la cotización adjudicada`,
      );
    }
    assertLineCeilings(line, ql);
  }
}

function assertLineCeilings(
  line: {
    description: string;
    wbsNodeId: string | null;
    quantity: string | Prisma.Decimal;
    unitPrice: string | Prisma.Decimal;
    discountPct?: string | Prisma.Decimal;
  },
  ql: {
    unitPrice: Prisma.Decimal;
    discountPct: Prisma.Decimal;
    purchaseRequestLine: {
      wbsNodeId: string | null;
      quantity: Prisma.Decimal;
      description: string;
    };
  },
): void {
  const prl = ql.purchaseRequestLine;
  const qty = new Prisma.Decimal(line.quantity);
  const price = new Prisma.Decimal(line.unitPrice);
  const discountPct = parseDiscountPct(
    line.discountPct == null ? undefined : String(line.discountPct),
  );

  if (line.wbsNodeId && prl.wbsNodeId && line.wbsNodeId !== prl.wbsNodeId) {
    throw new ServiceError(
      "CONFLICT",
      `La línea "${line.description}" no puede cambiar de partida EDT respecto de la solicitud`,
    );
  }
  if (qty.greaterThan(prl.quantity)) {
    throw new ServiceError(
      "CONFLICT",
      `La cantidad de "${line.description}" no puede superar la solicitada (${prl.quantity})`,
    );
  }
  if (price.greaterThan(ql.unitPrice)) {
    throw new ServiceError(
      "CONFLICT",
      `El precio de "${line.description}" no puede superar el de la cotización seleccionada (${ql.unitPrice})`,
    );
  }
  const quoteEffective = effectiveUnitPriceNet({
    quantity: qty.toString(),
    unitPriceNet: ql.unitPrice.toString(),
    discountPct: ql.discountPct.toString(),
  });
  const poEffective = effectiveUnitPriceNet({
    quantity: qty.toString(),
    unitPriceNet: price.toString(),
    discountPct: discountPct.toString(),
  });
  if (new Prisma.Decimal(poEffective).greaterThan(new Prisma.Decimal(quoteEffective))) {
    throw new ServiceError(
      "CONFLICT",
      `El precio con descuento de "${line.description}" no puede superar el de la cotización seleccionada`,
    );
  }
}

export async function assertQuoteNotFrozenByActivePo(
  procurementQuoteId: string,
  tenantId: string,
  db: Tx | typeof prisma = prisma,
): Promise<void> {
  const active = await db.purchaseOrder.count({
    where: {
      tenantId,
      selectedProcurementQuoteId: procurementQuoteId,
      status: { not: "CANCELLED" },
    },
  });
  if (active > 0) {
    throw new ServiceError(
      "CONFLICT",
      "Esta cotización ya generó una orden de compra activa; no se puede editar ni eliminar",
    );
  }
}
