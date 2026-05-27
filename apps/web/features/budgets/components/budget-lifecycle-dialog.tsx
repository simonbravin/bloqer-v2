"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { BudgetStatusBadge } from "./budget-status-badge";
import { formatDateTime } from "@/lib/format";
import type { BudgetStatus } from "@bloqer/database";
import type { BudgetLifecycleLogEntry } from "@bloqer/services";

type LifecyclePayload = { comment?: string };

interface BudgetLifecycleDialogProps {
  status: BudgetStatus;
  lifecycleLog: BudgetLifecycleLogEntry[];
  triggerLabel?: string;
  onSubmitForReview: (data?: LifecyclePayload) => Promise<{ ok: true } | { error: string }>;
  onReturnForChanges: (data: { comment: string }) => Promise<{ ok: true } | { error: string }>;
  onApprove: (data?: LifecyclePayload) => Promise<{ ok: true } | { error: string }>;
  onClose: (data?: LifecyclePayload) => Promise<{ ok: true } | { error: string }>;
  onCancel: (data?: LifecyclePayload) => Promise<{ ok: true } | { error: string }>;
}

type PendingAction =
  | { kind: "submit" }
  | { kind: "return" }
  | { kind: "approve" }
  | { kind: "close" }
  | { kind: "cancel" };

const ACTION_LABELS: Record<string, string> = {
  "budget.created": "Presupuesto creado",
  "budget.submitted_for_review": "Enviado a revisión",
  "budget.returned_for_changes": "Devuelto con observaciones",
  "budget.approved": "Aprobado",
  "budget.closed": "Cerrado",
  "budget.cancelled": "Cancelado",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  RETURNED_FOR_CHANGES: "Con observaciones",
  APPROVED: "Aprobado",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

async function runLifecycle(
  action: () => Promise<{ ok: true } | { error: string }>,
  successMessage: string,
) {
  const result = await action();
  if ("error" in result) {
    toast.error(result.error);
    return false;
  }
  toast.success(successMessage);
  return true;
}

function LifecycleLogList({ entries }: { entries: BudgetLifecycleLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Todavía no hay movimientos registrados en el ciclo de vida.
      </p>
    );
  }

  return (
    <ul className="max-h-52 space-y-3 overflow-y-auto pr-1 text-sm">
      {entries.map((entry) => {
        const label = ACTION_LABELS[entry.action] ?? entry.action;
        const statusPart =
          entry.fromStatus && entry.toStatus
            ? `${STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus} → ${STATUS_LABELS[entry.toStatus] ?? entry.toStatus}`
            : entry.toStatus
              ? STATUS_LABELS[entry.toStatus] ?? entry.toStatus
              : null;

        return (
          <li key={entry.id} className="rounded-md border bg-muted/30 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{label}</span>
              <time className="text-xs text-muted-foreground tabular-nums">
                {formatDateTime(new Date(entry.createdAt))}
              </time>
            </div>
            {statusPart && (
              <p className="mt-0.5 text-xs text-muted-foreground">{statusPart}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {entry.actorName ?? "Sistema"}
            </p>
            {entry.comment && (
              <p className="mt-2 whitespace-pre-wrap text-sm">{entry.comment}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function BudgetLifecycleDialog({
  status,
  lifecycleLog,
  triggerLabel = "Ciclo de vida",
  onSubmitForReview,
  onReturnForChanges,
  onApprove,
  onClose,
  onCancel,
}: BudgetLifecycleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [comment, setComment] = useState("");
  const isTerminal = status === "CLOSED" || status === "CANCELLED";

  function resetForm() {
    setPending(null);
    setComment("");
  }

  function run(
    action: () => Promise<{ ok: true } | { error: string }>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const ok = await runLifecycle(action, successMessage);
      if (ok) {
        resetForm();
        setOpen(false);
        router.refresh();
      }
    });
  }

  function confirmPending() {
    const trimmed = comment.trim();
    switch (pending?.kind) {
      case "return":
        if (!trimmed) {
          toast.error("Las observaciones son obligatorias");
          return;
        }
        run(() => onReturnForChanges({ comment: trimmed }), "Devuelto con observaciones");
        break;
      case "submit":
        run(
          () => onSubmitForReview(trimmed ? { comment: trimmed } : undefined),
          "Presupuesto enviado a revisión",
        );
        break;
      case "approve":
        run(
          () => onApprove(trimmed ? { comment: trimmed } : undefined),
          "Presupuesto aprobado",
        );
        break;
      case "close":
        run(
          () => onClose(trimmed ? { comment: trimmed } : undefined),
          "Presupuesto cerrado",
        );
        break;
      case "cancel":
        if (!confirm("¿Cancelar este presupuesto? Esta acción no se puede deshacer.")) return;
        run(
          () => onCancel(trimmed ? { comment: trimmed } : undefined),
          "Presupuesto cancelado",
        );
        break;
      default:
        break;
    }
  }

  const pendingTitle =
    pending?.kind === "return"
      ? "Observaciones de devolución"
      : pending?.kind === "submit"
        ? "Comentario al enviar (opcional)"
        : pending?.kind === "approve"
          ? "Comentario de aprobación (opcional)"
          : pending?.kind === "close"
            ? "Comentario al cerrar (opcional)"
            : pending?.kind === "cancel"
              ? "Motivo de cancelación (opcional)"
              : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Ciclo de vida del presupuesto
            <BudgetStatusBadge status={status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial
          </h3>
          <LifecycleLogList entries={lifecycleLog} />
        </div>

        {!isTerminal && (
          <>
            <Separator />
            {pending ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">{pendingTitle}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="lifecycle-comment">
                    {pending.kind === "return" ? "Observaciones" : "Comentario"}
                  </Label>
                  <Textarea
                    id="lifecycle-comment"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={
                      pending.kind === "return"
                        ? "Indicá qué debe corregir el responsable del presupuesto…"
                        : "Opcional…"
                    }
                    disabled={isPending}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={confirmPending}
                  >
                    Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={resetForm}
                  >
                    Volver
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(status === "DRAFT" || status === "RETURNED_FOR_CHANGES") && (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => setPending({ kind: "submit" })}
                  >
                    Enviar a revisión
                  </Button>
                )}
                {status === "IN_REVIEW" && (
                  <>
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() => setPending({ kind: "approve" })}
                    >
                      Aprobar presupuesto
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => setPending({ kind: "return" })}
                    >
                      Devolver con observaciones
                    </Button>
                  </>
                )}
                {status === "APPROVED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setPending({ kind: "close" })}
                  >
                    Cerrar presupuesto
                  </Button>
                )}
                <Separator />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={isPending}
                  onClick={() => setPending({ kind: "cancel" })}
                >
                  Cancelar presupuesto
                </Button>
              </div>
            )}
          </>
        )}

        {isTerminal && (
          <p className="text-sm text-muted-foreground">
            Este presupuesto está en estado final y no admite más cambios.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
