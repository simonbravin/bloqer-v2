"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencySelect } from "@/components/ui/currency-select";
import { createBudgetSchema, type CreateBudgetInput, type BudgetImportRow } from "@bloqer/validators";
import { BudgetWbsPreloadSection } from "./budget-wbs-preload-section";

interface BudgetFormProps {
  projectId: string;
  onSubmit: (data: CreateBudgetInput) => Promise<{ id: string } | { error: string }>;
  onImportWbs?: (
    budgetId: string,
    rows: BudgetImportRow[],
  ) => Promise<{ createdNodes: number; createdItems: number } | { error: string }>;
}

export function BudgetForm({ projectId, onSubmit, onImportWbs }: BudgetFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingWbsRows, setPendingWbsRows] = useState<BudgetImportRow[] | null>(null);

  const form = useForm<CreateBudgetInput>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: {
      projectId,
      currency: "ARS",
      overheadPct: 0,
      financialCostPct: 0,
      profitPct: 0,
      taxPct: 0,
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await onSubmit(data);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      if (pendingWbsRows?.length && onImportWbs) {
        const importResult = await onImportWbs(result.id, pendingWbsRows);
        if ("error" in importResult) {
          setServerError(
            `Presupuesto creado, pero falló la importación WBS: ${importResult.error}`,
          );
          router.push(`/proyectos/${projectId}/presupuestos/${result.id}`);
          return;
        }
      }
      router.push(`/proyectos/${projectId}/presupuestos/${result.id}`);
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5">
        <Label>Nombre del presupuesto *</Label>
        <Input placeholder="Presupuesto inicial" {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Moneda</Label>
        <CurrencySelect
          value={form.watch("currency") ?? "ARS"}
          onValueChange={(v) => form.setValue("currency", v)}
          triggerClassName="w-full max-w-xs"
        />
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <p className="text-sm font-medium">Parámetros económicos</p>
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
      </div>

      {onImportWbs && (
        <BudgetWbsPreloadSection
          disabled={isPending}
          onPendingRowsChange={setPendingWbsRows}
        />
      )}

      <div className="space-y-1.5">
        <Label>Notas internas</Label>
        <Textarea
          rows={3}
          placeholder="Observaciones internas del presupuesto..."
          {...form.register("internalNotes")}
        />
      </div>

      {serverError && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando..." : "Crear presupuesto"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
