import { prisma } from "@bloqer/database";
import { getSoleActiveCompanyIdForTenant } from "../company/company.service";
import { ServiceContext, ServiceError } from "../types";

/**
 * Resolves the company scope for accounting reads/writes.
 * If `ctx.companyId` is set, it must be an ACTIVE company in the tenant (membership context).
 * Otherwise `inputCompanyId`, or the tenant's sole ACTIVE company ([D-092]).
 * Does not pick among several companies by name.
 */
export async function resolveAccountingCompanyId(
  ctx: ServiceContext,
  inputCompanyId?: string | null,
): Promise<string> {
  if (ctx.companyId) {
    const scoped = await prisma.company.findFirst({
      where: { id: ctx.companyId, tenantId: ctx.tenantId, status: "ACTIVE" },
    });
    if (!scoped) {
      throw new ServiceError("VALIDATION", "Empresa del contexto inválida o inactiva");
    }
    return ctx.companyId;
  }
  if (inputCompanyId) {
    const picked = await prisma.company.findFirst({
      where: { id: inputCompanyId, tenantId: ctx.tenantId, status: "ACTIVE" },
    });
    if (!picked) {
      throw new ServiceError("VALIDATION", "Empresa no válida");
    }
    return inputCompanyId;
  }
  const sole = await getSoleActiveCompanyIdForTenant(ctx.tenantId);
  if (!sole) {
    throw new ServiceError("VALIDATION", "No hay empresa activa en el tenant");
  }
  return sole;
}
