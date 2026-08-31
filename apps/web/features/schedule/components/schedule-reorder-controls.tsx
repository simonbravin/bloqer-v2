"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";
import type { ScheduleTreeItemDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { moveScheduleItemAction } from "../actions/schedule-actions";

type MoveKind = "up" | "down" | "indent" | "outdent";

const MOVES: { kind: MoveKind; label: string }[] = [
  { kind: "up", label: "Subir" },
  { kind: "down", label: "Bajar" },
  { kind: "indent", label: "Sangrar" },
  { kind: "outdent", label: "Disminuir sangría" },
];

export function ScheduleReorderControls({
  projectId,
  itemId,
  items,
  treeItems,
  className,
  size = "sm",
  layout = "buttons",
}: {
  projectId: string;
  itemId: string;
  /** Filtered workspace items (fallback). */
  items?: ScheduleWorkspaceItemDto[];
  /** Full active tree for indent-confirm (ignores URL filters). */
  treeItems?: ScheduleTreeItemDto[];
  className?: string;
  size?: "sm" | "xs";
  /** `menu` = one ⋮ control (Gantt, tabla, detalle). `buttons` kept for dense toolbars. */
  layout?: "buttons" | "menu";
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
    if (kind === "indent" && willPromoteLeafOnIndent()) {
      const ok = window.confirm(
        "Si sangrás este ítem bajo el hermano de arriba, ese hermano pasará a contenedor (fechas derivadas, no editables). ¿Continuar?",
      );
      if (!ok) return;
    }
    startTransition(async () => {
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

  if (layout === "menu") {
    return (
      <div
        className={cn("shrink-0", className)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={btnClass}
              disabled={pending}
              title="Orden y sangría"
              aria-label="Orden y sangría"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {MOVES.map((m) => (
              <DropdownMenuItem
                key={m.kind}
                disabled={pending}
                onSelect={() => run(m.kind)}
              >
                {m.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

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
