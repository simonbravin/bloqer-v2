"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ScheduleBlockDialog({
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
  onConfirm: (blockReason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => { if (open) setReason(""); }, [open, itemName]);

  function submit() {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloquear tarea</DialogTitle>
          <DialogDescription>
            Indicá la causa del bloqueo para <strong>{itemName}</strong>. Es obligatorio (BR-SCH-003).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="block-reason">Causa</Label>
          <Textarea
            id="block-reason"
            disabled={pending}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej.: falta de materiales, lluvia, espera de aprobación…"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !reason.trim()}>
            Bloquear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
