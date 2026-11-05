import { prisma, type Prisma } from "@bloqer/database";
import { getSoleActiveCompanyIdForTenant } from "../company/company.service";
import { ServiceContext, ServiceError } from "../types";

export async function lockAccountingCompany(tx: Prisma.TransactionClient, tenantId: string, companyId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} AND "tenantId" = ${tenantId} FOR UPDATE`;
}

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
    if (inputCompanyId && inputCompanyId !== ctx.companyId) {
      throw new ServiceError("FORBIDDEN", "La empresa indicada está fuera del alcance de la sesión");
    }
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
    throw new ServiceError("VALIDATION", "Seleccioná una empresa activa para continuar");
  }
  return sole;
}
