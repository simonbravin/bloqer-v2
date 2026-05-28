"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ScheduleWorkspaceDto } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { ScheduleSummaryCards } from "./schedule-summary-cards";
import { ScheduleTableView } from "./schedule-table-view";
import { ScheduleGanttView } from "./schedule-gantt-view";
import { ScheduleKanbanView } from "./schedule-kanban-view";
import { ScheduleCalendarView } from "./schedule-calendar-view";
import { ScheduleImportDialog } from "./schedule-import-dialog";
import { ScheduleItemDrawer } from "./schedule-item-drawer";
import { ScheduleFilters } from "./schedule-filters";
import { ScheduleCreateDialog } from "./schedule-create-dialog";
import type { ScheduleWorkspaceItemDto } from "@bloqer/services";

type ViewId = "gantt" | "calendar" | "kanban" | "table";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "gantt", label: "Gantt" },
  { id: "calendar", label: "Calendario" },
  { id: "kanban", label: "Kanban" },
  { id: "table", label: "Tabla" },
];

export function ScheduleWorkspace({
  projectId,
  workspace,
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewId>("table");
  const [selected, setSelected] = useState<ScheduleWorkspaceItemDto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const delayedOnly = searchParams.get("delayedOnly") === "1";
  const statusFilter = searchParams.get("status");
  const items = workspace.items.filter((i) => {
    if (delayedOnly && i.daysLate == null) return false;
    if (statusFilter && i.status !== statusFilter) return false;
    return true;
  });

  function selectItem(item: ScheduleWorkspaceItemDto) {
    setSelected(item);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-6">
      <ScheduleSummaryCards workspace={workspace} />

      <ScheduleFilters
        budgets={workspace.availableBudgets}
        currentBudgetId={workspace.budgetId}
        delayedOnly={delayedOnly}
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          Base: {workspace.budgetName}
        </span>
        {workspace.canEdit && (
          <>
            <ScheduleImportDialog
              projectId={projectId}
              budgets={workspace.availableBudgets}
              defaultBudgetId={workspace.budgetId}
            />
            <ScheduleCreateDialog projectId={projectId} />
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-1 rounded-lg border p-1">
          {VIEWS.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={view === v.id ? "secondary" : "ghost"}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>
      </div>

      {view === "table" && <ScheduleTableView items={items} onSelect={selectItem} />}
      {view === "gantt" && (
        <ScheduleGanttView
          projectId={projectId}
          workspace={workspace}
          items={items}
          onSelect={selectItem}
        />
      )}
      {view === "kanban" && (
        <ScheduleKanbanView
          projectId={projectId}
          workspace={workspace}
          items={items}
          onSelect={selectItem}
        />
      )}
      {view === "calendar" && (
        <ScheduleCalendarView items={items} onSelect={selectItem} />
      )}

      <ScheduleItemDrawer
        projectId={projectId}
        workspace={workspace}
        item={selected}
        allItems={workspace.items}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
