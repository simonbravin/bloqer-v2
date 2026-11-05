import { Prisma, prisma } from "@bloqer/database";

import {
  addCertificationLineSchema,
  updateCertificationLineSchema,
  type AddCertificationLineInput,
  type UpdateCertificationLineInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import {
  serializeQtyDecimal,
  serializeUnitPriceDecimal,
  toMoneyDecimal,
} from "../finance/money-decimal";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { assertCertificationStatusEditable } from "./certification-guards";
import { authorizeCertification, requireCertificationAccess } from "./certification-scope";
import {
  _validateCertificationMeasurement,
  _lockEditableCertification,
  _recalcCertificationTotals,
} from "./certification-calc.service";
import { sortByWbsCode } from "../budget/wbs-code-rules";

export type CertificationWbsHint = {
  id: string;
  code: string;
  name: string;
  unit: string;
  budgetQty: string;
  previousQty: string;
  remainingQty: string;
  unitSalePrice: string;
};

/**
 * WBS ITEM hints for certification line forms: budget / previously certified / remaining.
 * previousQty uses the same rule as line create (ISSUED + APPROVED, excluding this cert).
 */
export async function listCertificationWbsHints(
  certificationId: string,
  ctx: ServiceContext,
): Promise<CertificationWbsHint[]> {
  await authorizeCertification(ctx, "VIEW");
  const cert = await requireCertificationAccess(certificationId, ctx);

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

  const hints: CertificationWbsHint[] = [];
  for (const n of nodes) {
    if (!n.costItem) continue;
    const previousQty = previousByWbs.get(n.id) ?? new Prisma.Decimal(0);
    const budgetQty = n.costItem.quantity;
    const remaining = Prisma.Decimal.max(new Prisma.Decimal(0), budgetQty.minus(previousQty));
    hints.push({
      id: n.id,
      code: n.code,
      name: n.name,
      unit: n.costItem.unit,
      budgetQty: serializeQtyDecimal(budgetQty),
      previousQty: serializeQtyDecimal(previousQty),
      remainingQty: serializeQtyDecimal(remaining),
      unitSalePrice: serializeUnitPriceDecimal(n.costItem.unitSalePrice),
    });
  }
  return hints;
}

async function _guardLine(certificationId: string, ctx: ServiceContext) {
  const cert = await requireCertificationAccess(certificationId, ctx);
  assertCertificationStatusEditable(cert.status);
  await assertProjectAllowsOperationalMutation(cert.projectId, ctx);
  return cert;
}

export async function addCertificationLine(
  input: AddCertificationLineInput,
  ctx: ServiceContext,
): Promise<{ id: string }> {
  await authorizeCertification(ctx, "EDIT");
  const parsed = addCertificationLineSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  input = parsed.data;
  const cert = await _guardLine(input.certificationId, ctx);

  const line = await prisma.$transaction(
    async (tx) => {
      const current = await _lockEditableCertification(tx, cert.id, ctx);
      if (current.lines.some((line) => line.wbsNodeId === input.wbsNodeId))
        throw new ServiceError("CONFLICT", "La partida ya está incluida en esta certificación");
      const currentQty = new Prisma.Decimal(input.currentQty).toDecimalPlaces(
        4,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const physicalPct = new Prisma.Decimal(input.physicalPct).toDecimalPlaces(
        4,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const { previousQty, budgetQty, costItem } = await _validateCertificationMeasurement(
        tx,
        cert,
        input.wbsNodeId,
        currentQty,
        physicalPct,
      );
      const unitSalePriceSnapshot = costItem.unitSalePrice;
      const cumulativeQty = previousQty.plus(currentQty);
      const periodAmount = toMoneyDecimal(currentQty.times(unitSalePriceSnapshot));

      const l = await tx.certificationLine.create({
        data: {
          certificationId: input.certificationId,
          wbsNodeId: input.wbsNodeId,
          unitSalePriceSnapshot,
          budgetQty,
          physicalPct,
          previousQty,
          currentQty,
          cumulativeQty,
          periodAmount,
          notes: input.notes ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await _recalcCertificationTotals(tx, input.certificationId, ctx.actorUserId);
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: current.companyId,
          projectId: current.projectId,
          actorUserId: ctx.actorUserId,
          action: "certification_line.added",
          entityType: "CertificationLine",
          entityId: l.id,
          after: { wbsNodeId: input.wbsNodeId, certificationId: input.certificationId },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
      return l;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  return { id: line.id };
}

export async function updateCertificationLine(
  lineId: string,
  input: UpdateCertificationLineInput,
  ctx: ServiceContext,
): Promise<void> {
  await authorizeCertification(ctx, "EDIT");
  const parsed = updateCertificationLineSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  input = parsed.data;
  const existing = await prisma.certificationLine.findUnique({ where: { id: lineId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Línea de certificación no encontrada");
  await _guardLine(existing.certificationId, ctx);

  await prisma.$transaction(
    async (tx) => {
      const cert = await _lockEditableCertification(tx, existing.certificationId, ctx);
      const live = cert.lines.find((line) => line.id === lineId);
      if (!live)
        throw new ServiceError("CONFLICT", "La partida fue quitada. Recargá la certificación.");
      const newCurrentQty =
        input.currentQty !== undefined
          ? new Prisma.Decimal(input.currentQty).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
          : live.currentQty;

      const physicalPct =
        input.physicalPct !== undefined
          ? new Prisma.Decimal(input.physicalPct).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
          : live.physicalPct;
      const { previousQty, budgetQty } = await _validateCertificationMeasurement(
        tx,
        cert,
        live.wbsNodeId,
        newCurrentQty,
        physicalPct,
      );
      const cumulativeQty = previousQty.plus(newCurrentQty);
      const periodAmount = toMoneyDecimal(newCurrentQty.times(live.unitSalePriceSnapshot));

      await tx.certificationLine.update({
        where: { id: lineId },
        data: {
          physicalPct,
          budgetQty,
          currentQty: newCurrentQty,
          previousQty,
          cumulativeQty,
          periodAmount,
          notes: input.notes,
          sortOrder: input.sortOrder ?? undefined,
        },
      });
      await _recalcCertificationTotals(tx, existing.certificationId, ctx.actorUserId);
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: cert.companyId,
          projectId: cert.projectId,
          actorUserId: ctx.actorUserId,
          action: "certification_line.updated",
          entityType: "CertificationLine",
          entityId: lineId,
          after: input,
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

export async function removeCertificationLine(lineId: string, ctx: ServiceContext): Promise<void> {
  await authorizeCertification(ctx, "EDIT");
  const existing = await prisma.certificationLine.findUnique({ where: { id: lineId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Línea de certificación no encontrada");
  await _guardLine(existing.certificationId, ctx);

  await prisma.$transaction(
    async (tx) => {
      const current = await _lockEditableCertification(tx, existing.certificationId, ctx);
      if (!current.lines.some((line) => line.id === lineId))
        throw new ServiceError("CONFLICT", "La partida fue quitada. Recargá la certificación.");
      await tx.certificationLine.delete({ where: { id: lineId } });
      await _recalcCertificationTotals(tx, existing.certificationId, ctx.actorUserId);
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: current.companyId,
          projectId: current.projectId,
          actorUserId: ctx.actorUserId,
          action: "certification_line.removed",
          entityType: "CertificationLine",
          entityId: lineId,
          after: { certificationId: existing.certificationId },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

export async function refreshPreviousQty(certId: string, ctx: ServiceContext): Promise<void> {
  await authorizeCertification(ctx, "EDIT");
  const cert = await _guardLine(certId, ctx);

  await prisma.$transaction(
    async (tx) => {
      const current = await _lockEditableCertification(tx, certId, ctx);
      const lines = await tx.certificationLine.findMany({ where: { certificationId: certId } });
      for (const line of lines) {
        const { previousQty, budgetQty } = await _validateCertificationMeasurement(
          tx,
          cert,
          line.wbsNodeId,
          line.currentQty,
          line.physicalPct,
        );
        const cumulativeQty = previousQty.plus(line.currentQty);
        const periodAmount = toMoneyDecimal(line.currentQty.times(line.unitSalePriceSnapshot));
        await tx.certificationLine.update({
          where: { id: line.id },
          data: { previousQty, cumulativeQty, periodAmount, budgetQty },
        });
      }
      await _recalcCertificationTotals(tx, certId, ctx.actorUserId);
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: current.companyId,
          projectId: current.projectId,
          actorUserId: ctx.actorUserId,
          action: "certification.measurement_saved",
          entityType: "Certification",
          entityId: certId,
          after: { rows: lines.length, refreshedPreviousQty: true },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
