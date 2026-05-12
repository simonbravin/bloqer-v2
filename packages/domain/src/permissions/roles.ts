// Pure TS — no Prisma import. Mirrors the UserRole enum from @prisma/client.
// Source of truth: docs/bloqer2.0/00-product/USER_ROLES.md

export type UserRole =
  | "OWNER"
  | "ADMIN"
  | "FINANCE"
  | "PROCUREMENT"
  | "WAREHOUSE"
  | "SALES"
  | "VIEWER"
  | "PROJECT_MANAGER"
  | "SITE_FOREMAN"
  | "PROJECT_VIEWER";
