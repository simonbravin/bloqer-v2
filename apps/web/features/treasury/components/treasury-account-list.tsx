import type { TreasuryAccountType, TreasuryAccountStatus } from "@bloqer/database";
import { TreasuryAccountTable } from "./treasury-account-table";

export type TreasuryAccountListItem = {
  id: string;
  name: string;
  type: TreasuryAccountType;
  currency: string;
  balance: string;
  status: TreasuryAccountStatus;
  bankName: string | null;
};

interface TreasuryAccountListProps {
  accounts: TreasuryAccountListItem[];
}

/** @deprecated Use TreasuryAccountTable or TreasuryAccountListSection */
export function TreasuryAccountList({ accounts }: TreasuryAccountListProps) {
  return <TreasuryAccountTable accounts={accounts} />;
}
