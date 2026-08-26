"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DecimalInput, bindRhfNumberDecimal } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBudgetSettingsSchema, type UpdateBudgetSettingsInput } from "@bloqer/validators";

export type SettingsDefaults = {
  overheadPct: number;
  financialCostPct: number;
  /** Average financing days; 0 = flat % (legacy). */
  financialDaysAvg: number;
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
      financialDaysAvg: defaults.financialDaysAvg,
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
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Gastos generales (%)</Label>
          <DecimalInput
            {...bindRhfNumberDecimal(form.watch("overheadPct"), (n) =>
              form.setValue("overheadPct", n, { shouldValidate: true, shouldDirty: true }),
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Costo financiero — tasa anual (%)</Label>
          <DecimalInput
            {...bindRhfNumberDecimal(form.watch("financialCostPct"), (n) =>
              form.setValue("financialCostPct", n, { shouldValidate: true, shouldDirty: true }),
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Días promedio de financiamiento</Label>
          <Input
            type="number"
            step="1"
            min="0"
            {...form.register("financialDaysAvg", { valueAsNumber: true })}
          />
          <p className="text-xs text-muted-foreground">
            Con días &gt; 0: CF = base × tasa × días/365. Con 0: se aplica la tasa como % plano
            (comportamiento anterior).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Utilidad (%)</Label>
          <DecimalInput
            {...bindRhfNumberDecimal(form.watch("profitPct"), (n) =>
              form.setValue("profitPct", n, { shouldValidate: true, shouldDirty: true }),
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>IVA / Impuesto (%)</Label>
          <DecimalInput
            {...bindRhfNumberDecimal(form.watch("taxPct"), (n) =>
              form.setValue("taxPct", n, { shouldValidate: true, shouldDirty: true }),
            )}
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
