import type { AccountingAccount } from "@bloqer/database";

export type AccountingAccountListItem = Pick<
  AccountingAccount,
  "id" | "code" | "name" | "type" | "isActive"
>;
