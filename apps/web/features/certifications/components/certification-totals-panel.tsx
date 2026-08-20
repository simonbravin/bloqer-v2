"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { CertificationStatus } from "@bloqer/database";

import { formatMoneyAmount } from "@/lib/format-money";

interface CertificationTotalsPanelProps {
  status: CertificationStatus;
  currency: string;
  totalAmount: string;
  /** EDIT CERTIFICATIONS — emitir / cancelar */
  canEdit?: boolean;
  /** APPROVE CERTIFICATIONS — aprobar / rechazar */
  canApprove?: boolean;
  onIssue:   () => Promise<{ ok: true } | { error: string }>;
  onApprove: () => Promise<{ ok: true } | { error: string }>;
  onReject:  () => Promise<{ ok: true } | { error: string }>;
  onCancel:  () => Promise<{ ok: true } | { error: string }>;
}

export function CertificationTotalsPanel({
  status, currency, totalAmount,
  canEdit = false,
  canApprove = false,
  onIssue, onApprove, onReject, onCancel,
}: CertificationTotalsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: true } | { error: string }>, successMsg: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(successMsg);
      router.refresh();
    });
  }

  const isTerminal = status === "REJECTED" || status === "CANCELLED";
  const showIssue = canEdit && status === "DRAFT";
  const showReview = canApprove && status === "ISSUED";
  const showCancel =
    canEdit && (status === "DRAFT" || status === "ISSUED" || status === "APPROVED");
  const showActions = showIssue || showReview || showCancel;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold">Totales del período</h3>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Monto certificado</dt>
          <dd className="font-mono font-semibold">{formatMoneyAmount(totalAmount, currency)}</dd>
        </div>
      </dl>

      {!isTerminal && showActions && <Separator />}

      {!isTerminal && showActions && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Acciones</p>
          <div className="flex flex-col gap-2">
            {showIssue && (
              <Button size="sm" className="min-h-11 md:min-h-9" disabled={isPending} onClick={() => run(onIssue, "Certificación emitida")}>
                Emitir certificación
              </Button>
            )}
            {showReview && (
              <>
                <Button size="sm" className="min-h-11 md:min-h-9" disabled={isPending} onClick={() => run(onApprove, "Certificación aprobada")}>
                  Aprobar
                </Button>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(onReject, "Certificación rechazada")}>
                  Rechazar
                </Button>
              </>
            )}
            {showCancel && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                disabled={isPending}
                onClick={() => {
                  if (confirm("¿Cancelar esta certificación? Esta acción no se puede deshacer.")) {
                    run(onCancel, "Certificación cancelada");
                  }
                }}
              >
                Cancelar certificación
              </Button>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
