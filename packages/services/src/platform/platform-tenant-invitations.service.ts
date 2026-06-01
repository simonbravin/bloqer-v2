import { prisma } from "@bloqer/database";
import type { UserRole } from "@bloqer/domain";
import {
  cancelTenantInvitationSchema,
  createPlatformTenantInvitationInputSchema,
  platformTenantInvitationIdParamSchema,
} from "@bloqer/validators";
import {
  dedupeInvitationRoles,
  insertTenantInvitation,
  markExpiredPendingInvitationsForTenant,
  normalizeInvitationEmail,
  sendTenantInvitationEmailMessage,
  tenantInvitationEmailFailureMessage,
} from "../tenant-settings/tenant-invitation-shared";
import type { CreateTenantInvitationResult, TenantInvitationDetail, TenantInvitationRow } from "../tenant-settings/tenant-invitations.service";
import { ServiceError } from "../types";
import { assertPlatformAccess, type PlatformServiceContext } from "./platform-auth.service";
import { createPlatformAuditLog } from "./platform-audit.service";

async function assertTenantExists(tenantId: string): Promise<{ id: string; name: string }> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  return tenant;
}

export async function listPlatformTenantInvitations(
  tenantId: string,
  ctx: PlatformServiceContext,
): Promise<TenantInvitationRow[]> {
  await assertPlatformAccess(ctx);
  await assertTenantExists(tenantId);
  await markExpiredPendingInvitationsForTenant(tenantId);

  const rows = await prisma.tenantInvitation.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id:          true,
      email:       true,
      roles:       true,
      status:      true,
      expiresAt:   true,
      createdAt:   true,
      cancelledAt: true,
      acceptedAt:  true,
    },
  });

  return rows.map((r) => ({
    id:          r.id,
    email:       r.email,
    roles:       r.roles as UserRole[],
    status:      r.status,
    expiresAt:   r.expiresAt,
    createdAt:   r.createdAt,
    cancelledAt: r.cancelledAt,
    acceptedAt:  r.acceptedAt,
  }));
}

export async function getPlatformTenantInvitationById(
  tenantId: string,
  invitationId: string,
  ctx: PlatformServiceContext,
): Promise<TenantInvitationDetail> {
  await assertPlatformAccess(ctx);
  const parsed = platformTenantInvitationIdParamSchema.safeParse({ tenantId, invitationId });
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", "Parámetros inválidos");
  }
  await markExpiredPendingInvitationsForTenant(tenantId);

  const inv = await prisma.tenantInvitation.findFirst({
    where: { id: invitationId, tenantId },
    select: {
      id:          true,
      email:       true,
      roles:       true,
      status:      true,
      expiresAt:   true,
      createdAt:   true,
      cancelledAt: true,
      acceptedAt:  true,
      companyId:   true,
      invitedBy:   { select: { email: true } },
    },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Invitación no encontrada");

  return {
    id:             inv.id,
    email:          inv.email,
    roles:          inv.roles as UserRole[],
    status:         inv.status,
    expiresAt:      inv.expiresAt,
    createdAt:      inv.createdAt,
    cancelledAt:    inv.cancelledAt,
    acceptedAt:     inv.acceptedAt,
    invitedByEmail: inv.invitedBy.email,
    companyId:      inv.companyId,
  };
}

export type PlatformTenantCompanyRow = {
  id: string;
  name: string;
};

export async function listPlatformTenantCompanies(
  tenantId: string,
  ctx: PlatformServiceContext,
): Promise<PlatformTenantCompanyRow[]> {
  await assertPlatformAccess(ctx);
  await assertTenantExists(tenantId);
  const rows = await prisma.company.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows;
}

export async function createPlatformTenantInvitation(
  raw: unknown,
  ctx: PlatformServiceContext,
): Promise<CreateTenantInvitationResult> {
  await assertPlatformAccess(ctx);
  const parsed = createPlatformTenantInvitationInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "Validación";
    throw new ServiceError("VALIDATION", msg);
  }

  const { tenantId } = parsed.data;
  const emailNorm = normalizeInvitationEmail(parsed.data.email);
  const uniqueRoles = dedupeInvitationRoles(parsed.data.roles as UserRole[]);
  let companyId: string | null = parsed.data.companyId ?? null;
  if (companyId === "" || companyId === null) companyId = null;
  if (companyId) {
    const co = await prisma.company.findFirst({
      where: { id: companyId, tenantId },
      select: { id: true },
    });
    if (!co) throw new ServiceError("NOT_FOUND", "Empresa no encontrada en el tenant");
  }

  await markExpiredPendingInvitationsForTenant(tenantId);

  const userWithEmail = await prisma.user.findFirst({
    where: { email: { equals: emailNorm, mode: "insensitive" } },
    select: { id: true },
  });
  if (userWithEmail) {
    const active = await prisma.userMembership.findFirst({
      where: { tenantId, userId: userWithEmail.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (active) {
      throw new ServiceError("CONFLICT", "Ya existe un miembro activo con ese email en el tenant");
    }
  }

  const pendingDup = await prisma.tenantInvitation.findFirst({
    where: { tenantId, email: emailNorm, status: "PENDING" },
    select: { id: true },
  });
  if (pendingDup) {
    throw new ServiceError(
      "CONFLICT",
      "Ya hay una invitación pendiente para ese email. Cancelala o esperá a que venza.",
    );
  }

  const tenant = await assertTenantExists(tenantId);

  const inserted = await insertTenantInvitation(prisma, {
    tenantId,
    invitedByUserId: ctx.actorUserId,
    emailNorm,
    roles: uniqueRoles,
    companyId,
    expiresInDays: parsed.data.expiresInDays,
  });

  await createPlatformAuditLog({
    actorUserId: ctx.actorUserId,
    action: "platform.tenant.invitation_created",
    targetTenantId: tenantId,
    metadata: {
      invitationId: inserted.invitationId,
      email: emailNorm,
      roles: uniqueRoles,
    },
  });

  let emailDispatched = false;
  let emailFailureMessage: string | undefined;
  const emailDispatch = await sendTenantInvitationEmailMessage(
    emailNorm,
    inserted.invitationLink,
    tenant.name,
  );
  emailDispatched = emailDispatch.dispatched;
  if (!emailDispatch.dispatched) {
    emailFailureMessage = tenantInvitationEmailFailureMessage(emailDispatch);
  }

  return {
    invitationId: inserted.invitationId,
    expiresAt: inserted.expiresAt,
    invitationLink: inserted.invitationLink,
    emailDispatched,
    emailFailureMessage,
  };
}

export async function cancelPlatformTenantInvitation(
  tenantId: string,
  invitationId: string,
  ctx: PlatformServiceContext,
): Promise<void> {
  await assertPlatformAccess(ctx);
  const parsed = cancelTenantInvitationSchema.safeParse({ invitationId });
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", "Parámetros inválidos");
  }

  await markExpiredPendingInvitationsForTenant(tenantId);

  const inv = await prisma.tenantInvitation.findFirst({
    where: { id: invitationId, tenantId },
    select: { id: true, status: true },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Invitación no encontrada");
  if (inv.status !== "PENDING") {
    throw new ServiceError("CONFLICT", "Solo se pueden cancelar invitaciones pendientes");
  }

  const now = new Date();
  await prisma.tenantInvitation.update({
    where: { id: inv.id },
    data:  { status: "CANCELLED", cancelledAt: now },
  });

  await createPlatformAuditLog({
    actorUserId: ctx.actorUserId,
    action: "platform.tenant.invitation_cancelled",
    targetTenantId: tenantId,
    metadata: { invitationId: inv.id },
  });
}
