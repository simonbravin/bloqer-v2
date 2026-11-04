"use client";

import type { BudgetListItem } from "./budget-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { BudgetCards } from "./budget-cards";
import { BudgetTable } from "./budget-table";

export function BudgetListSection({
  budgets,
  projectId,
  canCreate = false,
}: {
  budgets: BudgetListItem[];
  projectId: string;
  canCreate?: boolean;
}) {
  const view = useListViewMode();
  if (view === "cards") return <BudgetCards budgets={budgets} projectId={projectId} canCreate={canCreate} />;
  return <BudgetTable budgets={budgets} projectId={projectId} canCreate={canCreate} />;
}
