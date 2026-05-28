"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ScheduleItemStatus } from "@bloqer/database";
import type { ScheduleWorkspaceDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { moveScheduleItemStatusAction } from "../actions/schedule-actions";
import { mapItemToKanbanCard, STATUS_LABELS } from "../adapters/schedule-view-types";
import { ScheduleProgressDimensions } from "./schedule-progress-dimensions";
import { ScheduleBlockDialog } from "./schedule-block-dialog";

const COLUMNS: ScheduleItemStatus[] = [
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
];

const NEXT_STATUS: Partial<Record<ScheduleItemStatus, ScheduleItemStatus>> = {
  PLANNED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  BLOCKED: "IN_PROGRESS",
};

export function ScheduleKanbanView({
  projectId,
  workspace,
  items,
  onSelect,
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
  items: ScheduleWorkspaceItemDto[];
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<ScheduleWorkspaceItemDto | null>(null);

  function move(itemId: string, status: ScheduleItemStatus, blockReason?: string) {
    startTransition(async () => {
      const res = await moveScheduleItemStatusAction(projectId, itemId, status, blockReason);
      if ("error" in res) toast.error(res.error);
      else router.refresh();
    });
  }

  function onDropColumn(col: ScheduleItemStatus) {
    if (!dragId || !workspace.canEdit) return;
    const item = items.find((i) => i.id === dragId);
    setDragId(null);
    if (!item || item.status === col) return;

    if (col === "BLOCKED") {
      setBlockTarget(item);
      return;
    }
    move(item.id, col);
  }

  const byColumn = Object.fromEntries(
    COLUMNS.map((c) => [c, items.filter((i) => i.status === c)]),
  ) as Record<ScheduleItemStatus, ScheduleWorkspaceItemDto[]>;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <Card
            key={col}
            className="flex flex-col"
            onDragOver={(e) => {
              if (workspace.canEdit) e.preventDefault();
            }}
            onDrop={() => onDropColumn(col)}
          >
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{STATUS_LABELS[col]}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-2 pb-3 min-h-[120px]">
              {(byColumn[col] ?? []).map((item) => {
                const card = mapItemToKanbanCard(item);
                return (
                  <div
                    key={item.id}
                    draggable={workspace.canEdit}
                    onDragStart={() => setDragId(item.id)}
                    onDragEnd={() => setDragId(null)}
                    className="rounded-md border bg-card p-3 shadow-sm cursor-pointer hover:border-primary/40"
                    onClick={() => onSelect(item)}
                  >
                    <p className="font-medium text-sm leading-snug">{card.name}</p>
                    <div className="mt-2">
                      <ScheduleProgressDimensions item={item} compact />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {card.badges.map((b) => (
                        <span
                          key={b}
                          className="text-[10px] rounded bg-muted px-1 py-0.5 text-muted-foreground"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                    {item.blockReason && (
                      <p className="mt-1 text-[10px] text-destructive line-clamp-2">
                        {item.blockReason}
                      </p>
                    )}
                    {workspace.canEdit && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {NEXT_STATUS[col] && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={pending}
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = NEXT_STATUS[col]!;
                              if (next === "BLOCKED") setBlockTarget(item);
                              else move(item.id, next);
                            }}
                          >
                            → {STATUS_LABELS[NEXT_STATUS[col]!]}
                          </Button>
                        )}
                        {col !== "BLOCKED" && col !== "COMPLETED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            disabled={pending}
                            onClick={(e) => {
                              e.stopPropagation();
                              setBlockTarget(item);
                            }}
                          >
                            Bloquear
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <ScheduleBlockDialog
        open={blockTarget != null}
        onOpenChange={(o) => !o && setBlockTarget(null)}
        itemName={blockTarget?.name ?? ""}
        pending={pending}
        onConfirm={(reason) => {
          if (!blockTarget) return;
          move(blockTarget.id, "BLOCKED", reason);
          setBlockTarget(null);
        }}
      />
    </>
  );
}
