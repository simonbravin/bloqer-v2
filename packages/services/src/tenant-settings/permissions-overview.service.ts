import { buildPermissionMatrixGrid } from "@bloqer/domain";
import type { PermissionMatrixGrid } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";
import { canReadTenantConfigArea } from "./tenant-settings-guards";

export async function getPermissionMatrixOverview(ctx: ServiceContext): Promise<PermissionMatrixGrid> {
  if (!canReadTenantConfigArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la matriz de permisos");
  }
  return buildPermissionMatrixGrid();
}
