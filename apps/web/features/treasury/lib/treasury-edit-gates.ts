import { can, hasCompanyFinanceRole, type UserRole } from "@bloqer/domain";

/** Matches bank-reconciliation.service assertCanEditBankReconciliation. */
export function canEditBankReconciliationUi(roles: UserRole[]): boolean {
  return hasCompanyFinanceRole(roles) && can(roles, "EDIT", "BANK_RECONCILIATION");
}

/** Matches treasury account / adjustment edit gates (company finance + EDIT TREASURY). */
export function canEditTreasuryUi(roles: UserRole[]): boolean {
  return hasCompanyFinanceRole(roles) && can(roles, "EDIT", "TREASURY");
}

/** Create/edit bank accounts: company finance + (EDIT TREASURY or EDIT BANK_ACCOUNTS). */
export function canEditBankAccountsUi(roles: UserRole[]): boolean {
  return (
    hasCompanyFinanceRole(roles) &&
    (can(roles, "EDIT", "TREASURY") || can(roles, "EDIT", "BANK_ACCOUNTS"))
  );
}

/** Internal transfers: company finance + EDIT INTERNAL_TRANSFERS (or TREASURY). */
export function canEditInternalTransfersUi(roles: UserRole[]): boolean {
  return (
    hasCompanyFinanceRole(roles) &&
    (can(roles, "EDIT", "INTERNAL_TRANSFERS") || can(roles, "EDIT", "TREASURY"))
  );
}

/** List/historial: company finance + VIEW INTERNAL_TRANSFERS (or TREASURY). */
export function canViewInternalTransfersUi(roles: UserRole[]): boolean {
  return (
    hasCompanyFinanceRole(roles) &&
    (can(roles, "VIEW", "INTERNAL_TRANSFERS") || can(roles, "VIEW", "TREASURY"))
  );
}
