import { prisma } from "@bloqer/database";
import {
  listSupportedTenantModules,
  type PermissionModule,
  OVERVIEW_MODULES,
} from "@bloqer/domain";
import { updatePlatformTenantModuleInputSchema } from "@bloqer/validators";
import { ServiceError } from "../types";
import { createPlatformAuditLog } from "./platform-audit.service";
import { assertPlatformAccess, type PlatformServiceContext } from "./platform-auth.service";

const MODULE_KEY_SET = new Set<string>(OVERVIEW_MODULES as readonly string[]);

function parseUpdate(raw: unknown) {
  const parsed = updatePlatformTenantModuleInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  return parsed.data;
}

function assertKnownModuleKey(key: string): asserts key is PermissionModule {
  if (!MODULE_KEY_SET.has(key)) {
    throw new ServiceError("VALIDATION", "Módulo inválido");
  }
}

export type PlatformTenantModuleRow = {
  moduleKey: PermissionModule;
  label: string;
  isEnabled: boolean;
  /** True when a `TenantModuleSetting` row exists; false means default-on (no row yet). */
  hasExplicitRow: boolean;
  internalNotes: string | null;
};

export type PlatformTenantModuleCoverage = {
  totalModules: number;
  explicitRows: number;
  missingRows: number;
};

export async function listPlatformTenantModuleRows(
  tenantId: string,
  ctx: PlatformServiceContext,
): Promise<PlatformTenantModuleRow[]> {
  await assertPlatformAccess(ctx);
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  }

  const rows = await prisma.tenantModuleSetting.findMany({
    where: { tenantId },
  });
  const byKey = new Map(rows.map((r) => [r.moduleKey, r]));

  return listSupportedTenantModules().map(({ moduleKey, label }) => {
    const r = byKey.get(moduleKey);
    return {
      moduleKey,
      label,
      isEnabled: r ? r.isEnabled : true,
      hasExplicitRow: Boolean(r),
      internalNotes: r?.internalNotes ?? null,
    };
  });
}

/** Coverage of explicit `TenantModuleSetting` rows vs catalog size (default-on gaps). */
export function summarizePlatformTenantModuleCoverage(
  rows: readonly PlatformTenantModuleRow[],
): PlatformTenantModuleCoverage {
  const explicitRows = rows.filter((r) => r.hasExplicitRow).length;
  return {
    totalModules: rows.length,
    explicitRows,
    missingRows: rows.length - explicitRows,
  };
}

/**
 * Platform-only: tenant admins cannot call this. Upserts `TenantModuleSetting`;
 * absence of a row still means enabled at read time — rows record overrides/explicit state from the console.
 */
export async function updateTenantModuleSetting(
  raw: unknown,
  ctx: PlatformServiceContext,
): Promise<void> {
  await assertPlatformAccess(ctx);
  const input = parseUpdate(raw);
  assertKnownModuleKey(input.moduleKey);

  const tenant = await prisma.tenant.findFirst({
    where: { id: input.tenantId },
    select: { id: true },
  });
  if (!tenant) {
    throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  }

  const notes =
    input.internalNotes === undefined
      ? undefined
      : input.internalNotes === null
        ? null
        : input.internalNotes.trim() === ""
          ? null
          : input.internalNotes;

  await prisma.$transaction(async (tx) => {
    await tx.tenantModuleSetting.upsert({
      where: {
        tenantId_moduleKey: { tenantId: input.tenantId, moduleKey: input.moduleKey },
      },
      create: {
        tenantId:      input.tenantId,
        moduleKey:     input.moduleKey,
        isEnabled:     input.isEnabled,
        internalNotes: notes ?? null,
      },
      update: {
        isEnabled:     input.isEnabled,
        internalNotes: notes === undefined ? undefined : notes,
      },
    });

    await createPlatformAuditLog(
      {
        actorUserId: ctx.actorUserId,
        action:      "platform.tenant.module_updated",
        targetTenantId: input.tenantId,
        metadata: {
          moduleKey: input.moduleKey,
          isEnabled: input.isEnabled,
        },
      },
      tx,
    );
  });
}
