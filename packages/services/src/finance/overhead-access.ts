import { can } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";

export function assertOverheadEdit(ctx: ServiceContext): void {
  if (!can(ctx.roles, "EDIT", "AP") && !can(ctx.roles, "APPROVE", "TENANT_SETTINGS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar imputaciones de gastos generales");
  }
}

export function assertOverheadView(ctx: ServiceContext): void {
  if (!can(ctx.roles, "VIEW", "AP") && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver imputaciones de gastos generales");
  }
}

/** Evita acciones GG sobre otra empresa cuando la sesión tiene `companyId` fijado. */
export function assertOverheadCompanyScope(companyId: string, ctx: ServiceContext): void {
  if (ctx.companyId && ctx.companyId !== companyId) {
    throw new ServiceError("FORBIDDEN", "La empresa no coincide con el contexto de sesión");
  }
}
