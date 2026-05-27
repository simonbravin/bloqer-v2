import type { BudgetStatus } from "@bloqer/database";
import { BudgetTable } from "./budget-table";

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

interface BudgetListProps {
  budgets: BudgetListItem[];
  projectId: string;
}

/** @deprecated Use BudgetTable or BudgetListSection */
export function BudgetList({ budgets, projectId }: BudgetListProps) {
  return <BudgetTable budgets={budgets} projectId={projectId} />;
}
