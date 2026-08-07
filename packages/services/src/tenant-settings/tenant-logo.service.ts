import { prisma } from "@bloqer/database";
import { isStorageConfigured } from "@bloqer/config";
import {
  assertTenantLogoStorageKey,
  buildTenantLogoStorageKey,
  deleteObject,
  getObjectBytes,
  isTenantLogoStorageKey,
  putObject,
} from "@bloqer/storage";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { canEditTenantDisplaySettings } from "./tenant-settings-guards";

export const TENANT_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const TENANT_LOGO_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

export type TenantLogoBytes = {
  body: Buffer;
  mimeType: string;
};

export type TenantLogoDisplayMeta = {
  hasLogo: boolean;
  /** Opaque cache-buster for `/api/tenant/logo?v=` (storage key filename stem). */
  version: string | null;
};

type DetectedLogo = {
  mimeType: (typeof TENANT_LOGO_ALLOWED_MIME)[number];
  ext: "png" | "jpg" | "webp";
};

function detectLogoImage(content: Buffer): DetectedLogo | null {
  if (content.length < 12) return null;
  // PNG
  if (
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47
  ) {
    return { mimeType: "image/png", ext: "png" };
  }
  // JPEG
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return { mimeType: "image/jpeg", ext: "jpg" };
  }
  // WebP: RIFF....WEBP
  if (
    content[0] === 0x52 &&
    content[1] === 0x49 &&
    content[2] === 0x46 &&
    content[3] === 0x46 &&
    content[8] === 0x57 &&
    content[9] === 0x45 &&
    content[10] === 0x42 &&
    content[11] === 0x50
  ) {
    return { mimeType: "image/webp", ext: "webp" };
  }
  return null;
}

function logoVersionFromKey(storageKey: string): string {
  const base = storageKey.split("/").pop() ?? storageKey;
  return base.replace(/\.[^.]+$/, "") || base;
}

function assertLogoScopedOrThrow(tenantId: string, storageKey: string): void {
  try {
    assertTenantLogoStorageKey(tenantId, storageKey);
  } catch {
    throw new ServiceError("FORBIDDEN", "Clave de logo inválida para este tenant");
  }
}

/**
 * Sidebar/settings display meta for the session tenant ([D-071]).
 */
export async function getTenantLogoDisplayMeta(
  ctx: ServiceContext,
): Promise<TenantLogoDisplayMeta> {
  const row = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { logoStorageKey: true },
  });
  if (!row?.logoStorageKey || !isTenantLogoStorageKey(ctx.tenantId, row.logoStorageKey)) {
    return { hasLogo: false, version: null };
  }
  return {
    hasLogo: true,
    version: logoVersionFromKey(row.logoStorageKey),
  };
}

/** @deprecated Prefer getTenantLogoDisplayMeta — kept for simple boolean checks. */
export async function tenantHasLogo(ctx: ServiceContext): Promise<boolean> {
  const meta = await getTenantLogoDisplayMeta(ctx);
  return meta.hasLogo;
}

/**
 * Load logo bytes for the session tenant only. Returns null if absent / bad key / storage miss.
 */
export async function getTenantLogoBytes(ctx: ServiceContext): Promise<TenantLogoBytes | null> {
  const row = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { logoStorageKey: true, logoMimeType: true },
  });
  if (!row?.logoStorageKey) return null;
  if (!isTenantLogoStorageKey(ctx.tenantId, row.logoStorageKey)) return null;
  if (!isStorageConfigured()) return null;

  try {
    assertLogoScopedOrThrow(ctx.tenantId, row.logoStorageKey);
    const { body, contentType } = await getObjectBytes(row.logoStorageKey);
    const mimeType = row.logoMimeType ?? contentType ?? "image/png";
    if (!(TENANT_LOGO_ALLOWED_MIME as readonly string[]).includes(mimeType)) {
      return null;
    }
    return { body, mimeType };
  } catch {
    return null;
  }
}

/** Data URI for PDF headers; null when no logo or load failure (never throws for missing logo). */
export async function getTenantLogoDataUri(ctx: ServiceContext): Promise<string | null> {
  const logo = await getTenantLogoBytes(ctx);
  if (!logo) return null;
  return `data:${logo.mimeType};base64,${logo.body.toString("base64")}`;
}

export async function uploadTenantLogo(
  input: { originalFileName: string; mimeType: string; sizeBytes: number; content: Buffer },
  ctx: ServiceContext,
): Promise<void> {
  if (!canEditTenantDisplaySettings(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar el logo del tenant");
  }
  if (!isStorageConfigured()) {
    throw new ServiceError(
      "VALIDATION",
      "El almacenamiento de archivos no está configurado. No se puede subir el logo.",
    );
  }

  if (input.sizeBytes <= 0 || input.content.length === 0) {
    throw new ServiceError("VALIDATION", "El archivo está vacío");
  }
  if (input.content.length !== input.sizeBytes) {
    throw new ServiceError("VALIDATION", "El tamaño del archivo no coincide");
  }
  if (input.sizeBytes > TENANT_LOGO_MAX_BYTES) {
    throw new ServiceError("VALIDATION", "El logo no puede superar 2 MB");
  }

  const detected = detectLogoImage(input.content);
  if (!detected) {
    throw new ServiceError(
      "VALIDATION",
      "Formato no permitido. Usá PNG, JPEG o WebP.",
    );
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { id: true, logoStorageKey: true, logoMimeType: true },
  });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");

  const previousKey = tenant.logoStorageKey;
  const storageKey = buildTenantLogoStorageKey(ctx.tenantId, detected.ext);
  assertLogoScopedOrThrow(ctx.tenantId, storageKey);

  try {
    await putObject(storageKey, input.content, detected.mimeType);
  } catch {
    throw new ServiceError("VALIDATION", "Error al guardar el logo. Intentá de nuevo.");
  }

  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: {
      logoStorageKey: storageKey,
      logoMimeType: detected.mimeType,
    },
  });

  if (
    previousKey &&
    previousKey !== storageKey &&
    isTenantLogoStorageKey(ctx.tenantId, previousKey)
  ) {
    try {
      await deleteObject(previousKey);
    } catch {
      /* best-effort cleanup */
    }
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "TENANT_LOGO_UPLOADED",
    entityType: "Tenant",
    entityId: ctx.tenantId,
    before: {
      hasLogo: Boolean(previousKey),
      mimeType: tenant.logoMimeType,
    },
    after: {
      hasLogo: true,
      mimeType: detected.mimeType,
      originalFileName: input.originalFileName.slice(0, 120),
    },
    ipAddress: ctx.ipAddress,
  });
}

export async function removeTenantLogo(ctx: ServiceContext): Promise<void> {
  if (!canEditTenantDisplaySettings(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar el logo del tenant");
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { id: true, logoStorageKey: true, logoMimeType: true },
  });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  if (!tenant.logoStorageKey) return;

  const keyToDelete = tenant.logoStorageKey;
  const keyWasValid = isTenantLogoStorageKey(ctx.tenantId, keyToDelete);

  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { logoStorageKey: null, logoMimeType: null },
  });

  if (keyWasValid && isStorageConfigured()) {
    try {
      assertLogoScopedOrThrow(ctx.tenantId, keyToDelete);
      await deleteObject(keyToDelete);
    } catch {
      /* best-effort */
    }
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "TENANT_LOGO_REMOVED",
    entityType: "Tenant",
    entityId: ctx.tenantId,
    before: {
      hasLogo: true,
      mimeType: tenant.logoMimeType,
      invalidKeyCleared: !keyWasValid,
    },
    after: { hasLogo: false },
    ipAddress: ctx.ipAddress,
  });
}
