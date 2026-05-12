import { prisma } from "@bloqer/database";
import { ServiceContext, ServiceError } from "../types";

/**
 * Resolves the company scope for accounting reads/writes.
 * If `ctx.companyId` is set, it must be an ACTIVE company in the tenant (membership context).
 * Otherwise `inputCompanyId` or the first ACTIVE company (name ASC) is used.
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
  const first = await prisma.company.findFirst({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  if (!first) {
    throw new ServiceError("VALIDATION", "No hay empresa activa en el tenant");
  }
  return first.id;
}
