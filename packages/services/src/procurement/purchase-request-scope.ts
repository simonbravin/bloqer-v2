import { isCrossCompany } from "../company-scope";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { requireProjectAccess } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";

/** Quotes and awards inherit the request's tenant, active company and project ACL. */
export async function assertPurchaseRequestScope(
  request: { tenantId: string; companyId: string; projectId: string },
  ctx: ServiceContext,
  access: "read" | "mutate",
): Promise<void> {
  if (request.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  }
  if (isCrossCompany(request.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La solicitud no pertenece a la empresa activa");
  }
  if (access === "mutate") {
    await assertProjectAllowsOperationalMutation(request.projectId, ctx);
  } else {
    await requireProjectAccess(request.projectId, ctx);
  }
}
