import { randomBytes } from "node:crypto";
import { prisma } from "@bloqer/database";
import { OVERVIEW_MODULES } from "@bloqer/domain";
import type { CompleteTrialOnboardingInput } from "@bloqer/validators";
import { ServiceError } from "../types";

export type CompleteTrialOnboardingResult =
  | { status: "created"; tenantId: string }
  | { status: "already_member"; tenantId: string };

function slugifyBase(displayName: string): string {
  const s = displayName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "tenant";
}

const TRIAL_DAYS = 30;

/**
 * First-time SaaS onboarding: creates tenant (trial), primary company, OWNER membership,
 * explicit tenant module rows, and audit entries in one transaction.
 * Re-entrant: if the user already has an ACTIVE membership, returns `already_member` without writes.
 */
export async function completeTrialOnboarding(
  actorUserId: string,
  input: CompleteTrialOnboardingInput,
  options?: { ipAddress?: string | null },
): Promise<CompleteTrialOnboardingResult> {
  const ipAddress = options?.ipAddress ?? null;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.userMembership.findFirst({
      where: { userId: actorUserId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { tenantId: true },
    });
    if (existing) {
      return { status: "already_member", tenantId: existing.tenantId };
    }

    const baseSlug = slugifyBase(input.displayName);
    let slug = baseSlug;
    for (let attempt = 0; attempt < 24; attempt++) {
      const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(3).toString("hex")}`;
      const taken = await tx.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!taken) {
        slug = candidate;
        break;
      }
      if (attempt === 23) {
        throw new ServiceError("CONFLICT", "No se pudo generar un identificador único. Probá con otro nombre.");
      }
    }

    const trialEndsAt = new Date();
    trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + TRIAL_DAYS);

    const tenant = await tx.tenant.create({
      data: {
        name: input.displayName,
        slug,
        fiscalId: input.taxId,
        status: "ACTIVE",
        saasPlan: "trial",
        subscriptionStatus: "TRIAL",
        trialEndsAt,
      },
    });

    const company = await tx.company.create({
      data: {
        tenantId: tenant.id,
        name: input.displayName,
        legalName: input.legalName,
        fiscalId: input.taxId,
        status: "ACTIVE",
        address: input.address,
        city: input.city,
        country: input.country,
        phone: input.phone,
        website: input.website ?? null,
        industry: input.industry ?? null,
        companySize: input.companySize ?? null,
      },
    });

    const membership = await tx.userMembership.create({
      data: {
        userId: actorUserId,
        tenantId: tenant.id,
        companyId: company.id,
        roles: ["OWNER"],
        status: "ACTIVE",
      },
    });

    await tx.tenantModuleSetting.createMany({
      data: OVERVIEW_MODULES.map((moduleKey) => ({
        tenantId: tenant.id,
        moduleKey,
        isEnabled: true,
      })),
      skipDuplicates: true,
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
          saasPlan: tenant.saasPlan,
          subscriptionStatus: tenant.subscriptionStatus,
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
