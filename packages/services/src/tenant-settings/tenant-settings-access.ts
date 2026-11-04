import { can } from "@bloqer/domain";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceError, type ServiceContext } from "../types";

/** Configuration is reachable through either enabled branch the actor can view. */
export async function assertTenantConfigReadAccess(ctx: ServiceContext): Promise<void> {
  const gate = await getTenantModuleGate(ctx);
  if (
    (can(ctx.roles, "VIEW", "TENANT_SETTINGS") && gate.isEnabled("TENANT_SETTINGS")) ||
    (can(ctx.roles, "VIEW", "USERS_PERMISSIONS") && gate.isEnabled("USERS_PERMISSIONS"))
  ) return;
  throw new ServiceError("FORBIDDEN", "Sin acceso a la configuración de este tenant.");
}
