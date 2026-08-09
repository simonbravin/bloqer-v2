import { ServiceError } from "../types";

/**
 * Canonical cross-tenant gate used by finance mutation paths (Phase 5).
 * Services call this (or an equivalent inline check) before mutating AR/AP/treasury.
 */
export function assertResourceTenant(
  resourceTenantId: string | null | undefined,
  ctxTenantId: string,
  message = "Cross-tenant access denied",
): void {
  if (!resourceTenantId || resourceTenantId !== ctxTenantId) {
    throw new ServiceError("FORBIDDEN", message);
  }
}

/** List filters must never return foreign-tenant rows even if the query omitted tenantId. */
export function filterRowsForTenant<T extends { tenantId: string }>(
  rows: T[],
  ctxTenantId: string,
): T[] {
  return rows.filter((row) => row.tenantId === ctxTenantId);
}

export type FinanceIsolationScenario =
  | "ar_collection"
  | "ap_payment"
  | "internal_transfer"
  | "period_close"
  | "treasury_adjustment"
  | "receivable_read"
  | "payable_read"
  | "journal_entry";

/**
 * Documents which critical finance operations must apply assertResourceTenant
 * (or equivalent) for both actor tenants in dual-tenant tests.
 */
export const FINANCE_ISOLATION_SCENARIOS: FinanceIsolationScenario[] = [
  "ar_collection",
  "ap_payment",
  "internal_transfer",
  "period_close",
  "treasury_adjustment",
  "receivable_read",
  "payable_read",
  "journal_entry",
];
