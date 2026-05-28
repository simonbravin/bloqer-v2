"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AvailableBudget } from "@bloqer/services";
import { importScheduleFromBudgetAction } from "../actions/schedule-actions";

export function ScheduleImportDialog({
  projectId,
  budgets,
  defaultBudgetId,
}: {
  projectId: string;
  budgets: AvailableBudget[];
  defaultBudgetId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [budgetId, setBudgetId] = useState(defaultBudgetId ?? budgets[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  function onImport() {
    if (!budgetId) {
      toast.error("Seleccioná un presupuesto");
      return;
    }
    startTransition(async () => {
      const res = await importScheduleFromBudgetAction(projectId, {
        budgetId,
        includeGroups: true,
        placeholderDates: true,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Cronograma importado desde el presupuesto");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Importar desde presupuesto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar WBS al cronograma</DialogTitle>
          <DialogDescription>
            Crea tareas enlazadas a ítems del presupuesto aprobado. Podés agregar hitos y tareas sin WBS después.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="import-budget">
            Presupuesto base
          </label>
          <select
            id="import-budget"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={budgetId}
            onChange={(e) => setBudgetId(e.target.value)}
          >
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.status})
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={pending} onClick={onImport}>
            {pending ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
