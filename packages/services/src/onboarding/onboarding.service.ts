import { Prisma } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import type { CompleteTrialOnboardingInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceError } from "../types";
import { createTrialTenantBundle } from "./trial-tenant-bundle";
import { normalizeInvitationEmail } from "../tenant-settings/tenant-invitation-shared";

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

    const actorUser = await tx.user.findFirst({
      where: { id: actorUserId },
      select: { email: true },
    });
    const actorEmail = actorUser?.email?.trim();
    if (!actorEmail) {
      throw new ServiceError(
        "VALIDATION",
        "Tu cuenta no tiene un email válido. Usá la misma cuenta Google que recibió la invitación.",
      );
    }

    const now = new Date();
    const pendingInvites = await tx.tenantInvitation.count({
      where: {
        email: normalizeInvitationEmail(actorEmail),
        status: "PENDING",
        expiresAt: { gt: now },
      },
    });
    if (pendingInvites > 0) {
      throw new ServiceError(
        "CONFLICT",
        "Tenés invitaciones pendientes. Abrí el enlace del correo para unirte a tu organización antes de crear otro espacio.",
      );
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

    await log(
      {
        tenantId: tenant.id,
        actorUserId,
        action: "TENANT_ONBOARDING_COMPLETED",
        entityType: "Tenant",
        entityId: tenant.id,
        companyId: company.id,
        after: {
          name: tenant.name,
          slug: tenant.slug,
          saasPlan: "trial",
          subscriptionStatus: "TRIAL",
          trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
        },
        ipAddress,
      },
      tx,
    );

    await log(
      {
        tenantId: tenant.id,
        actorUserId,
        action: "COMPANY_CREATED",
        entityType: "Company",
        entityId: company.id,
        companyId: company.id,
        after: { name: company.name, tenantId: tenant.id },
        ipAddress,
      },
      tx,
    );

    await log(
      {
        tenantId: tenant.id,
        actorUserId,
        action: "MEMBERSHIP_CREATED",
        entityType: "UserMembership",
        entityId: membership.id,
        companyId: company.id,
        after: { userId: actorUserId, roles: ["OWNER"], companyId: company.id },
        ipAddress,
      },
      tx,
    );

    return { status: "created", tenantId: tenant.id };
  });
}
