"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ScheduleFieldItemDto } from "@bloqer/services";
import { scheduleFieldStatusActions } from "@bloqer/services/schedule-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDateRangeShortAr, formatDateShortAr } from "@/lib/gantt-date-format";
import { moveScheduleItemStatusAction } from "../actions/schedule-actions";
import { primaryWbsLink } from "../adapters/schedule-view-types";
import { FIELD_STATUS_LABELS, formatProgressPctDisplay } from "../adapters/schedule-field-labels";

const ACTION_LABELS: Record<string, string> = {
  IN_PROGRESS: "Iniciar",
  COMPLETED: "Completar",
  BLOCKED: "Bloquear",
};

export function ScheduleFieldItemSheet({
  projectId,
  canEdit,
  item,
  open,
  onOpenChange,
}: {
  projectId: string;
  canEdit: boolean;
  item: ScheduleFieldItemDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blockReason, setBlockReason] = useState("");
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    setBlocking(false);
    setBlockReason("");
  }, [item?.id, open]);

  const primary = item ? primaryWbsLink(item) : null;
  const isMilestone = item?.type === "MILESTONE";
  const predecessors = useMemo(() => item?.predecessorNames ?? [], [item]);

  const actions = item ? scheduleFieldStatusActions(item.status, item.type) : [];
  const primaryActions = actions.filter((action) => action !== "BLOCKED");
  const canBlock = actions.includes("BLOCKED");

  function runStatus(status: "IN_PROGRESS" | "COMPLETED" | "BLOCKED", reason?: string) {
    if (!item) return;
    startTransition(async () => {
      const res = await moveScheduleItemStatusAction(projectId, item.id, status, reason);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        status === "COMPLETED"
          ? "Tarea completada"
          : status === "BLOCKED"
            ? "Tarea bloqueada"
            : item.status === "BLOCKED"
              ? "Tarea reanudada"
              : "Tarea iniciada",
      );
      setBlocking(false);
      setBlockReason("");
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        data-testid="schedule-field-item-sheet"
      >
        <SheetHeader>
          <SheetTitle className="pr-8 text-left">{item?.name ?? "Tarea"}</SheetTitle>
          <SheetDescription className="text-left">
            {item
              ? `${isMilestone ? "Hito" : (FIELD_STATUS_LABELS[item.status] ?? item.status)}${
                  item.daysLate != null
                    ? ` · ${item.daysLate} ${item.daysLate === 1 ? "día" : "días"} de atraso`
                    : ""
                }`
              : "Detalle de tarea"}
          </SheetDescription>
        </SheetHeader>

        {item ? (
          <div className="mt-4 space-y-4 text-sm">
            {primary ? (
              <p>
                <span className="text-muted-foreground">EDT</span>
                <br />
                {primary.wbsCode} · {primary.wbsName}
              </p>
            ) : (
              <p className="text-muted-foreground">Sin EDT vinculado.</p>
            )}

            <p>
              <span className="text-muted-foreground">{isMilestone ? "Fecha" : "Fechas"}</span>
              <br />
              {isMilestone
                ? formatDateShortAr(item.endDate ?? item.startDate)
                : formatDateRangeShortAr(item.startDate, item.endDate)}
            </p>

            <p>
              <span className="text-muted-foreground">Progreso</span>
              <br />
              Real {formatProgressPctDisplay(item.progressPct)}
              {item.timePlanPct != null
                ? ` · Plan ${formatProgressPctDisplay(item.timePlanPct)}`
                : ""}
            </p>

            {item.blockReason ? (
              <p>
                <span className="text-muted-foreground">Motivo de bloqueo</span>
                <br />
                {item.blockReason}
              </p>
            ) : null}

            {predecessors.length > 0 ? (
              <p>
                <span className="text-muted-foreground">Depende de</span>
                <br />
                {predecessors.join(", ")}
              </p>
            ) : null}

            {canEdit && actions.length > 0 ? (
              <div className="space-y-3 pt-2">
                {blocking ? (
                  <div className="space-y-2">
                    <Label htmlFor="field-block-reason">Causa de bloqueo</Label>
                    <Textarea
                      id="field-block-reason"
                      value={blockReason}
                      onChange={(e) => setBlockReason(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="min-h-11 flex-1"
                        disabled={pending || !blockReason.trim()}
                        onClick={() => runStatus("BLOCKED", blockReason.trim())}
                      >
                        Confirmar bloqueo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => setBlocking(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {primaryActions.map((action) => {
                      const label =
                        action === "IN_PROGRESS" && item.status === "BLOCKED"
                          ? "Reanudar"
                          : ACTION_LABELS[action];
                      return (
                        <Button
                          key={action}
                          type="button"
                          className="min-h-11"
                          variant={action === "COMPLETED" ? "default" : "outline"}
                          disabled={pending}
                          data-testid={`schedule-field-action-${action.toLowerCase()}`}
                          onClick={() => runStatus(action)}
                        >
                          {label}
                        </Button>
                      );
                    })}
                    {canBlock ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={pending}
                        data-testid="schedule-field-action-blocked"
                        onClick={() => setBlocking(true)}
                      >
                        Bloquear
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Tarea no encontrada.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
