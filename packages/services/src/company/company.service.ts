import { prisma, type Prisma, type Company } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

type CompanyDb = Prisma.TransactionClient | typeof prisma;

/**
 * Auto-anchor default until a company selector exists ([D-092]): use the tenant
 * company only when there is exactly one ACTIVE `Company`. 0 or 2+ → null.
 */
export function pickSoleCompanyId(ids: readonly string[]): string | null {
  return ids.length === 1 ? (ids[0] ?? null) : null;
}

export async function getSoleActiveCompanyIdForTenant(
  tenantId: string,
  db: CompanyDb = prisma,
): Promise<string | null> {
  const rows = await db.company.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true },
    take: 2,
  });
  return pickSoleCompanyId(rows.map((r) => r.id));
}

/**
 * [D-092] Never substitute a different company when a candidate was provided
 * but is missing/inactive. Sole-company fallback only if there was no candidate.
 */
export function pickResolvedCompanyId(
  candidate: string | null,
  candidateOk: boolean,
  soleCompanyId: string | null,
): string | null {
  if (candidate) return candidateOk ? candidate : null;
  return soleCompanyId;
}

export async function findActiveCompanyInTenant(
  companyId: string,
  tenantId: string,
  db: CompanyDb = prisma,
): Promise<string | null> {
  const scoped = await db.company.findFirst({
    where: { id: companyId, tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  return scoped?.id ?? null;
}

/**
 * Explicit company must be ACTIVE in the tenant; otherwise the tenant's sole
 * ACTIVE company. Does not pick among several companies.
 */
export async function resolveDefaultCompanyIdForTenant(
  tenantId: string,
  explicitCompanyId?: string | null,
  db: CompanyDb = prisma,
): Promise<string | null> {
  const explicit = explicitCompanyId?.trim() || null;
  if (explicit) {
    const scoped = await findActiveCompanyInTenant(explicit, tenantId, db);
    if (!scoped) {
      throw new ServiceError("NOT_FOUND", "Empresa no encontrada en el tenant");
    }
    return scoped;
  }
  return getSoleActiveCompanyIdForTenant(tenantId, db);
}

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
 * Picks the preferred company id when both membership and an explicit preferred
 * (usually project.companyId) are present. Empty strings are treated as unset.
 */
export function preferCompanyIdCandidate(
  preferredCompanyId?: string | null,
  membershipCompanyId?: string | null,
): string | null {
  const preferred = preferredCompanyId?.trim() || null;
  if (preferred) return preferred;
  const membership = membershipCompanyId?.trim() || null;
  return membership;
}

/**
 * Resolves an ACTIVE company id for operational writes when membership/project
 * may lack `companyId` (tenant-wide users / shared projects).
 * Explicit preferred (e.g. project company) wins over membership company.
 * If both are unset, [D-092] auto-anchors only when the tenant has exactly one
 * ACTIVE company (no silent pick among several).
 */
export async function resolveActiveCompanyId(
  ctx: ServiceContext,
  preferredCompanyId?: string | null,
): Promise<string | null> {
  const candidate = preferCompanyIdCandidate(preferredCompanyId, ctx.companyId);
  if (candidate) {
    const scoped = await findActiveCompanyInTenant(candidate, ctx.tenantId);
    return pickResolvedCompanyId(candidate, scoped != null, null);
  }
  return getSoleActiveCompanyIdForTenant(ctx.tenantId);
}

/**
 * Fiscal defaults for AR invoice letter UX ([D-084]).
 * Memberships often have `companyId` null (tenant-wide users); fall back to the
 * tenant's sole ACTIVE company ([D-092]) so letter A/B/C/E still appears in AR.
 */
export async function getCompanyFiscalContext(
  ctx: ServiceContext,
  preferredCompanyId?: string | null,
): Promise<{ country: string; ivaCondition: Company["ivaCondition"] } | null> {
  const resolvedId = await resolveActiveCompanyId(ctx, preferredCompanyId);
  if (!resolvedId) return null;
  const company = await getCompanyById(resolvedId, ctx);
  return { country: company.country, ivaCondition: company.ivaCondition };
}
