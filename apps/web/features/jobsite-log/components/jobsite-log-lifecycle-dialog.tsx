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
import { JobsiteLogStatusBadge } from "./jobsite-log-status-badge";
import { formatDateTime } from "@/lib/format";
import type { JobsiteLogStatus } from "@bloqer/database";
import type { JobsiteLogLifecycleLogEntry } from "@bloqer/services";

type LifecyclePayload = { comment?: string };

interface JobsiteLogLifecycleDialogProps {
  status: JobsiteLogStatus;
  entries: JobsiteLogLifecycleLogEntry[];
  canContribute: boolean;
  canSupervise: boolean;
  triggerLabel?: string;
  onSubmit: (data?: LifecyclePayload) => Promise<{ ok: true } | { error: string }>;
  onReturn: (data: { comment: string }) => Promise<{ ok: true } | { error: string }>;
  onApprove: (data?: LifecyclePayload) => Promise<{ ok: true } | { error: string }>;
  onCancel: (data?: LifecyclePayload) => Promise<{ ok: true } | { error: string }>;
}

type PendingAction = { kind: "submit" } | { kind: "return" } | { kind: "approve" } | { kind: "cancel" };

const ACTION_LABELS: Record<string, string> = {
  JOBSITE_LOG_CREATED: "Parte creado",
  JOBSITE_LOG_UPDATED: "Parte actualizado",
  JOBSITE_LOG_SUBMITTED: "Enviado a revisión",
  JOBSITE_LOG_APPROVED: "Aprobado",
  JOBSITE_LOG_RETURNED: "Devuelto con observaciones",
  JOBSITE_LOG_CANCELLED: "Anulado",
  "document.created": "Documento adjuntado",
  "document.uploaded": "Documento cargado",
  "document.deleted": "Documento eliminado",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviado",
  APPROVED: "Aprobado",
  CANCELLED: "Anulado",
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

function LifecycleLogList({ entries }: { entries: JobsiteLogLifecycleLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Todavía no hay movimientos registrados en este parte.
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
              <time className="text-xs tabular-nums text-muted-foreground">
                {formatDateTime(new Date(entry.createdAt))}
              </time>
            </div>
            {statusPart && (
              <p className="mt-0.5 text-xs text-muted-foreground">{statusPart}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {entry.actorName ?? "Sistema"}
            </p>
            {entry.detail && (
              <p className="mt-1 text-xs text-muted-foreground">Archivo: {entry.detail}</p>
            )}
            {entry.comment && (
              <p className="mt-2 whitespace-pre-wrap text-sm">{entry.comment}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function JobsiteLogLifecycleDialog({
  status,
  entries,
  canContribute,
  canSupervise,
  triggerLabel = "Ciclo de vida",
  onSubmit,
  onReturn,
  onApprove,
  onCancel,
}: JobsiteLogLifecycleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [comment, setComment] = useState("");
  const isTerminal = status === "APPROVED" || status === "CANCELLED";

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
        run(() => onReturn({ comment: trimmed }), "Parte devuelto con observaciones");
        break;
      case "submit":
        run(() => onSubmit(), "Parte enviado a revisión");
        break;
      case "approve":
        run(() => onApprove(), "Parte aprobado");
        break;
      case "cancel":
        if (!confirm("¿Anular este parte? Esta acción no se puede deshacer.")) return;
        run(() => onCancel(), "Parte anulado");
        break;
      default:
        break;
    }
  }

  const pendingTitle =
    pending?.kind === "return"
      ? "Observaciones de devolución"
      : pending?.kind === "submit"
        ? "Confirmar envío"
        : pending?.kind === "approve"
          ? "Confirmar aprobación"
          : pending?.kind === "cancel"
            ? "Confirmar anulación"
            : null;

  const showLifecycleActions =
    !isTerminal &&
    ((status === "DRAFT" && canContribute) || (status === "SUBMITTED" && canSupervise));

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
            Ciclo de vida del parte
            <JobsiteLogStatusBadge status={status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial
          </h3>
          <LifecycleLogList entries={entries} />
        </div>

        {showLifecycleActions && (
          <>
            <Separator />
            {pending ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">{pendingTitle}</p>
                {pending.kind === "return" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="jobsite-log-return-notes">Observaciones</Label>
                    <Textarea
                      id="jobsite-log-return-notes"
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Indicá qué debe corregir el responsable del parte…"
                      disabled={isPending}
                    />
                  </div>
                )}
                {pending.kind !== "return" && (
                  <p className="text-sm text-muted-foreground">
                    {pending.kind === "submit"
                      ? "El parte pasará a revisión del PM y no podrá editarse hasta ser devuelto o aprobado."
                      : pending.kind === "approve"
                        ? "El parte quedará aprobado como evidencia operativa."
                        : "El parte quedará anulado y no podrá recuperarse."}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" disabled={isPending} onClick={confirmPending}>
                    Confirmar
                  </Button>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={resetForm}>
                    Volver
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {status === "DRAFT" && canContribute && (
                  <>
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() => setPending({ kind: "submit" })}
                    >
                      Enviar a revisión
                    </Button>
                    <Separator />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={isPending}
                      onClick={() => setPending({ kind: "cancel" })}
                    >
                      Anular parte
                    </Button>
                  </>
                )}
                {status === "SUBMITTED" && canSupervise && (
                  <>
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() => setPending({ kind: "approve" })}
                    >
                      Aprobar parte
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
              </div>
            )}
          </>
        )}

        {isTerminal && (
          <p className="text-sm text-muted-foreground">
            Este parte está en estado final y no admite más cambios.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
