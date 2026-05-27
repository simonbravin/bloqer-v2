"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBudgetSettingsSchema, type UpdateBudgetSettingsInput } from "@bloqer/validators";

export type SettingsDefaults = {
  overheadPct: number;
  financialCostPct: number;
  profitPct: number;
  taxPct: number;
};

interface BudgetSettingsFormProps {
  defaults: SettingsDefaults;
  onSubmit: (data: UpdateBudgetSettingsInput) => Promise<{ ok: true } | { error: string }>;
}

export function BudgetSettingsForm({ defaults, onSubmit }: BudgetSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<UpdateBudgetSettingsInput>({
    resolver: zodResolver(updateBudgetSettingsSchema),
    defaultValues: {
      overheadPct: defaults.overheadPct,
      financialCostPct: defaults.financialCostPct,
      profitPct: defaults.profitPct,
      taxPct: defaults.taxPct,
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await onSubmit(data);
      if ("error" in result) {
        setServerError(result.error);
      } else {
        setSaved(true);
      }
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Gastos generales (%)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            {...form.register("overheadPct", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Costo financiero (%)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            {...form.register("financialCostPct", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Utilidad (%)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            {...form.register("profitPct", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>IVA / Impuesto (%)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            {...form.register("taxPct", { valueAsNumber: true })}
          />
        </div>
      </div>

      {serverError && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}
      {saved && (
        <div className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
          Configuración guardada.
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar configuración"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          Volver
        </Button>
      </div>
    </form>
  );
}
