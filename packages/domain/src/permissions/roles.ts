// Pure TS — no Prisma import. Mirrors the UserRole enum from @prisma/client.
// Source of truth: docs/bloqer2.0/00-product/USER_ROLES.md

export type UserRole =
  | "OWNER"
  | "ADMIN"
  | "FINANCE"
  | "PROJECT_FINANCE"
  | "PROCUREMENT"
  | "WAREHOUSE"
  | "SALES"
  | "VIEWER"
  | "PROJECT_MANAGER"
  | "SITE_FOREMAN"
  | "PROJECT_VIEWER";

/** Roles that may access company finance tools (hub, treasury, GL) — D-056. */
export const COMPANY_FINANCE_ROLES: readonly UserRole[] = [
  "OWNER",
  "ADMIN",
  "FINANCE",
  "VIEWER",
] as const;

export function hasCompanyFinanceRole(roles: readonly UserRole[]): boolean {
  return roles.some((r) => (COMPANY_FINANCE_ROLES as readonly string[]).includes(r));
}
