import type { TreasuryAccountType, TreasuryAccountStatus } from "@bloqer/database";

export type TreasuryAccountListItem = {
  id: string;
  name: string;
  type: TreasuryAccountType;
  currency: string;
  balance: string;
  status: TreasuryAccountStatus;
  bankName: string | null;
};
