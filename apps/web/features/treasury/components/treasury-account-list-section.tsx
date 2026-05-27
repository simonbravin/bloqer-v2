"use client";

import { useSearchParams } from "next/navigation";
import type { TreasuryAccountListItem } from "./treasury-account-list";
import { TreasuryAccountCards } from "./treasury-account-cards";
import { TreasuryAccountTable } from "./treasury-account-table";

export function TreasuryAccountListSection({ accounts }: { accounts: TreasuryAccountListItem[] }) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <TreasuryAccountCards accounts={accounts} />;
  return <TreasuryAccountTable accounts={accounts} />;
}
