import { can } from "@bloqer/domain";
import { canViewApProjectArea, canViewCompanyAp } from "../ap/ap-access";
import { canViewArProjectArea, canViewCompanyAr } from "../ar/ar-access";
import { canAccessProject } from "../security/access";
import { isTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { ServiceError, type ServiceContext } from "../types";

type JournalSourceArea = "AR" | "AP" | "TREASURY" | "INVENTORY";

export async function canViewJournalSource(
  ctx: ServiceContext,
  area: JournalSourceArea,
  projectId: string | null,
): Promise<boolean> {
  const canView = area === "AR" ? (projectId ? canViewArProjectArea(ctx.roles) : canViewCompanyAr(ctx.roles))
    : area === "AP" ? (projectId ? canViewApProjectArea(ctx.roles) : canViewCompanyAp(ctx.roles))
      : can(ctx.roles, "VIEW", area);
  if (!canView || !(await isTenantModuleEnabled(ctx, area))) return false;
  return projectId ? canAccessProject(projectId, ctx) : true;
}

export async function assertCanViewJournalSource(
  ctx: ServiceContext,
  area: JournalSourceArea,
  projectId: string | null,
): Promise<void> {
  if (!(await canViewJournalSource(ctx, area, projectId))) {
    throw new ServiceError("FORBIDDEN", "No tenés acceso al origen operativo del asiento");
  }
}
