import type { AccountingAccount } from "@bloqer/database";
import { AccountingAccountTable } from "./accounting-account-table";

export type AccountingAccountListItem = Pick<
  AccountingAccount,
  "id" | "code" | "name" | "type" | "isActive"
>;

/** @deprecated Use AccountingAccountTable or AccountingAccountListSection */
export function AccountingAccountList({
  accounts,
  empresa,
}: {
  accounts: AccountingAccountListItem[];
  empresa?: string;
}) {
  return <AccountingAccountTable accounts={accounts} empresa={empresa} />;
}
