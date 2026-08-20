"use client";

import type { AccountingAccountListItem } from "./accounting-account-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { AccountingAccountCards } from "./accounting-account-cards";
import { AccountingAccountTable } from "./accounting-account-table";

export function AccountingAccountListSection({
  accounts,
  empresa,
}: {
  accounts: AccountingAccountListItem[];
  empresa?: string;
}) {
  const view = useListViewMode();
  if (view === "cards") return <AccountingAccountCards accounts={accounts} empresa={empresa} />;
  return <AccountingAccountTable accounts={accounts} empresa={empresa} />;
}
