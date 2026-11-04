"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmationAction } from "@/hooks/use-confirmation-action";

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  pending?: boolean;
  onConfirm: () => void | Promise<unknown>;
};

/** Confirmación destructiva con AlertDialog (reemplazo de window.confirm). */
export function ConfirmAlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  pending = false,
  onConfirm,
}: ConfirmProps) {
  const { busy, actionError, handleOpenChange, confirmAction } = useConfirmationAction({
    open,
    pending,
    onOpenChange,
  });

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent aria-busy={busy}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-2 pt-1">
              {description}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {actionError ? <p className="text-sm text-destructive" role="alert">{actionError}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={busy}
            onClick={() => void confirmAction(onConfirm)}
          >
            {busy ? "Procesando…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type ReasonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  pending?: boolean;
  minChars?: number;
  onConfirm: (reason: string) => void | Promise<unknown>;
};

/** Motivo obligatorio (mín. 3 caracteres) — reemplazo de window.prompt. */
export function ReasonAlertDialog({
  open,
  onOpenChange,
  title,
  description,
  reasonLabel = "Motivo",
  reasonPlaceholder = "Escribí el motivo…",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  pending = false,
  minChars = 3,
  onConfirm,
}: ReasonProps) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const reasonId = useId();
  const reasonErrorId = `${reasonId}-error`;
  const { busy, actionError, isBusy, handleOpenChange, confirmAction } = useConfirmationAction({
    open,
    pending,
    onOpenChange,
  });

  useEffect(() => {
    if (open) {
      setReason("");
      setLocalError(null);
    }
  }, [open]);

  function handleConfirm() {
    if (isBusy()) return;
    const trimmed = reason.trim();
    if (trimmed.length < minChars) {
      setLocalError(`Indicá un motivo (mín. ${minChars} caracteres)`);
      return;
    }
    setLocalError(null);
    void confirmAction(() => onConfirm(trimmed));
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent aria-busy={busy}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-2 pt-1">
              {description}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={reasonId}>{reasonLabel}</Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            placeholder={reasonPlaceholder}
            rows={3}
            disabled={busy}
            aria-invalid={Boolean(localError)}
            aria-describedby={localError ? reasonErrorId : undefined}
          />
          {localError ? (
            <p id={reasonErrorId} className="text-sm text-destructive" role="alert">
              {localError}
            </p>
          ) : null}
        </div>
        {actionError ? <p className="text-sm text-destructive" role="alert">{actionError}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy ? "Procesando…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
