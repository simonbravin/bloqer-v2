"use client";

import { useSearchParams } from "next/navigation";
import type { AccountingAccountListItem } from "./accounting-account-list";
import { AccountingAccountCards } from "./accounting-account-cards";
import { AccountingAccountTable } from "./accounting-account-table";

export function AccountingAccountListSection({
  accounts,
  empresa,
}: {
  accounts: AccountingAccountListItem[];
  empresa?: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <AccountingAccountCards accounts={accounts} empresa={empresa} />;
  return <AccountingAccountTable accounts={accounts} empresa={empresa} />;
}
