import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { serializeQtyDecimal } from "../finance/money-decimal";

type QtyTx = {
  certificationLine: {
    findMany: (args: {
      where: {
        wbsNodeId: string;
        certification: {
          status: { in: ("ISSUED" | "APPROVED")[] };
          tenantId: string;
        };
      };
      select: { cumulativeQty: true };
    }) => Promise<Array<{ cumulativeQty: Prisma.Decimal }>>;
  };
};

/**
 * Budget item qty must not fall below the highest cumulative certified qty
 * on ISSUED/APPROVED certifications for that WBS leaf ([D-088] integrity).
 */
export async function assertCostItemQuantityNotBelowCertified(
  tx: QtyTx,
  args: {
    wbsNodeId: string;
    tenantId: string;
    quantity: Prisma.Decimal | number | string;
  },
): Promise<void> {
  const lines = await tx.certificationLine.findMany({
    where: {
      wbsNodeId: args.wbsNodeId,
      certification: {
        status: { in: ["ISSUED", "APPROVED"] },
        tenantId: args.tenantId,
      },
    },
    select: { cumulativeQty: true },
  });
  let maxCertified = new Prisma.Decimal(0);
  for (const line of lines) {
    if (line.cumulativeQty.greaterThan(maxCertified)) {
      maxCertified = line.cumulativeQty;
    }
  }
  if (new Prisma.Decimal(args.quantity).lessThan(maxCertified)) {
    throw new ServiceError(
      "CONFLICT",
      `La cantidad no puede ser menor a lo ya certificado (${serializeQtyDecimal(maxCertified)})`,
    );
  }
}
