"use client";

import { useSearchParams } from "next/navigation";
import type { BudgetListItem } from "./budget-list";
import { BudgetCards } from "./budget-cards";
import { BudgetTable } from "./budget-table";

export function BudgetListSection({
  budgets,
  projectId,
}: {
  budgets: BudgetListItem[];
  projectId: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <BudgetCards budgets={budgets} projectId={projectId} />;
  return <BudgetTable budgets={budgets} projectId={projectId} />;
}
