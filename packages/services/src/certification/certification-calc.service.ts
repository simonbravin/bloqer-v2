// Internal calculation helpers — NOT exported from services/index.ts
import { Prisma, prisma } from "@bloqer/database";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function _computePreviousQty(
  tx: TxClient,
  wbsNodeId: string,
  excludeCertId: string,
): Promise<Prisma.Decimal> {
  const rows = await tx.certificationLine.findMany({
    where: {
      wbsNodeId,
      certificationId: { not: excludeCertId },
      certification: { status: { in: ["ISSUED", "APPROVED"] } },
    },
    select: { currentQty: true },
  });
  return rows.reduce(
    (sum: Prisma.Decimal, r: { currentQty: Prisma.Decimal }) => sum.plus(r.currentQty),
    new Prisma.Decimal(0),
  );
}

export async function _recalcCertificationTotals(
  tx: TxClient,
  certificationId: string,
): Promise<void> {
  const lines = await tx.certificationLine.findMany({
    where: { certificationId },
    select: { periodAmount: true },
  });
  const total = lines.reduce(
    (sum: Prisma.Decimal, l: { periodAmount: Prisma.Decimal }) => sum.plus(l.periodAmount),
    new Prisma.Decimal(0),
  );
  await tx.certification.update({
    where: { id: certificationId },
    data: { totalAmount: total },
  });
}
