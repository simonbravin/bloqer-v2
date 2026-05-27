import type { BudgetStatus } from "@bloqer/database";

export type BudgetListItem = {
  id: string;
  projectId: string;
  versionNumber: number;
  name: string;
  status: BudgetStatus;
  currency: string;
  totalCost: string;
  totalSalePrice: string;
};
