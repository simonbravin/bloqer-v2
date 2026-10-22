import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

export type CertificationCeilingInput = {
  itemCode: string;
  cumulative: Prisma.Decimal;
  budgetQty: Prisma.Decimal;
  cumulativePhysicalPct?: Prisma.Decimal;
};

/**
 * BR-CERT-002 / D-119: strict accumulated limits, including PRIVATE projects.
 */
export function assertCertificationLineWithinBudget(input: CertificationCeilingInput): void {
  if (input.cumulative.greaterThan(input.budgetQty)) {
    throw new ServiceError(
      "CONFLICT",
      `Ítem "${input.itemCode}": la cantidad acumulada supera el 100% del presupuesto. Revisá los certificados anteriores; una ampliación requiere adenda. (BR-CERT-002)`,
    );
  }
  if (input.cumulativePhysicalPct?.greaterThan(100)) {
    throw new ServiceError(
      "CONFLICT",
      `Ítem "${input.itemCode}": el avance físico acumulado supera el 100%. Revisá el porcentaje de este período y los certificados anteriores. (BR-CERT-002b)`,
    );
  }
}

export function assertCertificationStatusEditable(status: string): void {
  if (status !== "DRAFT") {
    throw new ServiceError(
      "CONFLICT",
      `La certificación en estado "${status}" no puede editarse. Anule y cree una nueva.`,
    );
  }
}
