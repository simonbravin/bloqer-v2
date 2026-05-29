import type { ServiceContext } from "../types";
import { ServiceError } from "../types";

export type CorporatePayableScopeRow = {
  projectId: string | null;
  companyId: string;
};

export function assertCorporatePayableScope(
  payable: CorporatePayableScopeRow,
  ctx: ServiceContext,
): void {
  if (payable.projectId !== null) {
    throw new ServiceError(
      "FORBIDDEN",
      "Solo se pueden pagar obligaciones corporativas desde Transacciones.",
    );
  }
  if (ctx.companyId && payable.companyId !== ctx.companyId) {
    throw new ServiceError(
      "FORBIDDEN",
      "La obligación no pertenece a la empresa activa.",
    );
  }
}
