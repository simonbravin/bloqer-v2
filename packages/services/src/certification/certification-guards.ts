import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

export type CertificationCeilingInput = {
  projectType: string;
  itemCode: string;
  cumulative: Prisma.Decimal;
  budgetQty: Prisma.Decimal;
  certificationNotes: string | null | undefined;
};

/**
 * BR-CERT-002 / BR-CERT-002b — cumulative qty vs budget ceiling on issue.
 */
export function assertCertificationLineWithinBudget(input: CertificationCeilingInput): void {
  if (!input.cumulative.greaterThan(input.budgetQty)) return;

  if (input.projectType === "PUBLIC") {
    throw new ServiceError(
      "CONFLICT",
      `Ítem "${input.itemCode}" supera el techo del presupuesto en obra pública. Requiere adenda. (BR-CERT-002)`,
    );
  }
  if (!input.certificationNotes?.trim()) {
    throw new ServiceError(
      "CONFLICT",
      `Ítem "${input.itemCode}" supera el techo. Agregue una nota explicativa en la certificación. (BR-CERT-002b)`,
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
