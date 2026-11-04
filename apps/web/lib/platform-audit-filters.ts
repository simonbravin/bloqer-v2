import { listPlatformAuditLogFiltersSchema } from "@bloqer/validators";

export function parsePlatformAuditSearchParams(input: {
  tenantId?: string | string[];
  action?: string | string[];
  limit?: string | string[];
}) {
  const optional = (value: string | string[] | undefined) =>
    typeof value === "string" ? value.trim() || undefined : value;
  return listPlatformAuditLogFiltersSchema.safeParse({
    targetTenantId: optional(input.tenantId),
    action: optional(input.action),
    limit: optional(input.limit) ?? 80,
  });
}
