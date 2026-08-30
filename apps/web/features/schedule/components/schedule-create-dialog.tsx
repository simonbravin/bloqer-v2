"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ScheduleTreeItemDto } from "@bloqer/services";
import { suggestPlacementForWbs } from "@bloqer/services/schedule-placement";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createScheduleItemAction } from "../actions/schedule-actions";
import { ScheduleWbsPicker } from "./schedule-wbs-picker";

const ROOT = "__root__";
const NONE_AFTER = "__none__";

export function ScheduleCreateDialog({
  projectId,
  treeItems,
}: {
  projectId: string;
  /** Full active tree for placement (ignores URL filters). */
  treeItems: ScheduleTreeItemDto[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"TASK" | "MILESTONE">("TASK");
  const [wbsNodeId, setWbsNodeId] = useState("");
  const [parentId, setParentId] = useState<string>(ROOT);
  const [afterItemId, setAfterItemId] = useState<string>(NONE_AFTER);
  const [placementHint, setPlacementHint] = useState<string | null>(null);
  const lastSuggestedWbs = useRef<string>("");

  const placementSource: Array<{
    id: string;
    parentId: string | null;
    sortOrder: number;
    status: string;
    name: string;
    isLeaf: boolean;
    wbsNodeIds: string[];
  }> = useMemo(
    () =>
      treeItems.map((i) => ({
        id: i.id,
        parentId: i.parentId,
        sortOrder: i.sortOrder,
        status: i.status,
        name: i.name,
        isLeaf: i.isLeaf,
        wbsNodeIds: i.wbsNodeIds,
      })),
    [treeItems],
  );

  const parentOptions = useMemo(
    () => placementSource.map((i) => ({ id: i.id, label: i.name })),
    [placementSource],
  );

  const siblingOptions = useMemo(() => {
    const pid = parentId === ROOT ? null : parentId;
    return placementSource
      .filter((i) => (i.parentId ?? null) === pid)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [placementSource, parentId]);

  const parentIsLeaf =
    parentId !== ROOT &&
    (placementSource.find((i) => i.id === parentId)?.isLeaf ?? false);

  useEffect(() => {
    if (!wbsNodeId) {
      lastSuggestedWbs.current = "";
      setPlacementHint(null);
      return;
    }
    if (lastSuggestedWbs.current === wbsNodeId) return;
    if (placementSource.length === 0) return;

    lastSuggestedWbs.current = wbsNodeId;

    const suggested = suggestPlacementForWbs(placementSource, wbsNodeId);
    if (!suggested) {
      setPlacementHint(null);
      return;
    }
    setParentId(suggested.parentId ?? ROOT);
    setAfterItemId(suggested.afterItemId ?? NONE_AFTER);
    const anchor = placementSource.find((i) => i.id === suggested.afterItemId);
    setPlacementHint(
      anchor
        ? `Se ubicará justo debajo de «${anchor.name}» (hermano, no hijo). El vínculo EDT no mueve la fila.`
        : "Ubicación sugerida según la partida EDT.",
    );
  }, [wbsNodeId, placementSource]);

  function resetForm() {
    setWbsNodeId("");
    setParentId(ROOT);
    setAfterItemId(NONE_AFTER);
    setPlacementHint(null);
    setType("TASK");
    lastSuggestedWbs.current = "";
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const startDate = (fd.get("startDate") as string) || null;
    let endDate = (fd.get("endDate") as string) || null;
    if (type === "MILESTONE") {
      const d = startDate || endDate;
      endDate = d;
    }
    if (!name) return;

    if (parentIsLeaf) {
      const parentName = placementSource.find((i) => i.id === parentId)?.name ?? "el ítem";
      const ok = window.confirm(
        `«${parentName}» es una hoja con fechas y EDT propios. Al colocar un hijo, pasará a contenedor (fechas derivadas) y se quitará su vínculo EDT. ¿Continuar?`,
      );
      if (!ok) return;
    }

    const resolvedParent = parentId === ROOT ? null : parentId;
    const resolvedAfter = afterItemId === NONE_AFTER ? null : afterItemId;
    const milestoneDate = type === "MILESTONE" ? startDate || endDate : null;

    startTransition(async () => {
      const res = await createScheduleItemAction(projectId, {
        name,
        type,
        startDate: (type === "MILESTONE" ? milestoneDate : startDate) || undefined,
        endDate: (type === "MILESTONE" ? milestoneDate : endDate) || undefined,
        wbsNodeId: wbsNodeId || undefined,
        parentId: resolvedParent,
        afterItemId: resolvedAfter,
      });
      if ("error" in res) toast.error(res.error);
      else {
        const anchor = resolvedAfter
          ? placementSource.find((i) => i.id === resolvedAfter)
          : null;
        const kind = type === "MILESTONE" ? "Hito" : "Tarea";
        toast.success(
          anchor
            ? `${kind} creado junto a «${anchor.name}»`
            : wbsNodeId
              ? `${kind} creado y vinculado a EDT`
              : `${kind} creado`,
        );
        setOpen(false);
        resetForm();
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          + Tarea / hito
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nueva tarea o hito</DialogTitle>
            <DialogDescription>
              Creá un ítem y ubicálo en el árbol. El vínculo EDT alimenta costos y
              avance (en tareas); no cambia la altura en el Gantt.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="space-y-1">
              <Label htmlFor="sched-name">Nombre</Label>
              <Input id="sched-name" name="name" required maxLength={500} />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "TASK" | "MILESTONE")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TASK">Tarea</SelectItem>
                  <SelectItem value="MILESTONE">Hito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === "MILESTONE" ? (
              <div className="space-y-1">
                <Label htmlFor="sched-start">Fecha</Label>
                <Input id="sched-start" name="startDate" type="date" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sched-start">Inicio</Label>
                  <Input id="sched-start" name="startDate" type="date" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sched-end">Fin</Label>
                  <Input id="sched-end" name="endDate" type="date" />
                </div>
              </div>
            )}
            <ScheduleWbsPicker
              projectId={projectId}
              value={wbsNodeId}
              onValueChange={(id) => {
                lastSuggestedWbs.current = "";
                setWbsNodeId(id);
              }}
              disabled={pending}
            />
            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-sm font-medium">Ubicación</Label>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Colocar bajo</Label>
                <Select
                  value={parentId}
                  onValueChange={(v) => {
                    setParentId(v);
                    setAfterItemId(NONE_AFTER);
                    setPlacementHint(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>Raíz del cronograma</SelectItem>
                    {parentOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Insertar después de</Label>
                <Select value={afterItemId} onValueChange={setAfterItemId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_AFTER}>Al final</SelectItem>
                    {siblingOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {parentIsLeaf && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  El padre elegido es una hoja: al crear un hijo pasará a contenedor y perderá el vínculo EDT.
                </p>
              )}
              {placementHint && (
                <p className="text-xs text-muted-foreground">{placementHint}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
