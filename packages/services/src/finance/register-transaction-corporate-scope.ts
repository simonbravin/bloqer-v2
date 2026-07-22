import { isCrossCompany } from "../company-scope";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";

export type CorporatePayableScopeRow = {
  projectId: string | null;
  companyId: string;
};

export type CorporateReceivableScopeRow = {
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
  if (isCrossCompany(payable.companyId, ctx)) {
    throw new ServiceError(
      "FORBIDDEN",
      "La obligación no pertenece a la empresa activa.",
    );
  }
}

/** Company Finanzas AR mutations must target corporate receivables only (D-051). */
export function assertCorporateReceivableScope(
  receivable: CorporateReceivableScopeRow,
  ctx: ServiceContext,
): void {
  if (receivable.projectId !== null) {
    throw new ServiceError(
      "FORBIDDEN",
      "Esta cuenta está asignada a un proyecto; usá el espacio de trabajo del proyecto",
    );
  }
  if (isCrossCompany(receivable.companyId, ctx)) {
    throw new ServiceError(
      "FORBIDDEN",
      "La cuenta no pertenece a la empresa activa",
    );
  }
}
