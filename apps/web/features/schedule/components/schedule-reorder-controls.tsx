"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ScheduleTreeItemDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moveScheduleItemAction } from "../actions/schedule-actions";

type MoveKind = "up" | "down" | "indent" | "outdent";

export function ScheduleReorderControls({
  projectId,
  itemId,
  items,
  treeItems,
  className,
  size = "sm",
}: {
  projectId: string;
  itemId: string;
  /** Filtered workspace items (fallback). */
  items?: ScheduleWorkspaceItemDto[];
  /** Full active tree for indent-confirm (ignores URL filters). */
  treeItems?: ScheduleTreeItemDto[];
  className?: string;
  size?: "sm" | "xs";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function willPromoteLeafOnIndent(): boolean {
    const source =
      treeItems && treeItems.length > 0
        ? treeItems
        : (items ?? []).map((i) => ({
            id: i.id,
            parentId: i.parentId,
            sortOrder: i.sortOrder,
            status: i.status,
            isLeaf: i.isLeaf,
          }));
    const item = source.find((i) => i.id === itemId);
    if (!item || item.status === "CANCELLED") return false;
    const siblings = source
      .filter(
        (i) =>
          (i.parentId ?? null) === (item.parentId ?? null) &&
          i.status !== "CANCELLED",
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const idx = siblings.findIndex((s) => s.id === itemId);
    if (idx <= 0) return false;
    const prev = siblings[idx - 1]!;
    return prev.isLeaf;
  }

  function run(kind: MoveKind) {
    startTransition(async () => {
      if (kind === "indent" && willPromoteLeafOnIndent()) {
        const ok = window.confirm(
          "Si sangrás este ítem bajo el hermano de arriba, ese hermano pasará a contenedor (fechas derivadas, no editables). ¿Continuar?",
        );
        if (!ok) return;
      }
      const res = await moveScheduleItemAction(projectId, {
        itemId,
        action: { kind },
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (res.promotesLeafToContainer) {
        toast.message(
          "El ítem de arriba pasó a contenedor; se quitó su vínculo EDT (el sync Real va en las hojas).",
        );
      }
      router.refresh();
    });
  }

  const btnClass =
    size === "xs"
      ? "h-5 w-5 p-0 text-[10px]"
      : "h-7 w-7 p-0 text-xs";

  return (
    <div
      className={cn("flex shrink-0 items-center gap-0.5", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={btnClass}
        disabled={pending}
        title="Subir"
        aria-label="Subir"
        onClick={() => run("up")}
      >
        ↑
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={btnClass}
        disabled={pending}
        title="Bajar"
        aria-label="Bajar"
        onClick={() => run("down")}
      >
        ↓
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={btnClass}
        disabled={pending}
        title="Sangrar (indent)"
        aria-label="Sangrar"
        onClick={() => run("indent")}
      >
        →
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={btnClass}
        disabled={pending}
        title="Disminuir sangría"
        aria-label="Disminuir sangría"
        onClick={() => run("outdent")}
      >
        ←
      </Button>
    </div>
  );
}
