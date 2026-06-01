import "server-only";

import { prisma } from "@bloqer/database";
import type { MembershipStatus, TenantInvitationStatus, UserRole as PrismaUserRole } from "@bloqer/database";
import type { UserRole } from "@bloqer/domain";
import {
  dedupeInvitationRoles,
  hashInvitationToken,
  insertTenantInvitation,
  markExpiredPendingInvitationsForTenant,
  normalizeInvitationEmail,
  sendTenantInvitationEmailMessage,
  tenantInvitationEmailFailureMessage,
} from "./tenant-invitation-shared";
import {
  acceptTenantInvitationSchema,
  cancelTenantInvitationSchema,
  createTenantInvitationSchema,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { canEditTeamMembership, canReadTenantConfigArea } from "./tenant-settings-guards";

export type AcceptTenantInvitationActorContext = {
  actorUserId: string;
  ipAddress?: string | null;
};

export type TenantInvitationRow = {
  id:          string;
  email:       string;
  roles:       UserRole[];
  status:      TenantInvitationStatus;
  expiresAt:   Date;
  createdAt:   Date;
  cancelledAt: Date | null;
  acceptedAt:  Date | null;
};

export type TenantInvitationDetail = TenantInvitationRow & {
  invitedByEmail: string;
  companyId:      string | null;
};

export type CreateTenantInvitationResult = {
  invitationId: string;
  expiresAt:    Date;
  /** Full or relative URL with token query (actor-only). */
  invitationLink: string;
  emailDispatched: boolean;
  emailFailureMessage?: string;
};

/** Owner invariant when activating or creating membership via invitation (only active members count before). */
function assertOwnerInvariantAfterInviteAccept(
  activeRows: { id: string; roles: PrismaUserRole[] }[],
  existing: { id: string; status: MembershipStatus; roles: PrismaUserRole[] } | null,
  invitedRoles: PrismaUserRole[],
): void {
  const ownersBefore = activeRows.filter((m) => m.roles.some((r) => r === "OWNER")).length;
  const hypothetical: { id: string; roles: PrismaUserRole[] }[] = activeRows.map((r) => ({
    id:    r.id,
    roles: r.roles,
  }));
  if (existing?.status === "INACTIVE") {
    hypothetical.push({ id: existing.id, roles: invitedRoles });
  } else if (!existing) {
    hypothetical.push({ id: "__new__", roles: invitedRoles });
  }
  const ownersAfter = hypothetical.filter((m) => m.roles.some((r) => r === "OWNER")).length;
  if (ownersBefore >= 1 && ownersAfter < 1) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede aceptar la invitación: dejaría al tenant sin miembro activo con rol OWNER",
    );
  }
}

export async function listTenantInvitations(ctx: ServiceContext): Promise<TenantInvitationRow[]> {
  if (!canReadTenantConfigArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver invitaciones");
  }
  await markExpiredPendingInvitationsForTenant(ctx.tenantId);
  const rows = await prisma.tenantInvitation.findMany({
    where: { tenantId: ctx.tenantId },
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

export async function getTenantInvitationById(
  invitationId: string,
  ctx: ServiceContext,
): Promise<TenantInvitationDetail> {
  if (!canReadTenantConfigArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver invitaciones");
  }
  await markExpiredPendingInvitationsForTenant(ctx.tenantId);
  const inv = await prisma.tenantInvitation.findFirst({
    where: { id: invitationId, tenantId: ctx.tenantId },
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
    invitedByEmail: inv.invitedBy.email ?? "—",
    companyId:      inv.companyId,
  };
}

export type TenantInvitationPeek = {
  email:      string;
  tenantName: string;
};

/**
 * Public read for accept UI: valid bearer token only (no auth).
 * Does not reveal existence for invalid/expired tokens beyond returning null.
 */
export async function peekTenantInvitationForAcceptPage(token: string): Promise<TenantInvitationPeek | null> {
  const parsed = acceptTenantInvitationSchema.safeParse({ token });
  if (!parsed.success) return null;
  const inv = await prisma.tenantInvitation.findFirst({
    where: { tokenHash: hashInvitationToken(parsed.data.token), status: "PENDING" },
    select: { expiresAt: true, email: true, tenant: { select: { name: true } } },
  });
  if (!inv) return null;
  if (inv.expiresAt <= new Date()) {
    await prisma.tenantInvitation.updateMany({
      where: { tokenHash: hashInvitationToken(parsed.data.token), status: "PENDING" },
      data:  { status: "EXPIRED" },
    });
    return null;
  }
  return { email: inv.email, tenantName: inv.tenant.name };
}

export async function createTenantInvitation(
  raw: unknown,
  ctx: ServiceContext,
): Promise<CreateTenantInvitationResult> {
  if (!canEditTeamMembership(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para invitar usuarios");
  }
  const parsed = createTenantInvitationSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "Validación";
    throw new ServiceError("VALIDATION", msg);
  }
  const emailNorm = normalizeInvitationEmail(parsed.data.email);
  const uniqueRoles = dedupeInvitationRoles(parsed.data.roles as UserRole[]);
  let companyId: string | null = parsed.data.companyId ?? null;
  if (companyId === "" || companyId === null) companyId = null;
  if (companyId) {
    const co = await prisma.company.findFirst({
      where: { id: companyId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!co) throw new ServiceError("NOT_FOUND", "Empresa no encontrada en el tenant");
  }

  await markExpiredPendingInvitationsForTenant(ctx.tenantId);

  const userWithEmail = await prisma.user.findFirst({
    where: { email: { equals: emailNorm, mode: "insensitive" } },
    select: { id: true },
  });
  if (userWithEmail) {
    const active = await prisma.userMembership.findFirst({
      where: { tenantId: ctx.tenantId, userId: userWithEmail.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (active) {
      throw new ServiceError("CONFLICT", "Ya existe un miembro activo con ese email en el tenant");
    }
  }

  const pendingDup = await prisma.tenantInvitation.findFirst({
    where: { tenantId: ctx.tenantId, email: emailNorm, status: "PENDING" },
    select: { id: true },
  });
  if (pendingDup) {
    throw new ServiceError(
      "CONFLICT",
      "Ya hay una invitación pendiente para ese email. Cancelala o esperá a que venza.",
    );
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");

  const inserted = await insertTenantInvitation(prisma, {
    tenantId: ctx.tenantId,
    invitedByUserId: ctx.actorUserId,
    emailNorm,
    roles: uniqueRoles,
    companyId,
    expiresInDays: parsed.data.expiresInDays,
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "TENANT_INVITATION_CREATED",
    entityType:  "TenantInvitation",
    entityId:    inserted.invitationId,
    after:       {
      email: emailNorm,
      roles: uniqueRoles,
      expiresAt: inserted.expiresAt.toISOString(),
      companyId,
    },
    ipAddress:   ctx.ipAddress,
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

export async function cancelTenantInvitation(invitationId: string, ctx: ServiceContext): Promise<void> {
  if (!canEditTeamMembership(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar invitaciones");
  }
  const parsed = cancelTenantInvitationSchema.safeParse({ invitationId });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "Validación";
    throw new ServiceError("VALIDATION", msg);
  }

  await markExpiredPendingInvitationsForTenant(ctx.tenantId);

  const inv = await prisma.tenantInvitation.findFirst({
    where: { id: parsed.data.invitationId, tenantId: ctx.tenantId },
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

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "TENANT_INVITATION_CANCELLED",
    entityType:  "TenantInvitation",
    entityId:    inv.id,
    before:      { status: "PENDING" },
    after:       { status: "CANCELLED", cancelledAt: now.toISOString() },
    ipAddress:   ctx.ipAddress,
  });
}

export async function acceptTenantInvitation(
  token: string,
  actor: AcceptTenantInvitationActorContext,
): Promise<{ tenantId: string }> {
  const parsed = acceptTenantInvitationSchema.safeParse({ token });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "Token inválido";
    throw new ServiceError("VALIDATION", msg);
  }

  const actorUser = await prisma.user.findFirst({
    where: { id: actor.actorUserId },
    select: { id: true, email: true },
  });
  if (!actorUser) throw new ServiceError("NOT_FOUND", "Usuario no encontrado");

  if (!actorUser.email?.trim()) {
    throw new ServiceError(
      "FORBIDDEN",
      "Tu cuenta no tiene un email válido. Iniciá sesión con la cuenta Google invitada.",
    );
  }

  const actorEmailNorm = normalizeInvitationEmail(actorUser.email);

  return prisma.$transaction(async (tx) => {
    const th = hashInvitationToken(parsed.data.token);
    const inv = await tx.tenantInvitation.findFirst({
      where: { tokenHash: th },
      select: {
        id:         true,
        tenantId:   true,
        email:      true,
        roles:      true,
        status:     true,
        expiresAt:  true,
        companyId:  true,
      },
    });

    if (!inv) throw new ServiceError("NOT_FOUND", "Invitación no encontrada o token inválido");

    if (inv.status !== "PENDING") {
      throw new ServiceError("CONFLICT", "Esta invitación ya no puede aceptarse");
    }
    if (inv.expiresAt <= new Date()) {
      await tx.tenantInvitation.update({
        where: { id: inv.id },
        data:  { status: "EXPIRED" },
      });
      throw new ServiceError("CONFLICT", "La invitación expiró");
    }

    if (normalizeInvitationEmail(inv.email) !== actorEmailNorm) {
      throw new ServiceError(
        "FORBIDDEN",
        "Tenés que iniciar sesión con la cuenta invitada (el email no coincide con la invitación)",
      );
    }

    const existing = await tx.userMembership.findUnique({
      where: { userId_tenantId: { userId: actorUser.id, tenantId: inv.tenantId } },
      select: { id: true, status: true, roles: true },
    });

    if (existing?.status === "ACTIVE") {
      throw new ServiceError("CONFLICT", "Ya tenés una membresía activa en esta organización");
    }

    const activeRows = await tx.userMembership.findMany({
      where: { tenantId: inv.tenantId, status: "ACTIVE" },
      select: { id: true, roles: true },
    });
    assertOwnerInvariantAfterInviteAccept(activeRows, existing, inv.roles);

    const invitedRoles = dedupeInvitationRoles(inv.roles as UserRole[]);
    const now = new Date();

    if (existing) {
      await tx.userMembership.update({
        where: { id: existing.id },
        data: {
          status:    "ACTIVE",
          roles:     invitedRoles,
          companyId: inv.companyId,
        },
      });
    } else {
      await tx.userMembership.create({
        data: {
          userId:    actorUser.id,
          tenantId:  inv.tenantId,
          companyId: inv.companyId,
          roles:     invitedRoles,
          status:    "ACTIVE",
        },
      });
    }

    await tx.tenantInvitation.update({
      where: { id: inv.id },
      data: {
        status:           "ACCEPTED",
        acceptedByUserId: actorUser.id,
        acceptedAt:       now,
      },
    });

    await log({
      tenantId:    inv.tenantId,
      actorUserId: actor.actorUserId,
      action:      "TENANT_INVITATION_ACCEPTED",
      entityType:  "TenantInvitation",
      entityId:    inv.id,
      before:      { status: "PENDING" },
      after:       { status: "ACCEPTED", userId: actorUser.id },
      ipAddress:   actor.ipAddress,
    });

    return { tenantId: inv.tenantId };
  });
}
