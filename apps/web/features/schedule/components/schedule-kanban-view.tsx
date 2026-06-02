"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ScheduleItemStatus } from "@bloqer/database";
import type { DragEndEvent } from "@dnd-kit/core";
import type { ScheduleWorkspaceDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "@/components/kibo-ui/kanban";
import { Button } from "@/components/ui/button";
import { moveScheduleItemStatusAction } from "../actions/schedule-actions";
import { mapItemToKanbanCard, STATUS_LABELS } from "../adapters/schedule-view-types";
import { ScheduleProgressDimensions } from "./schedule-progress-dimensions";
import { ScheduleBlockDialog } from "./schedule-block-dialog";
import { ScheduleViewEmptyMessage } from "./schedule-empty-state";

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

type KanbanRow = ReturnType<typeof mapItemToKanbanCard> & {
  id: string;
  name: string;
  column: string;
  badges: string[];
};

export function ScheduleKanbanView({
  projectId,
  workspace,
  items,
  onSelect,
  filtersExcludeAll = false,
  unfilteredActiveCount = 0,
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
  items: ScheduleWorkspaceItemDto[];
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
  filtersExcludeAll?: boolean;
  unfilteredActiveCount?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blockTarget, setBlockTarget] = useState<ScheduleWorkspaceItemDto | null>(null);

  const boardItems = useMemo(
    () => items.filter((i) => i.status !== "CANCELLED"),
    [items],
  );
  const cancelledCount = items.length - boardItems.length;

  const columns = useMemo(
    () => COLUMNS.map((id) => ({ id, name: STATUS_LABELS[id] ?? id })),
    [],
  );

  const cards = useMemo(() => boardItems.map((item) => mapItemToKanbanCard(item)), [boardItems]);
  const [data, setData] = useState<KanbanRow[]>(cards);

  useEffect(() => {
    setData(cards);
  }, [cards]);

  const itemById = useMemo(() => new Map(boardItems.map((i) => [i.id, i])), [boardItems]);

  function syncDataFromServer() {
    setData(cards);
  }

  if (items.length === 0) {
    return (
      <ScheduleViewEmptyMessage
        filtersExcludeAll={filtersExcludeAll}
        unfilteredActiveCount={unfilteredActiveCount}
      />
    );
  }

  if (boardItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {cancelledCount === items.length
          ? "Las tareas del listado están canceladas y no aparecen en el tablero Kanban."
          : "No hay tareas activas para mostrar en el tablero."}
      </p>
    );
  }

  function move(itemId: string, status: ScheduleItemStatus, blockReason?: string) {
    startTransition(async () => {
      const res = await moveScheduleItemStatusAction(projectId, itemId, status, blockReason);
      if ("error" in res) {
        toast.error(res.error);
        syncDataFromServer();
      } else {
        router.refresh();
      }
    });
  }

  function resolveTargetColumn(overId: string | undefined): ScheduleItemStatus | null {
    if (!overId) return null;
    if (COLUMNS.includes(overId as ScheduleItemStatus)) return overId as ScheduleItemStatus;
    const overCard = data.find((d) => d.id === overId);
    if (overCard && COLUMNS.includes(overCard.column as ScheduleItemStatus)) {
      return overCard.column as ScheduleItemStatus;
    }
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!workspace.canEdit) {
      syncDataFromServer();
      return;
    }

    const activeId = String(event.active.id);
    const item = itemById.get(activeId);
    if (!item) {
      syncDataFromServer();
      return;
    }

    const target = resolveTargetColumn(event.over?.id ? String(event.over.id) : undefined);
    if (!target || target === item.status) {
      queueMicrotask(syncDataFromServer);
      return;
    }

    if (target === "BLOCKED") {
      queueMicrotask(syncDataFromServer);
      setBlockTarget(item);
      return;
    }

    move(item.id, target);
  }

  return (
    <>
      {cancelledCount > 0 && (
        <p className="text-xs text-muted-foreground mb-2">
          {cancelledCount} tarea{cancelledCount > 1 ? "s" : ""} cancelada
          {cancelledCount > 1 ? "s" : ""} no aparece{cancelledCount > 1 ? "n" : ""} en el tablero.
        </p>
      )}
      <KanbanProvider
        className="auto-cols-[minmax(240px,1fr)]"
        columns={columns}
        data={data}
        onDataChange={setData}
        onDragEnd={handleDragEnd}
      >
        {(column) => (
          <KanbanBoard id={column.id} key={column.id}>
            <KanbanHeader>{column.name}</KanbanHeader>
            <KanbanCards id={column.id}>
              {(card: KanbanRow) => {
                const item = itemById.get(card.id);
                if (!item) return null;
                const col = item.status as ScheduleItemStatus;
                return (
                  <KanbanCard {...card} className="gap-2 p-0">
                    <div
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer space-y-2 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onSelect(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(item);
                        }
                      }}
                    >
                      <p className="font-medium text-sm leading-snug">{card.name}</p>
                      <ScheduleProgressDimensions item={item} compact />
                      <div className="flex flex-wrap gap-1">
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
                        <p className="text-[10px] text-destructive line-clamp-2">
                          {item.blockReason}
                        </p>
                      )}
                      {workspace.canEdit && (
                        <div className="flex flex-wrap gap-1 pt-1">
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
                  </KanbanCard>
                );
              }}
            </KanbanCards>
          </KanbanBoard>
        )}
      </KanbanProvider>

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
