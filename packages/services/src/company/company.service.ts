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
