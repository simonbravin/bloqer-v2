import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { AddCertificationLineInput, UpdateCertificationLineInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { serializeQtyDecimal, serializeUnitPriceDecimal, toMoneyDecimal } from "../finance/money-decimal";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { requireProjectAccess } from "../security/access";
import { assertCertificationEditable } from "./certification.service";
import { _validateCertificationMeasurement, _lockEditableCertification, _recalcCertificationTotals } from "./certification-calc.service";
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
  if (!can(ctx.roles, "VIEW", "CERTIFICATIONS") && !can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver ítems de certificación");
  }
  const cert = await prisma.certification.findUnique({
    where: { id: certificationId },
    select: { id: true, tenantId: true, budgetId: true, projectId: true },
  });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await requireProjectAccess(cert.projectId, ctx);

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
  const cert = await prisma.certification.findUnique({ where: { id: certificationId } });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertCertificationEditable(cert);
  await assertProjectAllowsOperationalMutation(cert.projectId, ctx);
  return cert;
}

export async function addCertificationLine(
  input: AddCertificationLineInput,
  ctx: ServiceContext,
): Promise<{ id: string }> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para agregar líneas de certificación");
  }
  const cert = await _guardLine(input.certificationId, ctx);

  // Validate wbsNode: must be ITEM type, must belong to cert's budget + tenant
  const wbsNode = await prisma.wbsNode.findUnique({
    where: { id: input.wbsNodeId },
    include: {
      costItem: true,
      budget: { select: { tenantId: true } },
    },
  });
  if (!wbsNode) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");
  if (wbsNode.budget.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (wbsNode.budgetId !== cert.budgetId) {
    throw new ServiceError("CONFLICT", "El nodo EDT no pertenece al presupuesto de esta certificación");
  }
  if (wbsNode.type !== "ITEM") {
    throw new ServiceError("CONFLICT", "Solo se pueden certificar nodos de tipo ITEM (BR-WBS-001)");
  }
  if (!wbsNode.costItem) {
    throw new ServiceError("CONFLICT", "El nodo ITEM no tiene datos de costo asociados");
  }

  const line = await prisma.$transaction(async (tx) => {
    await _lockEditableCertification(tx, cert.id, ctx.tenantId);
    const currentQty = new Prisma.Decimal(input.currentQty);
    const physicalPct = new Prisma.Decimal(input.physicalPct);
    const { previousQty, budgetQty, costItem } = await _validateCertificationMeasurement(tx, cert, input.wbsNodeId, currentQty, physicalPct);
    const unitSalePriceSnapshot = costItem.unitSalePrice;
    const cumulativeQty = previousQty.plus(currentQty);
    const periodAmount = toMoneyDecimal(currentQty.times(unitSalePriceSnapshot));

    const l = await tx.certificationLine.create({
      data: {
        certificationId: input.certificationId,
        wbsNodeId:       input.wbsNodeId,
        unitSalePriceSnapshot,
        budgetQty,
        physicalPct,
        previousQty,
        currentQty,
        cumulativeQty,
        periodAmount,
        notes:     input.notes ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    await _recalcCertificationTotals(tx as never, input.certificationId);
    return l;
  }, { timeout: 30_000, maxWait: 10_000 });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "certification_line.added",
    entityType: "CertificationLine",
    entityId: line.id,
    after: { wbsNodeId: input.wbsNodeId, certificationId: input.certificationId },
    ipAddress: ctx.ipAddress,
  });

  return { id: line.id };
}

export async function updateCertificationLine(
  lineId: string,
  input: UpdateCertificationLineInput,
  ctx: ServiceContext,
): Promise<void> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar líneas de certificación");
  }
  const existing = await prisma.certificationLine.findUnique({ where: { id: lineId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Línea de certificación no encontrada");
  await _guardLine(existing.certificationId, ctx);

  await prisma.$transaction(async (tx) => {
    const cert = await _lockEditableCertification(tx, existing.certificationId, ctx.tenantId);
    const live = await tx.certificationLine.findUnique({ where: { id: lineId } });
    if (!live) throw new ServiceError("CONFLICT", "La partida fue quitada. Recargá la certificación.");
    const newCurrentQty = input.currentQty !== undefined
      ? new Prisma.Decimal(input.currentQty)
      : live.currentQty;

    const physicalPct = input.physicalPct !== undefined ? new Prisma.Decimal(input.physicalPct) : live.physicalPct;
    const { previousQty, budgetQty } = await _validateCertificationMeasurement(tx, cert, live.wbsNodeId, newCurrentQty, physicalPct);
    const cumulativeQty = previousQty.plus(newCurrentQty);
    const periodAmount = toMoneyDecimal(newCurrentQty.times(live.unitSalePriceSnapshot));

    await tx.certificationLine.update({
      where: { id: lineId },
      data: {
        physicalPct,
        budgetQty,
        currentQty:    newCurrentQty,
        previousQty,
        cumulativeQty,
        periodAmount,
        notes:      input.notes ?? undefined,
        sortOrder:  input.sortOrder ?? undefined,
      },
    });
    await _recalcCertificationTotals(tx as never, existing.certificationId);
  }, { timeout: 30_000, maxWait: 10_000 });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "certification_line.updated",
    entityType: "CertificationLine",
    entityId: lineId,
    after: input,
    ipAddress: ctx.ipAddress,
  });
}

export async function removeCertificationLine(lineId: string, ctx: ServiceContext): Promise<void> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para eliminar líneas de certificación");
  }
  const existing = await prisma.certificationLine.findUnique({ where: { id: lineId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Línea de certificación no encontrada");
  await _guardLine(existing.certificationId, ctx);

  await prisma.$transaction(async (tx) => {
    await _lockEditableCertification(tx, existing.certificationId, ctx.tenantId);
    await tx.certificationLine.delete({ where: { id: lineId } });
    await _recalcCertificationTotals(tx as never, existing.certificationId);
  }, { timeout: 30_000, maxWait: 10_000 });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "certification_line.removed",
    entityType: "CertificationLine",
    entityId: lineId,
    after: { certificationId: existing.certificationId },
    ipAddress: ctx.ipAddress,
  });
}

export async function refreshPreviousQty(certId: string, ctx: ServiceContext): Promise<void> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const cert = await prisma.certification.findUnique({ where: { id: certId } });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(cert.projectId, ctx);
  assertCertificationEditable(cert);

  await prisma.$transaction(async (tx) => {
    await _lockEditableCertification(tx, certId, ctx.tenantId);
    const lines = await tx.certificationLine.findMany({ where: { certificationId: certId } });
    for (const line of lines) {
      const { previousQty, budgetQty } = await _validateCertificationMeasurement(tx, cert, line.wbsNodeId, line.currentQty, line.physicalPct);
      const cumulativeQty = previousQty.plus(line.currentQty);
      const periodAmount = toMoneyDecimal(line.currentQty.times(line.unitSalePriceSnapshot));
      await tx.certificationLine.update({
        where: { id: line.id },
        data: { previousQty, cumulativeQty, periodAmount, budgetQty },
      });
    }
    await _recalcCertificationTotals(tx as never, certId);
  }, { timeout: 30_000, maxWait: 10_000 });
}
