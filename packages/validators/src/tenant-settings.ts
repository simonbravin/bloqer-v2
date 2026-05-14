import { OVERVIEW_MODULE_KEYS_FOR_ZOD } from "@bloqer/domain";
import { z } from "zod";

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
  name:         z.string().trim().min(1).max(120),
  timezone:     z.string().trim().min(1).max(64),
  baseCurrency: z.string().trim().length(3).toUpperCase(),
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
