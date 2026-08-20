import "server-only";

import { createHash, randomBytes } from "crypto";
import { prisma, type Prisma, type UserRole as PrismaUserRole } from "@bloqer/database";
import type { UserRole } from "@bloqer/domain";
import { getPublicAppBaseUrl, isEmailConfigured } from "@bloqer/config";
import {
  formatNotificationEmailSubject,
  renderAuthEmailHtml,
  renderAuthEmailText,
  sendEmail,
} from "@bloqer/email";
import { formatUserLabel } from "../notifications/notification-email-context";

export function hashInvitationToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function dedupeInvitationRoles(roles: UserRole[]): PrismaUserRole[] {
  return [...new Set(roles)] as PrismaUserRole[];
}

export function buildTenantInvitationLink(rawToken: string): string {
  const path = `/invitaciones/aceptar?token=${encodeURIComponent(rawToken)}`;
  const base = getPublicAppBaseUrl()?.replace(/\/$/, "") ?? "";
  return base ? `${base}${path}` : path;
}

const INVITE_ROLE_LABEL_ES: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  FINANCE: "Finanzas",
  TREASURER: "Tesorería",
  PROJECT_FINANCE: "Finanzas de obra",
  PROCUREMENT: "Compras",
  WAREHOUSE: "Depósito",
  SALES: "Ventas",
  VIEWER: "Solo lectura",
  PROJECT_MANAGER: "Jefe de obra",
  SITE_FOREMAN: "Capataz",
  PROJECT_VIEWER: "Visor de proyecto",
};

function rolesLabelEs(roles: string[] | undefined): string | null {
  if (!roles || roles.length === 0) return null;
  return roles.map((r) => INVITE_ROLE_LABEL_ES[r] ?? r).join(", ");
}

export type TenantInvitationEmailDispatch = {
  dispatched: boolean;
  skipReason?: "email_not_configured" | "app_url_missing";
  providerError?: string;
};

export function tenantInvitationEmailFailureMessage(dispatch: TenantInvitationEmailDispatch): string {
  if (dispatch.dispatched) return "";
  if (dispatch.skipReason === "email_not_configured") {
    return "Resend no está configurado (faltan RESEND_API_KEY o RESEND_FROM_EMAIL en el entorno).";
  }
  if (dispatch.skipReason === "app_url_missing") {
    return "Falta la URL pública de la app (AUTH_URL, NEXT_PUBLIC_APP_URL o APP_URL).";
  }
  if (dispatch.providerError) {
    return `Resend rechazó el envío: ${dispatch.providerError}`;
  }
  return "No se pudo enviar el correo de invitación.";
}

export async function sendTenantInvitationEmailMessage(
  toEmail: string,
  invitationLink: string,
  tenantName: string,
  extras?: { invitedByUserId?: string | null; roles?: string[] },
): Promise<TenantInvitationEmailDispatch> {
  if (!isEmailConfigured()) {
    return { dispatched: false, skipReason: "email_not_configured" };
  }
  if (!getPublicAppBaseUrl()) {
    return { dispatched: false, skipReason: "app_url_missing" };
  }

  let invitedByName: string | null = null;
  if (extras?.invitedByUserId) {
    const inviter = await prisma.user.findUnique({
      where: { id: extras.invitedByUserId },
      select: { name: true, email: true },
    });
    invitedByName = inviter ? formatUserLabel(inviter.name, inviter.email) : null;
  }

  const contextFields = [
    { label: "Organización", value: tenantName },
    ...(invitedByName ? [{ label: "Invitó", value: invitedByName }] : []),
    ...(rolesLabelEs(extras?.roles) ? [{ label: "Roles", value: rolesLabelEs(extras?.roles)! }] : []),
  ];

  const html = renderAuthEmailHtml({
    title: "Invitación a Bloqer",
    body: `Te invitaron a unirte al equipo de ${tenantName}. Abrí el enlace para aceptar y crear o vincular tu cuenta.`,
    actionLabel: "Aceptar invitación",
    actionUrlAbsolute: invitationLink,
    organizationName: tenantName,
    contextFields,
  });
  const text = renderAuthEmailText({
    title: "Invitación a Bloqer",
    body: `Te invitaron a unirte al equipo de ${tenantName}. Abrí el enlace para aceptar y crear o vincular tu cuenta.`,
    actionLabel: "Aceptar invitación",
    actionUrlAbsolute: invitationLink,
    organizationName: tenantName,
    contextFields,
  });
  const res = await sendEmail({
    to:       toEmail,
    subject:  formatNotificationEmailSubject("Invitación a Bloqer", tenantName),
    html,
    text,
  });
  if (res.ok && res.provider === "resend") {
    return { dispatched: true };
  }
  return {
    dispatched: false,
    providerError: res.error ?? "send_failed",
  };
}

export async function markExpiredPendingInvitationsForTenant(
  tenantId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await db.tenantInvitation.updateMany({
    where: { tenantId, status: "PENDING", expiresAt: { lte: new Date() } },
    data:  { status: "EXPIRED" },
  });
}

export type InsertTenantInvitationParams = {
  tenantId: string;
  invitedByUserId: string;
  emailNorm: string;
  roles: PrismaUserRole[];
  companyId: string | null;
  expiresInDays: number;
};

export type InsertTenantInvitationResult = {
  invitationId: string;
  expiresAt: Date;
  invitationLink: string;
  rawToken: string;
};

export async function insertTenantInvitation(
  db: Prisma.TransactionClient,
  params: InsertTenantInvitationParams,
): Promise<InsertTenantInvitationResult> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashInvitationToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + params.expiresInDays);

  const created = await db.tenantInvitation.create({
    data: {
      tenantId:        params.tenantId,
      companyId:       params.companyId,
      email:           params.emailNorm,
      roles:           params.roles,
      status:          "PENDING",
      tokenHash,
      expiresAt,
      invitedByUserId: params.invitedByUserId,
    },
    select: { id: true },
  });

  return {
    invitationId: created.id,
    expiresAt,
    invitationLink: buildTenantInvitationLink(rawToken),
    rawToken,
  };
}
