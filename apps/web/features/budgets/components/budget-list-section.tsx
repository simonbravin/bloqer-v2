"use client";

import type { BudgetListItem } from "./budget-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { BudgetCards } from "./budget-cards";
import { BudgetTable } from "./budget-table";

export function BudgetListSection({
  budgets,
  projectId,
}: {
  budgets: BudgetListItem[];
  projectId: string;
}) {
  const view = useListViewMode();
  if (view === "cards") return <BudgetCards budgets={budgets} projectId={projectId} />;
  return <BudgetTable budgets={budgets} projectId={projectId} />;
}
