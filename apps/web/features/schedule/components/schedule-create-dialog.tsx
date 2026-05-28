"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createScheduleItemAction } from "../actions/schedule-actions";

export function ScheduleCreateDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"TASK" | "MILESTONE">("TASK");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const startDate = (fd.get("startDate") as string) || null;
    const endDate = (fd.get("endDate") as string) || null;
    if (!name) return;

    startTransition(async () => {
      const res = await createScheduleItemAction(projectId, {
        name,
        type,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Tarea creada");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          + Tarea / hito
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nueva tarea o hito</DialogTitle>
            <DialogDescription>
              Creá un ítem manual en el cronograma (sin importar desde presupuesto).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="space-y-1">
              <Label htmlFor="sched-name">Nombre</Label>
              <Input id="sched-name" name="name" required maxLength={500} />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "TASK" | "MILESTONE")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TASK">Tarea</SelectItem>
                  <SelectItem value="MILESTONE">Hito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="sched-start">Inicio</Label>
                <Input id="sched-start" name="startDate" type="date" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sched-end">Fin</Label>
                <Input id="sched-end" name="endDate" type="date" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
