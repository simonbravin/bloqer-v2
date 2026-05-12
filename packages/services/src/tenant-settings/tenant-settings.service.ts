import { prisma } from "@bloqer/database";
import { updateTenantDisplaySettingsInputSchema } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { canEditTenantDisplaySettings, canReadTenantConfigArea } from "./tenant-settings-guards";

export type TenantSettingsView = {
  id:           string;
  name:         string;
  slug:         string;
  timezone:     string;
  baseCurrency: string;
  fiscalId:     string | null;
  status:       string;
  createdAt:    Date;
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
    },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  return row;
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
  const before = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { name: true, timezone: true, baseCurrency: true },
  });
  if (!before) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");

  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: {
      name:         parsed.data.name,
      timezone:     parsed.data.timezone,
      baseCurrency: parsed.data.baseCurrency,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "TENANT_DISPLAY_SETTINGS_UPDATED",
    entityType:  "Tenant",
    entityId:    ctx.tenantId,
    before:      { name: before.name, timezone: before.timezone, baseCurrency: before.baseCurrency },
    after:       { name: parsed.data.name, timezone: parsed.data.timezone, baseCurrency: parsed.data.baseCurrency },
    ipAddress:   ctx.ipAddress,
  });
}
