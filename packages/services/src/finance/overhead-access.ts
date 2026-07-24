import { can } from "@bloqer/domain";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { canEditCompanyAp, canViewCompanyAp } from "../ap/ap-access";

export function assertOverheadEdit(ctx: ServiceContext): void {
  // GG is a company tool (D-056): EDIT AP alone (e.g. PROCUREMENT) is not enough.
  if (!canEditCompanyAp(ctx.roles) && !can(ctx.roles, "APPROVE", "TENANT_SETTINGS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar imputaciones de gastos generales");
  }
}

/** Company GG reads require company AP (not VIEW PROJECTS alone). */
export function assertOverheadView(ctx: ServiceContext): void {
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver imputaciones de gastos generales");
  }
}

/** Evita acciones GG sobre otra empresa cuando la sesión tiene `companyId` fijado. */
export function assertOverheadCompanyScope(companyId: string, ctx: ServiceContext): void {
  if (isCrossCompany(companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La empresa no coincide con el contexto de sesión");
  }
}
