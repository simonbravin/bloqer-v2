"use client";

import type { TreasuryAccountListItem } from "./treasury-account-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { TreasuryAccountCards } from "./treasury-account-cards";
import { TreasuryAccountTable } from "./treasury-account-table";

export function TreasuryAccountListSection({ accounts }: { accounts: TreasuryAccountListItem[] }) {
  const view = useListViewMode();
  if (view === "cards") return <TreasuryAccountCards accounts={accounts} />;
  return <TreasuryAccountTable accounts={accounts} />;
}
