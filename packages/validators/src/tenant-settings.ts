import { OVERVIEW_MODULE_KEYS_FOR_ZOD } from "@bloqer/domain";
import { z } from "zod";

/** ISO 4217 codes supported in UI (`AMERICAS_CURRENCY_OPTIONS` in `@bloqer/utils`). */
export const AMERICAS_CURRENCY_CODES = [
  "ARS",
  "USD",
  "EUR",
  "BRL",
  "CLP",
  "UYU",
  "PYG",
  "BOB",
  "PEN",
  "COP",
  "MXN",
  "PAB",
] as const;

export const americasCurrencyCodeSchema = z.enum(AMERICAS_CURRENCY_CODES);

const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const userRoleEnum = z.enum([
  "OWNER",
  "ADMIN",
  "FINANCE",
  "PROCUREMENT",
  "WAREHOUSE",
  "SALES",
  "VIEWER",
  "PROJECT_MANAGER",
  "SITE_FOREMAN",
  "PROJECT_VIEWER",
]);

export const updateTenantDisplaySettingsInputSchema = z.object({
  /** Shown across the app (tenant display name); not the legal company name. */
  name: z.string().trim().min(1, "El nombre a mostrar es obligatorio").max(120),
  timezone: z.string().trim().min(1).max(64),
  baseCurrency: americasCurrencyCodeSchema,
  address: z.string().trim().min(1).max(500).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().length(2, "País inválido").toUpperCase().optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  website: z.preprocess(
    emptyToUndefined,
    z.union([z.null(), z.string().trim().url("URL inválida").max(512)]).optional(),
  ),
});

export const updateTenantMemberRolesInputSchema = z.object({
  membershipId: z.string().uuid(),
  roles:        z.array(userRoleEnum).min(1).max(16),
});

export const updateTenantMemberStatusInputSchema = z.object({
  membershipId: z.string().uuid(),
  status:       z.enum(["ACTIVE", "INACTIVE"]),
});

const permissionMatrixNoteEntrySchema = z.object({
  text: z.string().trim().max(4000),
});

/** Partial update: only keys present are merged server-side. */
export const updateTenantPermissionMatrixNotesInputSchema = z.object({
  notes: z.record(z.enum(OVERVIEW_MODULE_KEYS_FOR_ZOD), permissionMatrixNoteEntrySchema),
});
