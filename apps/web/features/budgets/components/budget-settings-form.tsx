"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { DecimalInput, bindRhfNumberDecimal } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBudgetSettingsSchema, type UpdateBudgetSettingsInput } from "@bloqer/validators";
import { useBudgetAction } from "../lib/use-budget-action";

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
  const formId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const { isPending, run: startTransition } = useBudgetAction(setServerError);
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
      <fieldset disabled={isPending} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-overhead`}>Gastos generales (%)</Label>
          <DecimalInput
            id={`${formId}-overhead`}
            {...bindRhfNumberDecimal(form.watch("overheadPct"), (n) =>
              form.setValue("overheadPct", n, { shouldValidate: true, shouldDirty: true }),
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-financial`}>Costo financiero — tasa anual (%)</Label>
          <DecimalInput
            id={`${formId}-financial`}
            {...bindRhfNumberDecimal(form.watch("financialCostPct"), (n) =>
              form.setValue("financialCostPct", n, { shouldValidate: true, shouldDirty: true }),
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-days`}>Días promedio de financiamiento</Label>
          <Input
            id={`${formId}-days`}
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
          <Label htmlFor={`${formId}-profit`}>Utilidad (%)</Label>
          <DecimalInput
            id={`${formId}-profit`}
            {...bindRhfNumberDecimal(form.watch("profitPct"), (n) =>
              form.setValue("profitPct", n, { shouldValidate: true, shouldDirty: true }),
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-tax`}>IVA / Impuesto (%)</Label>
          <DecimalInput
            id={`${formId}-tax`}
            {...bindRhfNumberDecimal(form.watch("taxPct"), (n) =>
              form.setValue("taxPct", n, { shouldValidate: true, shouldDirty: true }),
            )}
          />
        </div>
      </fieldset>

      {Object.values(form.formState.errors).map((error, index) => (
        <p key={index} role="alert" className="text-sm text-destructive">{error?.message}</p>
      ))}

      {serverError && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}
      {saved && (
        <div role="status" className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
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
