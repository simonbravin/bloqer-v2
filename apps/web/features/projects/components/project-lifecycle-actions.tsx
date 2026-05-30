"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ProjectStatus } from "@bloqer/database";
import type { ProjectCancellationImpact } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  activateProjectAction,
  pauseProjectAction,
  resumeProjectAction,
  completeProjectAction,
  cancelProjectAction,
  reactivateProjectAction,
  getProjectCancellationImpactAction,
} from "@/app/(app)/proyectos/actions";

type PendingAction =
  | { kind: "activate" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "complete" }
  | { kind: "cancel" }
  | { kind: "reactivate" };

const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  ON_HOLD: "En pausa",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

interface ProjectLifecycleActionsProps {
  projectId: string;
  status: ProjectStatus;
  canEditProject: boolean;
  canCancelActive: boolean;
  canReactivate: boolean;
}

async function runAction(
  action: () => Promise<{ ok: true } | { error: string }>,
  successMessage: string,
): Promise<boolean> {
  const result = await action();
  if ("error" in result) {
    toast.error(result.error);
    return false;
  }
  toast.success(successMessage);
  return true;
}

function ImpactList({ impact }: { impact: ProjectCancellationImpact | null }) {
  if (!impact) return null;
  if (impact.blockers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay documentos operativos abiertos que bloqueen la cancelación.
      </p>
    );
  }
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
      {impact.blockers.map((b) => (
        <li key={b.key}>
          {b.count} {b.label.toLowerCase()}
        </li>
      ))}
    </ul>
  );
}

export function ProjectLifecycleActions({
  projectId,
  status,
  canEditProject,
  canCancelActive,
  canReactivate,
}: ProjectLifecycleActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<ProjectCancellationImpact | null>(null);
  const [impactLoadFailed, setImpactLoadFailed] = useState(false);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isTerminal = status === "COMPLETED" || status === "CANCELLED";
  const cancelRequiresReason = status === "ACTIVE" || status === "ON_HOLD";
  const showCancel =
    !isTerminal &&
    (status === "DRAFT" ? canEditProject : canCancelActive);

  function closeDialog() {
    setPending(null);
    setComment("");
    setReason("");
    setImpact(null);
    setImpactLoadFailed(false);
  }

  async function openCancelDialog() {
    setPending({ kind: "cancel" });
    if (cancelRequiresReason) {
      setLoadingImpact(true);
      setImpactLoadFailed(false);
      const result = await getProjectCancellationImpactAction(projectId);
      setLoadingImpact(false);
      if ("error" in result) {
        toast.error(result.error);
        setImpact(null);
        setImpactLoadFailed(true);
      } else {
        setImpact(result.impact);
      }
    }
  }

  async function openReactivateDialog() {
    setPending({ kind: "reactivate" });
    setLoadingImpact(true);
    setImpactLoadFailed(false);
    const result = await getProjectCancellationImpactAction(projectId);
    setLoadingImpact(false);
    if ("error" in result) {
      toast.error(result.error);
      setImpactLoadFailed(true);
    } else {
      setImpact(result.impact);
    }
  }

  function confirm() {
    if (!pending) return;

    startTransition(async () => {
      let ok = false;
      const payload = {
        comment: comment.trim() || undefined,
        reason: reason.trim() || undefined,
      };

      switch (pending.kind) {
        case "activate":
          ok = await runAction(
            () => activateProjectAction(projectId, payload),
            "Obra activada",
          );
          break;
        case "pause":
          ok = await runAction(
            () => pauseProjectAction(projectId, payload),
            "Obra pausada",
          );
          break;
        case "resume":
          ok = await runAction(
            () => resumeProjectAction(projectId, payload),
            "Obra reanudada",
          );
          break;
        case "complete":
          ok = await runAction(
            () => completeProjectAction(projectId, payload),
            "Obra completada",
          );
          break;
        case "cancel":
          ok = await runAction(
            () => cancelProjectAction(projectId, payload),
            "Obra cancelada",
          );
          break;
        case "reactivate":
          if (!reason.trim()) {
            toast.error("El motivo de reactivación es obligatorio");
            return;
          }
          ok = await runAction(
            () => reactivateProjectAction(projectId, { reason: reason.trim() }),
            "Obra reactivada",
          );
          break;
      }

      if (ok) {
        closeDialog();
        router.refresh();
      }
    });
  }

  const dialogTitle = (() => {
    switch (pending?.kind) {
      case "activate":
        return "Activar obra";
      case "pause":
        return "Pausar obra";
      case "resume":
        return "Reanudar obra";
      case "complete":
        return "Completar obra";
      case "cancel":
        return "Cancelar obra";
      case "reactivate":
        return "Reactivar obra";
      default:
        return "";
    }
  })();

  const requiresReason =
    pending?.kind === "reactivate" ||
    (pending?.kind === "cancel" && cancelRequiresReason);

  const cancelBlocked =
    pending?.kind === "cancel" &&
    (impact?.hasBlockers || (cancelRequiresReason && impactLoadFailed));

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {!isTerminal && canEditProject && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/editar`}>Editar</Link>
          </Button>
        )}
        {status === "DRAFT" && canEditProject && (
          <Button size="sm" onClick={() => setPending({ kind: "activate" })}>
            Activar
          </Button>
        )}
        {status === "ACTIVE" && canEditProject && (
          <>
            <Button variant="outline" size="sm" onClick={() => setPending({ kind: "pause" })}>
              Pausar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPending({ kind: "complete" })}>
              Completar
            </Button>
          </>
        )}
        {status === "ON_HOLD" && canEditProject && (
          <Button size="sm" onClick={() => setPending({ kind: "resume" })}>
            Reanudar
          </Button>
        )}
        {showCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={openCancelDialog}
          >
            Cancelar proyecto
          </Button>
        )}
        {status === "CANCELLED" && canReactivate && (
          <Button size="sm" variant="outline" onClick={openReactivateDialog}>
            Reactivar proyecto
          </Button>
        )}
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {pending?.kind === "activate" &&
                "La obra pasará a activa y se habilitarán compras, certificaciones y movimientos imputados."}
              {pending?.kind === "resume" &&
                "La obra volverá a aceptar operaciones de compra, certificación y finanzas."}
              {pending?.kind === "pause" &&
                "No se podrán crear nuevos movimientos hasta reanudar la obra."}
              {pending?.kind === "complete" &&
                "La obra quedará en solo lectura operativa. No se podrán cargar nuevos documentos."}
              {pending?.kind === "cancel" &&
                "Los presupuestos, facturas y pagos no se eliminan. La obra quedará en solo lectura."}
              {pending?.kind === "reactivate" &&
                "Se restaurará el estado operativo previo a la cancelación. Quedará registrado en auditoría."}
            </DialogDescription>
          </DialogHeader>

          {pending?.kind === "cancel" && cancelRequiresReason && impactLoadFailed && (
            <p className="text-sm text-destructive">
              No se pudo verificar el impacto. Reintentá o contactá a soporte antes de cancelar.
            </p>
          )}

          {pending?.kind === "reactivate" && impactLoadFailed && (
            <p className="text-sm text-destructive">
              No se pudo determinar el estado destino. Reintentá antes de reactivar.
            </p>
          )}

          {pending?.kind === "cancel" && cancelRequiresReason && (
            <div className="space-y-2">
              {loadingImpact ? (
                <p className="text-sm text-muted-foreground">Verificando documentos abiertos…</p>
              ) : (
                <ImpactList impact={impact} />
              )}
            </div>
          )}

          {pending?.kind === "reactivate" && impact?.reactivationTargetStatus && (
            <p className="text-sm">
              Estado destino:{" "}
              <span className="font-medium">
                {STATUS_LABELS[impact.reactivationTargetStatus]}
              </span>
            </p>
          )}

          {(pending?.kind === "pause" || pending?.kind === "activate") && (
            <div className="space-y-2">
              <Label htmlFor="lifecycle-comment">Comentario (opcional)</Label>
              <Textarea
                id="lifecycle-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                disabled={isPending}
              />
            </div>
          )}

          {requiresReason && (
            <div className="space-y-2">
              <Label htmlFor="lifecycle-reason">
                Motivo (obligatorio)
              </Label>
              <Textarea
                id="lifecycle-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                disabled={isPending}
                placeholder={
                  pending?.kind === "reactivate"
                    ? "Ej.: cancelación por error operativo"
                    : "Ej.: desistimiento del cliente"
                }
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Volver
            </Button>
            <Button
              variant={pending?.kind === "cancel" ? "destructive" : "default"}
              onClick={confirm}
              disabled={
                isPending ||
                loadingImpact ||
                cancelBlocked ||
                (pending?.kind === "reactivate" && impactLoadFailed) ||
                (requiresReason && !reason.trim())
              }
            >
              {isPending ? "Procesando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
