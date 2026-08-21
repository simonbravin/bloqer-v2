import { prisma } from "@bloqer/database";
import type { Company } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

export interface CreateCompanyInput {
  name: string;
  legalName?: string;
  fiscalId?: string;
}

export async function createCompany(input: CreateCompanyInput, ctx: ServiceContext): Promise<Company> {
  if (!can(ctx.roles, "APPROVE", "TENANT_SETTINGS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to create company");
  }

  const company = await prisma.company.create({
    data: { ...input, tenantId: ctx.tenantId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "COMPANY_CREATED",
    entityType: "Company",
    entityId: company.id,
    after: { name: company.name, tenantId: company.tenantId },
    ipAddress: ctx.ipAddress,
  });

  return company;
}

export async function getCompanies(ctx: ServiceContext): Promise<Company[]> {
  return prisma.company.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
}

export async function getCompanyById(id: string, ctx: ServiceContext): Promise<Company> {
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new ServiceError("NOT_FOUND", "Company not found");
  if (company.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return company;
}

/**
 * Fiscal defaults for AR invoice letter UX ([D-084]).
 * Memberships often have `companyId` null (tenant-wide users); fall back to the
 * first ACTIVE company so letter A/B/C/E still appears when the tenant operates in AR.
 */
export async function getCompanyFiscalContext(
  ctx: ServiceContext,
  preferredCompanyId?: string | null,
): Promise<{ country: string; ivaCondition: Company["ivaCondition"] } | null> {
  const companyId = ctx.companyId ?? preferredCompanyId ?? null;
  if (companyId) {
    try {
      const company = await getCompanyById(companyId, ctx);
      if (company.status !== "ACTIVE") return null;
      return { country: company.country, ivaCondition: company.ivaCondition };
    } catch {
      /* fall through to tenant default */
    }
  }
  const first = await prisma.company.findFirst({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  if (!first) return null;
  return { country: first.country, ivaCondition: first.ivaCondition };
}
