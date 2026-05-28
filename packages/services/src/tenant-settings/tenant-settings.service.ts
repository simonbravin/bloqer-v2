import { prisma } from "@bloqer/database";
import type { Prisma } from "@bloqer/database";
import type { OverviewPermissionModule } from "@bloqer/domain";
import { OVERVIEW_MODULES } from "@bloqer/domain";
import { updateTenantDisplaySettingsInputSchema, updateTenantPermissionMatrixNotesInputSchema } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import {
  canEditPermissionMatrixNotes,
  canEditTenantDisplaySettings,
  canReadTenantConfigArea,
} from "./tenant-settings-guards";

export type TenantPrimaryCompanyView = {
  id: string;
  name: string;
  legalName: string | null;
  fiscalId: string | null;
  address: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  website: string | null;
};

export type TenantSettingsView = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  baseCurrency: string;
  fiscalId: string | null;
  status: string;
  createdAt: Date;
  primaryCompany: TenantPrimaryCompanyView | null;
};

export async function getTenantSettings(ctx: ServiceContext): Promise<TenantSettingsView> {
  if (!canReadTenantConfigArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la configuración del tenant");
  }
  const row = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      baseCurrency: true,
      fiscalId: true,
      status: true,
      createdAt: true,
      companies: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          name: true,
          legalName: true,
          fiscalId: true,
          address: true,
          city: true,
          country: true,
          phone: true,
          website: true,
        },
      },
    },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  const { companies, ...tenant } = row;
  return {
    ...tenant,
    primaryCompany: companies[0] ?? null,
  };
}

export async function updateTenantDisplaySettings(raw: unknown, ctx: ServiceContext): Promise<void> {
  if (!canEditTenantDisplaySettings(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar la configuración del tenant");
  }
  const parsed = updateTenantDisplaySettingsInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  const { address, city, country, phone, website, ...tenantFields } = parsed.data;

  const before = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: {
      name: true,
      timezone: true,
      baseCurrency: true,
      companies: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          address: true,
          city: true,
          country: true,
          phone: true,
          website: true,
        },
      },
    },
  });
  if (!before) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");

  const primary = before.companies[0];
  const hasContactPatch =
    address !== undefined ||
    city !== undefined ||
    country !== undefined ||
    phone !== undefined ||
    website !== undefined;

  if (hasContactPatch && !primary) {
    throw new ServiceError("VALIDATION", "No hay empresa activa para actualizar datos de contacto");
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: ctx.tenantId },
      data: {
        name: tenantFields.name,
        timezone: tenantFields.timezone,
        baseCurrency: tenantFields.baseCurrency,
      },
    });

    if (primary && hasContactPatch) {
      const companyData: {
        address?: string;
        city?: string;
        country?: string;
        phone?: string;
        website?: string | null;
      } = {};
      if (address !== undefined) companyData.address = address;
      if (city !== undefined) companyData.city = city;
      if (country !== undefined) companyData.country = country;
      if (phone !== undefined) companyData.phone = phone;
      if (website !== undefined) companyData.website = website;

      await tx.company.update({
        where: { id: primary.id },
        data: companyData,
      });
    }
  });

  const auditBefore = {
    name: before.name,
    timezone: before.timezone,
    baseCurrency: before.baseCurrency,
    ...(primary && hasContactPatch
      ? {
          companyContact: {
            companyId: primary.id,
            address: primary.address,
            city: primary.city,
            country: primary.country,
            phone: primary.phone,
            website: primary.website,
          },
        }
      : {}),
  };
  const auditAfter = {
    name: tenantFields.name,
    timezone: tenantFields.timezone,
    baseCurrency: tenantFields.baseCurrency,
    ...(primary && hasContactPatch
      ? {
          companyContact: {
            companyId: primary.id,
            address: address ?? primary.address,
            city: city ?? primary.city,
            country: country ?? primary.country,
            phone: phone ?? primary.phone,
            website: website === undefined ? primary.website : website,
          },
        }
      : {}),
  };

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "TENANT_DISPLAY_SETTINGS_UPDATED",
    entityType: "Tenant",
    entityId: ctx.tenantId,
    before: auditBefore,
    after: auditAfter,
    ipAddress: ctx.ipAddress,
  });
}

export type PermissionMatrixNoteStored = {
  text: string;
  updatedAt: string;
  updatedByUserId: string | null;
};

export type PermissionMatrixNotesMap = Partial<Record<OverviewPermissionModule, PermissionMatrixNoteStored>>;

function isOverviewModule(key: string): key is OverviewPermissionModule {
  return (OVERVIEW_MODULES as readonly string[]).includes(key);
}

function parsePermissionMatrixNotes(raw: unknown): PermissionMatrixNotesMap {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PermissionMatrixNotesMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isOverviewModule(k)) continue;
    if (v == null || typeof v !== "object" || Array.isArray(v)) continue;
    const rec = v as Record<string, unknown>;
    const text = rec.text;
    if (typeof text !== "string") continue;
    const updatedAt = rec.updatedAt;
    const updatedByUserId = rec.updatedByUserId;
    out[k] = {
      text,
      updatedAt: typeof updatedAt === "string" ? updatedAt : new Date().toISOString(),
      updatedByUserId: typeof updatedByUserId === "string" ? updatedByUserId : null,
    };
  }
  return out;
}

export async function getTenantPermissionMatrixNotes(ctx: ServiceContext): Promise<PermissionMatrixNotesMap> {
  if (!canReadTenantConfigArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la configuración del tenant");
  }
  const row = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { permissionMatrixNotes: true },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  return parsePermissionMatrixNotes(row.permissionMatrixNotes);
}

export async function updateTenantPermissionMatrixNotes(raw: unknown, ctx: ServiceContext): Promise<void> {
  if (!canEditPermissionMatrixNotes(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar notas de la matriz de permisos");
  }
  const parsed = updateTenantPermissionMatrixNotesInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  const beforeRow = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { permissionMatrixNotes: true },
  });
  if (!beforeRow) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  const prev = parsePermissionMatrixNotes(beforeRow.permissionMatrixNotes);
  const nowIso = new Date().toISOString();
  const merged: PermissionMatrixNotesMap = { ...prev };
  for (const [mod, { text }] of Object.entries(parsed.data.notes)) {
    const trimmed = text.trim();
    if (trimmed === "") {
      delete merged[mod as OverviewPermissionModule];
    } else {
      merged[mod as OverviewPermissionModule] = {
        text: trimmed,
        updatedAt:       nowIso,
        updatedByUserId: ctx.actorUserId ?? null,
      };
    }
  }
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { permissionMatrixNotes: merged as Prisma.InputJsonValue },
  });
  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "TENANT_PERMISSION_MATRIX_NOTES_UPDATED",
    entityType:  "Tenant",
    entityId:    ctx.tenantId,
    before:      beforeRow.permissionMatrixNotes === null || beforeRow.permissionMatrixNotes === undefined
      ? undefined
      : (beforeRow.permissionMatrixNotes as Prisma.InputJsonValue),
    after:       merged as Prisma.InputJsonValue,
    ipAddress:   ctx.ipAddress,
  });
}
