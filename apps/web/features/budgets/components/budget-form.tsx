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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBudgetSchema, type CreateBudgetInput, type BudgetImportRow } from "@bloqer/validators";
import { BudgetWbsPreloadSection } from "./budget-wbs-preload-section";

const PARENT_NONE = "__none__";

export type BudgetParentOption = {
  id: string;
  versionNumber: number;
  name: string;
  status: "APPROVED" | "CLOSED";
  currency: string;
  overheadPct: number;
  financialCostPct: number;
  financialDaysAvg: number;
  profitPct: number;
  taxPct: number;
};

const ZERO_SETTINGS = {
  overheadPct: 0,
  financialCostPct: 0,
  financialDaysAvg: 0,
  profitPct: 0,
  taxPct: 0,
} as const;

function settingsFromParent(parent: BudgetParentOption | undefined) {
  if (!parent) return { ...ZERO_SETTINGS };
  return {
    overheadPct: parent.overheadPct,
    financialCostPct: parent.financialCostPct,
    financialDaysAvg: parent.financialDaysAvg,
    profitPct: parent.profitPct,
    taxPct: parent.taxPct,
  };
}

interface BudgetFormProps {
  projectId: string;
  parentOptions?: BudgetParentOption[];
  initialParentBudgetId?: string | null;
  onSubmit: (data: CreateBudgetInput) => Promise<{ id: string } | { error: string }>;
  onImportWbs?: (
    budgetId: string,
    rows: BudgetImportRow[],
  ) => Promise<{ createdNodes: number; createdItems: number } | { error: string }>;
}

export function BudgetForm({
  projectId,
  parentOptions = [],
  initialParentBudgetId = null,
  onSubmit,
  onImportWbs,
}: BudgetFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingWbsRows, setPendingWbsRows] = useState<BudgetImportRow[] | null>(null);

  const validInitialParent =
    initialParentBudgetId && parentOptions.some((p) => p.id === initialParentBudgetId)
      ? initialParentBudgetId
      : null;

  const initialParent = parentOptions.find((p) => p.id === validInitialParent);
  const initialSettings = settingsFromParent(initialParent);

  const form = useForm<CreateBudgetInput>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: {
      projectId,
      currency: initialParent?.currency ?? "ARS",
      parentBudgetId: validInitialParent,
      ...initialSettings,
      name: validInitialParent ? "Adenda / fase" : "",
    },
  });

  const parentBudgetId = form.watch("parentBudgetId") ?? null;

  function applyParentChoice(nextParentId: string | null) {
    form.setValue("parentBudgetId", nextParentId, { shouldDirty: true });
    const parent = parentOptions.find((p) => p.id === nextParentId);
    const settings = settingsFromParent(parent);
    form.setValue("overheadPct", settings.overheadPct, { shouldDirty: true });
    form.setValue("financialCostPct", settings.financialCostPct, { shouldDirty: true });
    form.setValue("financialDaysAvg", settings.financialDaysAvg, { shouldDirty: true });
    form.setValue("profitPct", settings.profitPct, { shouldDirty: true });
    form.setValue("taxPct", settings.taxPct, { shouldDirty: true });
    if (parent?.currency) {
      form.setValue("currency", parent.currency, { shouldDirty: true });
    }
    if (nextParentId && !form.getValues("name")?.trim()) {
      form.setValue("name", "Adenda / fase", { shouldDirty: true });
    }
  }

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await onSubmit({
        ...data,
        projectId,
        parentBudgetId: data.parentBudgetId || null,
      });
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      if (pendingWbsRows?.length && onImportWbs) {
        const importResult = await onImportWbs(result.id, pendingWbsRows);
        if ("error" in importResult) {
          setServerError(
            `Presupuesto creado, pero falló la importación EDT: ${importResult.error}`,
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

      {parentOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label>Presupuesto padre (adenda / fase)</Label>
          <Select
            value={parentBudgetId ?? PARENT_NONE}
            onValueChange={(v) => applyParentChoice(v === PARENT_NONE ? null : v)}
            disabled={isPending}
          >
            <SelectTrigger className="w-full max-w-lg">
              <SelectValue placeholder="Sin padre (presupuesto independiente)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PARENT_NONE}>Sin padre (presupuesto independiente)</SelectItem>
              {parentOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  v{p.versionNumber} — {p.name} ({p.status === "APPROVED" ? "Aprobado" : "Cerrado"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Solo se puede vincular a un presupuesto aprobado o cerrado del mismo proyecto. Los %
            económicos y la moneda se prellenan del padre (editables). No copia la EDT: importala
            abajo o armala después.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Moneda</Label>
        <CurrencySelect
          value={form.watch("currency") ?? "ARS"}
          onValueChange={(v) => form.setValue("currency", v)}
          triggerClassName="w-full max-w-xs"
        />
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div>
          <p className="text-sm font-medium">Parámetros económicos</p>
          {parentBudgetId ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Prellenados desde el presupuesto padre; ajustalos si esta adenda usa otra política.
            </p>
          ) : null}
        </div>
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
            <Label>Costo financiero — tasa anual (%)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              {...form.register("financialCostPct", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Días promedio financiamiento</Label>
            <Input
              type="number"
              step="1"
              min="0"
              {...form.register("financialDaysAvg", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              &gt; 0 prorratea la tasa anual (× días/365). 0 = % plano.
            </p>
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
          {isPending
            ? "Creando..."
            : parentBudgetId
              ? "Crear adenda / fase"
              : "Crear presupuesto"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
