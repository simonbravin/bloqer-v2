import { ServiceError } from "../types";

/**
 * Pure gate mirroring assertCompanyMatchesProject company/tenant rules
 * (async DB lookups live in assertCompanyMatchesProject).
 */
export function assertCompanyProjectScopeMatch(params: {
  project: { companyId: string | null } | null;
  companyInTenant: boolean;
  companyId: string;
}): void {
  if (!params.project) {
    throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  }
  if (!params.companyInTenant) {
    throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
  }
  if (params.project.companyId && params.project.companyId !== params.companyId) {
    throw new ServiceError(
      "CONFLICT",
      "La empresa de la orden no coincide con la empresa del proyecto",
    );
  }
}
