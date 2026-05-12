// Permission resolution — pure TypeScript, no I/O.
// Product source of truth: docs/bloqer2.0/00-product/PERMISSIONS_MATRIX.md
// Phase 7C: `SALES_COLLECTIONS` removed from `PermissionModule` (unused in `can()` gates; AR covers invoices / receivables / collections).
// Phase 12A: Full role set matches `USER_ROLES.md` + `roles.ts`; service `can()` gates audited against this MATRIX — see PERMISSIONS_ROUTE_MATRIX.md.
//
// Project-scoped qualifications ("su proyecto") are enforced at the query/service
// layer, not here. This function resolves the role-level ceiling.

import type { UserRole } from "./roles";

export type PermissionAction = "VIEW" | "EDIT" | "APPROVE";

export type PermissionModule =
  // Operational
  | "DIRECTORY"
  | "CLIENTS"
  | "SUPPLIERS"
  | "SUBCONTRACTORS"
  | "PROJECTS"
  | "SCHEDULE"
  | "BUDGETS"
  | "WBS"
  | "CONTRACTS"
  | "CHANGE_ORDERS"
  | "RFIS"
  | "JOBSITE_LOG"
  | "CERTIFICATIONS"
  | "PROCUREMENT"
  | "PURCHASE_ORDERS"
  | "SUBCONTRACTS"
  | "INVENTORY"
  | "WAREHOUSES"
  | "DOCUMENTS"
  | "NOTIFICATIONS"
  // Financial
  | "TREASURY"
  | "BANK_ACCOUNTS"
  | "BANK_RECONCILIATION"
  | "EXPENSES_PAYMENTS"
  | "INTERNAL_TRANSFERS"
  | "AR"
  | "AP"
  | "TAXES"
  | "PERIOD_CLOSE"
  | "ACCOUNTING"
  // Admin
  | "USERS_PERMISSIONS"
  | "TENANT_SETTINGS"
  | "MASTER_DATA"
  | "AUDIT"
  | "BILLING"
  // Special (hardcoded rules)
  | "TENANT_TRANSFER"
  | "CONSOLIDATED_NET_PROFITABILITY";

// Numeric level so APPROVE >= EDIT >= VIEW.
const LEVELS: Record<PermissionAction, number> = { VIEW: 1, EDIT: 2, APPROVE: 3 };

// Null = no access. Encodes sections 2.1–2.4 of PERMISSIONS_MATRIX.md.
// Project-scope qualifications deferred to query/service layer.
const MATRIX: Record<UserRole, Partial<Record<PermissionModule, PermissionAction>>> = {
  OWNER: {
    DIRECTORY: "APPROVE", CLIENTS: "APPROVE", SUPPLIERS: "APPROVE",
    SUBCONTRACTORS: "APPROVE", PROJECTS: "APPROVE", SCHEDULE: "APPROVE",
    BUDGETS: "APPROVE", WBS: "APPROVE", CONTRACTS: "APPROVE",
    CHANGE_ORDERS: "APPROVE", RFIS: "APPROVE", JOBSITE_LOG: "APPROVE",
    CERTIFICATIONS: "APPROVE", PROCUREMENT: "APPROVE", PURCHASE_ORDERS: "APPROVE",
    SUBCONTRACTS: "APPROVE", INVENTORY: "APPROVE", WAREHOUSES: "APPROVE",
    DOCUMENTS: "APPROVE", NOTIFICATIONS: "APPROVE",
    TREASURY: "APPROVE", BANK_ACCOUNTS: "APPROVE", BANK_RECONCILIATION: "APPROVE",
    EXPENSES_PAYMENTS: "APPROVE",
    INTERNAL_TRANSFERS: "APPROVE", AR: "APPROVE", AP: "APPROVE",
    TAXES: "APPROVE", PERIOD_CLOSE: "APPROVE", ACCOUNTING: "APPROVE",
    USERS_PERMISSIONS: "APPROVE", TENANT_SETTINGS: "APPROVE",
    MASTER_DATA: "APPROVE", AUDIT: "VIEW", BILLING: "APPROVE",
    TENANT_TRANSFER: "APPROVE", CONSOLIDATED_NET_PROFITABILITY: "VIEW",
  },
  ADMIN: {
    DIRECTORY: "APPROVE", CLIENTS: "APPROVE", SUPPLIERS: "APPROVE",
    SUBCONTRACTORS: "APPROVE", PROJECTS: "APPROVE", SCHEDULE: "APPROVE",
    BUDGETS: "APPROVE", WBS: "APPROVE", CONTRACTS: "APPROVE",
    CHANGE_ORDERS: "APPROVE", RFIS: "APPROVE", JOBSITE_LOG: "APPROVE",
    CERTIFICATIONS: "APPROVE", PROCUREMENT: "APPROVE", PURCHASE_ORDERS: "APPROVE",
    SUBCONTRACTS: "APPROVE", INVENTORY: "APPROVE", WAREHOUSES: "APPROVE",
    DOCUMENTS: "APPROVE", NOTIFICATIONS: "APPROVE",
    TREASURY: "APPROVE", BANK_ACCOUNTS: "APPROVE", BANK_RECONCILIATION: "APPROVE",
    EXPENSES_PAYMENTS: "APPROVE",
    INTERNAL_TRANSFERS: "APPROVE", AR: "APPROVE", AP: "APPROVE",
    TAXES: "APPROVE", PERIOD_CLOSE: "APPROVE", ACCOUNTING: "APPROVE",
    USERS_PERMISSIONS: "APPROVE", TENANT_SETTINGS: "APPROVE",
    MASTER_DATA: "APPROVE", AUDIT: "VIEW",
    CONSOLIDATED_NET_PROFITABILITY: "VIEW",
  },
  FINANCE: {
    DIRECTORY: "VIEW", CLIENTS: "VIEW", SUPPLIERS: "VIEW",
    SUBCONTRACTORS: "VIEW", PROJECTS: "VIEW", SCHEDULE: "VIEW",
    BUDGETS: "VIEW", WBS: "VIEW", CONTRACTS: "VIEW",
    CHANGE_ORDERS: "VIEW", RFIS: "VIEW", JOBSITE_LOG: "VIEW",
    CERTIFICATIONS: "VIEW", PROCUREMENT: "VIEW", PURCHASE_ORDERS: "VIEW",
    SUBCONTRACTS: "VIEW", INVENTORY: "VIEW", WAREHOUSES: "VIEW",
    DOCUMENTS: "EDIT", NOTIFICATIONS: "VIEW",
    TREASURY: "APPROVE", BANK_ACCOUNTS: "APPROVE", BANK_RECONCILIATION: "APPROVE",
    EXPENSES_PAYMENTS: "APPROVE",
    INTERNAL_TRANSFERS: "APPROVE", AR: "APPROVE", AP: "APPROVE",
    TAXES: "APPROVE", ACCOUNTING: "APPROVE", MASTER_DATA: "VIEW",
  },
  PROCUREMENT: {
    DIRECTORY: "EDIT", SUPPLIERS: "EDIT", SUBCONTRACTORS: "EDIT",
    PROJECTS: "VIEW", SCHEDULE: "VIEW", BUDGETS: "VIEW",
    CERTIFICATIONS: "VIEW", PROCUREMENT: "APPROVE", PURCHASE_ORDERS: "APPROVE",
    SUBCONTRACTS: "EDIT", INVENTORY: "VIEW", WAREHOUSES: "VIEW",
    DOCUMENTS: "EDIT", NOTIFICATIONS: "VIEW",
    TREASURY: "VIEW", EXPENSES_PAYMENTS: "EDIT", AP: "EDIT",
    TAXES: "EDIT", ACCOUNTING: "VIEW", MASTER_DATA: "VIEW",
  },
  WAREHOUSE: {
    PROJECTS: "VIEW", SUPPLIERS: "VIEW",
    PROCUREMENT: "VIEW", PURCHASE_ORDERS: "EDIT",
    INVENTORY: "APPROVE", WAREHOUSES: "APPROVE",
    DOCUMENTS: "VIEW", NOTIFICATIONS: "VIEW", MASTER_DATA: "VIEW",
  },
  SALES: {
    DIRECTORY: "EDIT", CLIENTS: "EDIT",
    PROJECTS: "VIEW", BUDGETS: "VIEW", CONTRACTS: "EDIT",
    CERTIFICATIONS: "VIEW",
    DOCUMENTS: "EDIT", NOTIFICATIONS: "VIEW",
    TREASURY: "VIEW",
    AR: "EDIT", TAXES: "EDIT", ACCOUNTING: "VIEW",
    MASTER_DATA: "VIEW",
  },
  VIEWER: {
    DIRECTORY: "VIEW", CLIENTS: "VIEW", SUPPLIERS: "VIEW",
    SUBCONTRACTORS: "VIEW", PROJECTS: "VIEW", SCHEDULE: "VIEW",
    BUDGETS: "VIEW", WBS: "VIEW", CONTRACTS: "VIEW",
    CHANGE_ORDERS: "VIEW", RFIS: "VIEW", JOBSITE_LOG: "VIEW",
    CERTIFICATIONS: "VIEW", PROCUREMENT: "VIEW", PURCHASE_ORDERS: "VIEW",
    SUBCONTRACTS: "VIEW", INVENTORY: "VIEW", WAREHOUSES: "VIEW",
    DOCUMENTS: "VIEW", NOTIFICATIONS: "VIEW",
    TREASURY: "VIEW", BANK_ACCOUNTS: "VIEW", BANK_RECONCILIATION: "VIEW",
    EXPENSES_PAYMENTS: "VIEW",
    INTERNAL_TRANSFERS: "VIEW", AR: "VIEW", AP: "VIEW",
    TAXES: "VIEW", ACCOUNTING: "VIEW", MASTER_DATA: "VIEW",
  },
  PROJECT_MANAGER: {
    PROJECTS: "EDIT", SCHEDULE: "EDIT", BUDGETS: "EDIT", WBS: "EDIT",
    CONTRACTS: "EDIT", CHANGE_ORDERS: "EDIT", RFIS: "EDIT",
    JOBSITE_LOG: "EDIT", CERTIFICATIONS: "EDIT", SUBCONTRACTORS: "EDIT",
    PROCUREMENT: "EDIT", PURCHASE_ORDERS: "EDIT", SUBCONTRACTS: "EDIT",
    INVENTORY: "VIEW", DOCUMENTS: "EDIT", NOTIFICATIONS: "VIEW",
    TREASURY: "VIEW",
    EXPENSES_PAYMENTS: "EDIT", AR: "EDIT", AP: "VIEW", TAXES: "VIEW", ACCOUNTING: "VIEW",
  },
  SITE_FOREMAN: {
    PROJECTS: "VIEW", BUDGETS: "VIEW", RFIS: "EDIT", JOBSITE_LOG: "EDIT",
    CERTIFICATIONS: "VIEW", INVENTORY: "VIEW", DOCUMENTS: "VIEW",
    NOTIFICATIONS: "VIEW",
  },
  PROJECT_VIEWER: {
    PROJECTS: "VIEW", SCHEDULE: "VIEW", BUDGETS: "VIEW", CERTIFICATIONS: "VIEW",
    RFIS: "VIEW", JOBSITE_LOG: "VIEW", DOCUMENTS: "VIEW",
  },
};

// ─── Hardcoded rules (PERM-001 to PERM-006) ───────────────────────────────────

type HardRule = (roles: UserRole[], action: PermissionAction) => boolean | null;

// Returns true (allow), false (deny), or null (defer to matrix).
const HARD_RULES: Partial<Record<PermissionModule, HardRule>> = {
  // PERM-001: only OWNER/ADMIN can close periods.
  PERIOD_CLOSE: (roles) =>
    roles.some((r) => r === "OWNER" || r === "ADMIN") ? true : false,

  // PERM-004: only OWNER can transfer tenant ownership.
  TENANT_TRANSFER: (roles) =>
    roles.some((r) => r === "OWNER") ? true : false,

  // PERM-005: only OWNER/ADMIN can manage users & permissions.
  USERS_PERMISSIONS: (roles, action) =>
    action === "VIEW"
      ? roles.some((r) => r === "OWNER" || r === "ADMIN")
      : roles.some((r) => r === "OWNER" || r === "ADMIN")
      ? true
      : false,

  // PERM-006: consolidated net profitability visible only to OWNER/ADMIN.
  CONSOLIDATED_NET_PROFITABILITY: (roles) =>
    roles.some((r) => r === "OWNER" || r === "ADMIN") ? true : false,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function can(
  roles: UserRole[],
  action: PermissionAction,
  module: PermissionModule,
): boolean {
  if (roles.length === 0) return false;

  const hardRule = HARD_RULES[module];
  if (hardRule !== undefined) {
    const result = hardRule(roles, action);
    if (result !== null) return result;
  }

  return roles.some((role) => {
    const ceiling = MATRIX[role]?.[module];
    return ceiling !== undefined && LEVELS[ceiling] >= LEVELS[action];
  });
}
