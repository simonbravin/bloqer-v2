// Internal calculation helpers — NOT exported from services/index.ts
import { Prisma, prisma } from "@bloqer/database";
import { toMoneyDecimal } from "../finance/money-decimal";
import { ServiceError } from "../types";
import {
  assertCertificationLineWithinBudget,
  assertCertificationStatusEditable,
} from "./certification-guards";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** Shared with issue: measurements cannot change a certificate while it is being frozen. */
export async function _lockCertificationProject(tx: TxClient, projectId: string): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${824_014_002}::integer, hashtext(${projectId}::text))`,
  );
}

export async function _lockEditableCertification(
  tx: TxClient,
  certificationId: string,
  tenantId: string,
  expectedRevision?: string,
) {
  const before = await tx.certification.findFirst({ where: { id: certificationId, tenantId } });
  if (!before) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  await _lockCertificationProject(tx, before.projectId);
  const cert = await tx.certification.findFirstOrThrow({
    where: { id: certificationId, tenantId },
  });
  assertCertificationStatusEditable(cert.status);
  if (expectedRevision && cert.updatedAt.toISOString() !== expectedRevision) {
    throw new ServiceError(
      "CONFLICT",
      "La certificación cambió mientras medías. Recargá la página para revisar los valores actuales.",
    );
  }
  return cert;
}

/** Called under the project lock by every line mutation; drafts do not reserve progress. */
export async function _validateCertificationMeasurement(
  tx: TxClient,
  cert: { id: string; tenantId: string; budgetId: string },
  wbsNodeId: string,
  currentQty: Prisma.Decimal,
  physicalPct: Prisma.Decimal,
) {
  const node = await tx.wbsNode.findFirst({
    where: {
      id: wbsNodeId,
      budgetId: cert.budgetId,
      type: "ITEM",
      budget: { tenantId: cert.tenantId },
    },
    include: { costItem: true },
  });
  if (!node?.costItem)
    throw new ServiceError(
      "CONFLICT",
      "La partida no pertenece al presupuesto de esta certificación",
    );
  const result = await tx.certificationLine.aggregate({
    where: {
      wbsNodeId,
      certificationId: { not: cert.id },
      certification: { tenantId: cert.tenantId, status: { in: ["ISSUED", "APPROVED"] } },
    },
    _sum: { currentQty: true, physicalPct: true },
  });
  const previousQty = result._sum.currentQty ?? new Prisma.Decimal(0);
  const previousPhysicalPct = result._sum.physicalPct ?? new Prisma.Decimal(0);
  assertCertificationLineWithinBudget({
    itemCode: node.code,
    cumulative: previousQty.plus(currentQty),
    budgetQty: node.costItem.quantity,
    cumulativePhysicalPct: previousPhysicalPct.plus(physicalPct),
  });
  return { node, costItem: node.costItem, previousQty, budgetQty: node.costItem.quantity };
}

export async function _recalcCertificationTotals(
  tx: TxClient,
  certificationId: string,
): Promise<void> {
  const lines = await tx.certificationLine.findMany({
    where: { certificationId },
    select: { periodAmount: true },
  });
  const total = toMoneyDecimal(
    lines.reduce(
      (sum: Prisma.Decimal, l: { periodAmount: Prisma.Decimal }) => sum.plus(l.periodAmount),
      new Prisma.Decimal(0),
    ),
  );
  await tx.certification.update({
    where: { id: certificationId },
    data: { totalAmount: total },
  });
}
