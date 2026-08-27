// Pure TS — no Prisma import. Mirrors the UserRole enum from @prisma/client.
// Source of truth: docs/bloqer2.0/00-product/USER_ROLES.md

export type UserRole =
  | "OWNER"
  | "ADMIN"
  | "FINANCE"
  | "TREASURER"
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
  "TREASURER",
  "VIEWER",
] as const;

export function hasCompanyFinanceRole(roles: readonly UserRole[]): boolean {
  return roles.some((r) => (COMPANY_FINANCE_ROLES as readonly string[]).includes(r));
}

/** UI / email labels (es-AR). Canonical enum stays English. */
export const USER_ROLE_LABEL_ES: Record<UserRole, string> = {
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
