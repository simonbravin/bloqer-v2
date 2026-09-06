/**
 * AI data sensitivity classification (metadata only — not a second RBAC engine).
 * Levels increase in sensitivity. Tools declare a class; advertise/execute gates use RBAC helpers.
 */
export const AI_DATA_CLASS = {
  /** L0 — product help / tutorials / definitions */
  PRODUCT_HELP: "PRODUCT_HELP",
  /** L1 — schedule, field, materials, SC/OC/receipts */
  PROJECT_OPERATIONAL: "PROJECT_OPERATIONAL",
  /** L2 — project budget, costs, project CxP/CxC, certs, project margin */
  PROJECT_FINANCIAL: "PROJECT_FINANCIAL",
  /** L3 — company-wide AP/AR / cross-project finance */
  COMPANY_FINANCIAL: "COMPANY_FINANCIAL",
  /** L4 — treasury balances, cash, bank accounts, liquidity */
  TREASURY: "TREASURY",
  /** L5 — users, permissions, tenant admin (not exposed in MVP tools) */
  ADMIN: "ADMIN",
} as const;

export type AiDataClass = (typeof AI_DATA_CLASS)[keyof typeof AI_DATA_CLASS];

export type AiToolScope = "NONE" | "PROJECT" | "COMPANY" | "TENANT";
