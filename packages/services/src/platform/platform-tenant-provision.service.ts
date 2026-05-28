import { prisma } from "@bloqer/database";
import type { UserRole } from "@bloqer/domain";
import { getPublicAppBaseUrl, isEmailConfigured } from "@bloqer/config";
import { provisionPlatformTenantInputSchema } from "@bloqer/validators";
import { createTrialTenantBundle } from "../onboarding/trial-tenant-bundle";
import {
  dedupeInvitationRoles,
  insertTenantInvitation,
  normalizeInvitationEmail,
  sendTenantInvitationEmailMessage,
} from "../tenant-settings/tenant-invitation-shared";
import { ServiceError } from "../types";
import { assertPlatformAccess, type PlatformServiceContext } from "./platform-auth.service";
import { createPlatformAuditLog } from "./platform-audit.service";

export type ProvisionPlatformTenantResult = {
  tenantId: string;
  companyId: string;
  invitationId: string;
  invitationLink: string;
  emailDispatched: boolean;
};

export async function provisionPlatformTenant(
  raw: unknown,
  ctx: PlatformServiceContext,
): Promise<ProvisionPlatformTenantResult> {
  await assertPlatformAccess(ctx);
  const parsed = provisionPlatformTenantInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "Validación";
    throw new ServiceError("VALIDATION", msg);
  }

  const input = parsed.data;
  const emailNorm = normalizeInvitationEmail(input.ownerEmail);
  const ownerRoles = dedupeInvitationRoles(
    (input.ownerRoles?.length ? input.ownerRoles : ["OWNER"]) as UserRole[],
  );

  const onboardingFields = {
    displayName: input.displayName,
    legalName: input.legalName,
    taxId: input.taxId,
    country: input.country,
    city: input.city,
    address: input.address,
    phone: input.phone,
    website: input.website,
    industry: input.industry,
    companySize: input.companySize,
  };

  return prisma.$transaction(async (tx) => {
    const { tenant, company } = await createTrialTenantBundle(tx, onboardingFields);

    const inserted = await insertTenantInvitation(tx, {
      tenantId: tenant.id,
      invitedByUserId: ctx.actorUserId,
      emailNorm,
      roles: ownerRoles,
      companyId: company.id,
      expiresInDays: input.invitationExpiresInDays,
    });

    await createPlatformAuditLog(
      {
        actorUserId: ctx.actorUserId,
        action: "platform.tenant.provisioned",
        targetTenantId: tenant.id,
        metadata: {
          name: tenant.name,
          slug: tenant.slug,
          companyId: company.id,
        },
      },
      tx,
    );

    await createPlatformAuditLog(
      {
        actorUserId: ctx.actorUserId,
        action: "platform.tenant.invitation_created",
        targetTenantId: tenant.id,
        metadata: {
          invitationId: inserted.invitationId,
          email: emailNorm,
          roles: ownerRoles,
        },
      },
      tx,
    );

    let emailDispatched = false;
    if (isEmailConfigured() && getPublicAppBaseUrl()) {
      emailDispatched = await sendTenantInvitationEmailMessage(
        emailNorm,
        inserted.invitationLink,
        tenant.name,
      );
    }

    return {
      tenantId: tenant.id,
      companyId: company.id,
      invitationId: inserted.invitationId,
      invitationLink: inserted.invitationLink,
      emailDispatched,
    };
  });
}
