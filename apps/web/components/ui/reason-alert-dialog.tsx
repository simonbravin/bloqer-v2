"use client";

import { useEffect, useState, type ReactNode } from "react";
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

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  pending?: boolean;
  onConfirm: () => void;
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
  const [submitting, setSubmitting] = useState(false);
  const busy = pending || submitting;

  useEffect(() => {
    if (!open) setSubmitting(false);
  }, [open]);

  function handleConfirm() {
    if (busy) return;
    setSubmitting(true);
    onConfirm();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-2 pt-1">
              {description}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
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
  onConfirm: (reason: string) => void;
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
  const [submitting, setSubmitting] = useState(false);
  const busy = pending || submitting;

  useEffect(() => {
    if (open) {
      setReason("");
      setLocalError(null);
      setSubmitting(false);
    }
  }, [open]);

  function handleConfirm() {
    if (busy) return;
    const trimmed = reason.trim();
    if (trimmed.length < minChars) {
      setLocalError(`Indicá un motivo (mín. ${minChars} caracteres)`);
      return;
    }
    setSubmitting(true);
    onConfirm(trimmed);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-2 pt-1">
              {description}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason-alert-dialog">{reasonLabel}</Label>
          <Textarea
            id="reason-alert-dialog"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            rows={3}
            disabled={busy}
          />
          {localError ? (
            <p className="text-sm text-destructive" role="alert">
              {localError}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
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
