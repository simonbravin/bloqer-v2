"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useConfirmationAction } from "@/hooks/use-confirmation-action";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  pending?: boolean;
  /** Extra gate (e.g. lockout acknowledgment checkbox). */
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<unknown>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  pending = false,
  confirmDisabled = false,
  onConfirm,
}: Props) {
  const { busy, actionError, handleOpenChange, confirmAction } = useConfirmationAction({
    open,
    pending,
    onOpenChange,
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" closeButtonDisabled={busy} aria-busy={busy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-2 pt-1">{description}</div>
          </DialogDescription>
        </DialogHeader>
        {actionError ? <p className="text-sm text-destructive" role="alert">{actionError}</p> : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => {
              if (!confirmDisabled) void confirmAction(onConfirm);
            }}
            disabled={busy || confirmDisabled}
          >
            {busy ? "Procesando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
