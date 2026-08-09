import type { TreasuryAccountType } from "@bloqer/database";

/**
 * Soft heuristic for auto-draft GL cash/bank side when TreasuryAccount has no glAccountId.
 * Matches Argentine CoA template codes (1.1.01 Caja / 1.1.02 Bancos ARS / 1.1.03 Bancos USD).
 * Contador can still edit the DRAFT journal before posting.
 */
export function suggestTreasuryGlAccountCode(account: {
  type: TreasuryAccountType;
  currency: string;
}): string {
  const currency = account.currency.trim().toUpperCase();
  if (account.type === "CASH") return "1.1.01";
  if (account.type === "BANK" && currency === "USD") return "1.1.03";
  if (account.type === "BANK") return "1.1.02";
  // DIGITAL_WALLET / OTHER → Bancos ARS as default liquid asset bucket
  return "1.1.02";
}
