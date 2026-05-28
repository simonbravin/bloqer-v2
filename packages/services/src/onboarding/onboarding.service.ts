import { Prisma } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import type { CompleteTrialOnboardingInput } from "@bloqer/validators";
import { ServiceError } from "../types";
import { createTrialTenantBundle } from "./trial-tenant-bundle";

export type CompleteTrialOnboardingResult =
  | { status: "created"; tenantId: string }
  | { status: "already_member"; tenantId: string };

const ONBOARDING_ADVISORY_CLASS_ID = 824_014_001;

/**
 * First-time SaaS onboarding: creates tenant (trial), primary company, OWNER membership,
 * explicit tenant module rows, and audit entries in one transaction.
 */
export async function completeTrialOnboarding(
  actorUserId: string,
  input: CompleteTrialOnboardingInput,
  options?: { ipAddress?: string | null },
): Promise<CompleteTrialOnboardingResult> {
  const ipAddress = options?.ipAddress ?? null;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${ONBOARDING_ADVISORY_CLASS_ID}::integer, hashtext(${actorUserId}::text))`,
    );

    const existing = await tx.userMembership.findFirst({
      where: { userId: actorUserId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { tenantId: true },
    });
    if (existing) {
      return { status: "already_member", tenantId: existing.tenantId };
    }

    const { tenant, company } = await createTrialTenantBundle(tx, input);

    const membership = await tx.userMembership.create({
      data: {
        userId: actorUserId,
        tenantId: tenant.id,
        companyId: company.id,
        roles: ["OWNER"],
        status: "ACTIVE",
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId,
        action: "TENANT_ONBOARDING_COMPLETED",
        entityType: "Tenant",
        entityId: tenant.id,
        after: {
          name: tenant.name,
          slug: tenant.slug,
          saasPlan: "trial",
          subscriptionStatus: "TRIAL",
          trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
        },
        ipAddress,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId,
        action: "COMPANY_CREATED",
        entityType: "Company",
        entityId: company.id,
        after: { name: company.name, tenantId: tenant.id },
        ipAddress,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId,
        action: "MEMBERSHIP_CREATED",
        entityType: "UserMembership",
        entityId: membership.id,
        after: { userId: actorUserId, roles: ["OWNER"], companyId: company.id },
        ipAddress,
      },
    });

    return { status: "created", tenantId: tenant.id };
  });
}
