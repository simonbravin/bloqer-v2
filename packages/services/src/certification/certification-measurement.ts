import { Prisma, prisma, type CostCategory } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { SaveCertificationMeasurementInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { canViewArProjectArea } from "../ar/ar-access";
import { sortByWbsCode } from "../budget/wbs-code-rules";
import { getProjectCostControl } from "../cost-control/cost-control.service";
import type { CostControlRow } from "../cost-control/cost-control-types";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
  toMoneyDecimal,
} from "../finance/money-decimal";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { requireProjectAccess } from "../security/access";
import { ServiceContext, ServiceError } from "../types";
import { _computePreviousQty, _recalcCertificationTotals } from "./certification-calc.service";
import { assertCertificationEditable } from "./certification.service";
import {
  aggregateJobsiteProgress,
  emptyJobsiteProgress,
  parseMeasurementPhysicalPct,
  parseMeasurementQty,
  suggestPeriodCertQty,
  suggestPeriodPhysicalPct,
  type JobsiteProgressTotals,
} from "./certification-measurement-pure";

export type CertificationMeasurementCost = {
  committedCost: string;
  consumedCost: string;
  laborCost: string;
  equipmentCost: string;
  subcontractCost: string;
};

export type CertificationMeasurementRow = {
  wbsNodeId: string;
  code: string;
  name: string;
  unit: string;
  budgetQty: string;
  previousQty: string;
  remainingQty: string;
  unitSalePrice: string;
  logQtyAcum: string;
  logPctAcum: string;
  logQtyPeriod: string;
  logPctPeriod: string;
  /** min(libro del período, saldo). Not applied until the user confirms. */
  suggestedQty: string | null;
  /** Period physical % clamped to 100 for the certificate field. */
  suggestedPhysicalPct: string | null;
  cost: CertificationMeasurementCost | null;
  lineId: string | null;
  currentQty: string | null;
  physicalPct: string | null;
};

export type CertificationMeasurementSheet = {
  certificationId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  costAvailable: boolean;
  rows: CertificationMeasurementRow[];
};

export type CertificationCollectionAccount = {
  id: string;
  accountName: string;
  amount: string;
};

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function bucketCommitted(row: CostControlRow, category: CostCategory): string {
  return row.byCostType.find((b) => b.costType === category)?.committedCost ?? "0.00";
}

function costFromRow(row: CostControlRow): CertificationMeasurementCost {
  return {
    committedCost: row.committedCost,
    consumedCost: row.inventoryConsumedCost,
    laborCost: bucketCommitted(row, "LABOR"),
    equipmentCost: bucketCommitted(row, "EQUIPMENT"),
    subcontractCost: bucketCommitted(row, "SUBCONTRACT"),
  };
}

/**
 * Read-only measurement sheet for a draft certification.
 * Contract remainder, approved jobsite log (cumulative and in-period), and period cost layers.
 * Cost stays null when the caller cannot read control de costos. Nothing here is persisted.
 */
export async function getCertificationMeasurementSheet(
  certificationId: string,
  ctx: ServiceContext,
): Promise<CertificationMeasurementSheet> {
  if (!can(ctx.roles, "VIEW", "CERTIFICATIONS") && !can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la planilla de certificación");
  }

  const cert = await prisma.certification.findUnique({
    where: { id: certificationId },
    select: {
      id: true,
      tenantId: true,
      projectId: true,
      budgetId: true,
      periodStart: true,
      periodEnd: true,
      budget: { select: { currency: true } },
      lines: {
        select: { id: true, wbsNodeId: true, currentQty: true, physicalPct: true },
      },
    },
  });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await requireProjectAccess(cert.projectId, ctx);

  const periodStart = utcDateKey(cert.periodStart);
  const periodEnd = utcDateKey(cert.periodEnd);

  const nodes = sortByWbsCode(
    await prisma.wbsNode.findMany({
      where: { budgetId: cert.budgetId, type: "ITEM", costItem: { isNot: null } },
      select: {
        id: true,
        code: true,
        name: true,
        costItem: { select: { unit: true, quantity: true, unitSalePrice: true } },
      },
    }),
  );
  const nodeIds = nodes.map((n) => n.id);

  const previousRows =
    nodeIds.length > 0
      ? await prisma.certificationLine.findMany({
          where: {
            wbsNodeId: { in: nodeIds },
            certificationId: { not: cert.id },
            certification: {
              tenantId: ctx.tenantId,
              status: { in: ["ISSUED", "APPROVED"] },
            },
          },
          select: { wbsNodeId: true, currentQty: true },
        })
      : [];
  const previousByWbs = new Map<string, Prisma.Decimal>();
  for (const row of previousRows) {
    const prev = previousByWbs.get(row.wbsNodeId) ?? new Prisma.Decimal(0);
    previousByWbs.set(row.wbsNodeId, prev.plus(row.currentQty));
  }

  const progressRows =
    nodeIds.length > 0
      ? await prisma.jobsiteLogProgress.findMany({
          where: {
            wbsNodeId: { in: nodeIds },
            jobsiteLog: {
              projectId: cert.projectId,
              tenantId: ctx.tenantId,
              status: "APPROVED",
            },
          },
          select: {
            wbsNodeId: true,
            quantityCompleted: true,
            physicalPct: true,
            jobsiteLog: { select: { logDate: true } },
          },
        })
      : [];
  const progressByWbs = aggregateJobsiteProgress(
    progressRows.map((p) => ({
      wbsNodeId: p.wbsNodeId,
      logDate: utcDateKey(p.jobsiteLog.logDate),
      quantityCompleted: p.quantityCompleted.toString(),
      physicalPct: p.physicalPct == null ? null : p.physicalPct.toString(),
    })),
    periodStart,
    periodEnd,
  );

  const costByWbs = new Map<string, CertificationMeasurementCost>();
  let costAvailable = false;
  try {
    const report = await getProjectCostControl(
      cert.projectId,
      { budgetId: cert.budgetId, dateFrom: periodStart, dateTo: periodEnd },
      ctx,
    );
    if (report.type === "REPORT") {
      costAvailable = true;
      for (const row of report.rows) costByWbs.set(row.wbsNodeId, costFromRow(row));
    }
  } catch (err) {
    // The certificate must open even when the cost report cannot. Cost stays blank.
    if (!(err instanceof ServiceError)) throw err;
  }

  const ownByWbs = new Map(cert.lines.map((l) => [l.wbsNodeId, l]));
  const rows: CertificationMeasurementRow[] = [];
  for (const n of nodes) {
    if (!n.costItem) continue;
    const previousQty = previousByWbs.get(n.id) ?? new Prisma.Decimal(0);
    const budgetQty = n.costItem.quantity;
    const remaining = Prisma.Decimal.max(new Prisma.Decimal(0), budgetQty.minus(previousQty));
    const progress: JobsiteProgressTotals = progressByWbs.get(n.id) ?? emptyJobsiteProgress();
    const own = ownByWbs.get(n.id);
    const remainingQty = serializeQtyDecimal(remaining);
    rows.push({
      wbsNodeId: n.id,
      code: n.code,
      name: n.name,
      unit: n.costItem.unit,
      budgetQty: serializeQtyDecimal(budgetQty),
      previousQty: serializeQtyDecimal(previousQty),
      remainingQty,
      unitSalePrice: serializeUnitPriceDecimal(n.costItem.unitSalePrice),
      logQtyAcum: progress.qtyAcum,
      logPctAcum: progress.pctAcum,
      logQtyPeriod: progress.qtyPeriod,
      logPctPeriod: progress.pctPeriod,
      suggestedQty: suggestPeriodCertQty(progress.qtyPeriod, remainingQty),
      suggestedPhysicalPct: suggestPeriodPhysicalPct(progress.pctPeriod),
      cost: costAvailable ? (costByWbs.get(n.id) ?? {
        committedCost: "0.00",
        consumedCost: "0.00",
        laborCost: "0.00",
        equipmentCost: "0.00",
        subcontractCost: "0.00",
      }) : null,
      lineId: own?.id ?? null,
      currentQty: own ? serializeQtyDecimal(own.currentQty) : null,
      physicalPct: own ? serializeRatePctDecimal(own.physicalPct) : null,
    });
  }

  return {
    certificationId: cert.id,
    periodStart,
    periodEnd,
    currency: cert.budget.currency,
    costAvailable,
    rows,
  };
}

/**
 * Persist included worksheet rows in one transaction.
 * Reuses the line math of add/update (sale-price snapshot, previous qty, period amount).
 * An included row with quantity 0 is rejected and writes nothing.
 */
export async function saveCertificationMeasurement(
  input: SaveCertificationMeasurementInput,
  ctx: ServiceContext,
): Promise<void> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar la planilla de certificación");
  }

  const seen = new Set<string>();
  for (const row of input.rows) {
    if (seen.has(row.wbsNodeId)) {
      throw new ServiceError("VALIDATION", "Hay una partida repetida en la planilla");
    }
    seen.add(row.wbsNodeId);
    if (!row.included) continue;
    if (!parseMeasurementQty(row.currentQty)) {
      throw new ServiceError(
        "VALIDATION",
        "Indicá una cantidad mayor a 0 en cada partida incluida. Las filas en cero no se guardan.",
      );
    }
    if (parseMeasurementPhysicalPct(row.physicalPct) == null) {
      throw new ServiceError("VALIDATION", "El % físico debe estar entre 0 y 100");
    }
  }

  const cert = await prisma.certification.findUnique({ where: { id: input.certificationId } });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(cert.projectId, ctx);
  assertCertificationEditable(cert);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.certificationLine.findMany({
      where: { certificationId: cert.id },
    });
    const existingByWbs = new Map(existing.map((l) => [l.wbsNodeId, l]));

    let sortOrder = 0;
    for (const row of input.rows) {
      const line = existingByWbs.get(row.wbsNodeId);
      if (!row.included) {
        if (line) await tx.certificationLine.delete({ where: { id: line.id } });
        continue;
      }

      const currentQty = new Prisma.Decimal(parseMeasurementQty(row.currentQty)!);
      const physicalPct = new Prisma.Decimal(parseMeasurementPhysicalPct(row.physicalPct)!);
      const previousQty = await _computePreviousQty(tx as never, row.wbsNodeId, cert.id, ctx.tenantId);
      sortOrder += 1;

      if (line) {
        const periodAmount = toMoneyDecimal(currentQty.times(line.unitSalePriceSnapshot));
        await tx.certificationLine.update({
          where: { id: line.id },
          data: {
            physicalPct,
            currentQty,
            previousQty,
            cumulativeQty: previousQty.plus(currentQty),
            periodAmount,
            sortOrder,
          },
        });
        continue;
      }

      const wbsNode = await tx.wbsNode.findUnique({
        where: { id: row.wbsNodeId },
        include: { costItem: true },
      });
      if (!wbsNode || wbsNode.budgetId !== cert.budgetId || wbsNode.type !== "ITEM" || !wbsNode.costItem) {
        throw new ServiceError("CONFLICT", "La partida no pertenece al presupuesto de esta certificación");
      }
      const unitSalePriceSnapshot = wbsNode.costItem.unitSalePrice;
      await tx.certificationLine.create({
        data: {
          certificationId: cert.id,
          wbsNodeId: row.wbsNodeId,
          unitSalePriceSnapshot,
          budgetQty: wbsNode.costItem.quantity,
          physicalPct,
          previousQty,
          currentQty,
          cumulativeQty: previousQty.plus(currentQty),
          periodAmount: toMoneyDecimal(currentQty.times(unitSalePriceSnapshot)),
          sortOrder,
        },
      });
    }

    await _recalcCertificationTotals(tx as never, cert.id);
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "certification.measurement_saved",
    entityType: "Certification",
    entityId: cert.id,
    after: { rows: input.rows.length },
    ipAddress: ctx.ipAddress,
  });
}

/** Confirmed collections of the active sales invoice, for the read-only money trail. */
export async function listCertificationCollectionAccounts(
  certificationId: string,
  ctx: ServiceContext,
): Promise<CertificationCollectionAccount[]> {
  if (!can(ctx.roles, "VIEW", "CERTIFICATIONS") && !can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la certificación");
  }
  if (!canViewArProjectArea(ctx.roles)) return [];

  const cert = await prisma.certification.findUnique({
    where: { id: certificationId },
    select: { id: true, tenantId: true, projectId: true },
  });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await requireProjectAccess(cert.projectId, ctx);

  const collections = await prisma.collection.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "CONFIRMED",
      salesInvoice: { certificationId, tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
    },
    select: {
      id: true,
      amount: true,
      account: { select: { name: true } },
    },
    orderBy: { collectionDate: "asc" },
  });

  return collections.map((c) => ({
    id: c.id,
    accountName: c.account.name,
    amount: serializeMoneyDecimal(c.amount),
  }));
}
