"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ScheduleCancelDialog({
  open,
  onOpenChange,
  itemName,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar tarea</DialogTitle>
          <DialogDescription>
            ¿Cancelar <strong>{itemName}</strong> en el cronograma? La tarea dejará de contar en
            el avance del proyecto.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Volver
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            Cancelar tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
