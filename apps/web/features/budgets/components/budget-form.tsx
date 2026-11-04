"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DecimalInput, bindRhfNumberDecimal } from "@/components/ui/decimal-input";
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
import { useBudgetAction } from "../lib/use-budget-action";

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
  const formId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingWbsRows, setPendingWbsRows] = useState<BudgetImportRow[] | null>(null);
  const [preloading, setPreloading] = useState(false);
  const [createdBudgetId, setCreatedBudgetId] = useState<string | null>(null);
  const createdBudgetRef = useRef<string | null>(null);
  const { isPending, run: startTransition } = useBudgetAction(setServerError);

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
    if (preloading) return;
    setServerError(null);
    startTransition(async () => {
      let budgetId = createdBudgetRef.current;
      if (!budgetId) {
        const result = await onSubmit({
          ...data,
          projectId,
          parentBudgetId: data.parentBudgetId || null,
        });
        if ("error" in result) {
          setServerError(result.error);
          return;
        }
        budgetId = result.id;
        createdBudgetRef.current = budgetId;
        setCreatedBudgetId(budgetId);
      }
      if (pendingWbsRows?.length && onImportWbs) {
        const importResult = await onImportWbs(budgetId, pendingWbsRows);
        if ("error" in importResult) {
          setServerError(
            `El presupuesto ya está creado. No se pudo importar la EDT: ${importResult.error}. Podés reintentar la importación o abrir el presupuesto.`,
          );
          return;
        }
      }
      router.push(`/proyectos/${projectId}/presupuestos/${budgetId}`);
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={isPending || createdBudgetId !== null} className="min-w-0 space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-name`}>Nombre del presupuesto *</Label>
        <Input id={`${formId}-name`} placeholder="Presupuesto inicial" {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      {parentOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-parent`}>Presupuesto padre (adenda / fase)</Label>
          <Select
            value={parentBudgetId ?? PARENT_NONE}
            onValueChange={(v) => applyParentChoice(v === PARENT_NONE ? null : v)}
            disabled={isPending}
          >
            <SelectTrigger id={`${formId}-parent`} className="w-full max-w-lg">
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
        <Label htmlFor={`${formId}-currency`}>Moneda</Label>
        <CurrencySelect
          id={`${formId}-currency`}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Label htmlFor={`${formId}-days`}>Días promedio financiamiento</Label>
            <Input
              id={`${formId}-days`}
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
        </div>
      </div>

      {onImportWbs && (
        <BudgetWbsPreloadSection
          disabled={isPending}
          onPendingRowsChange={setPendingWbsRows}
          onPendingChange={setPreloading}
        />
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-notes`}>Notas internas</Label>
        <Textarea
          id={`${formId}-notes`}
          rows={3}
          placeholder="Observaciones internas del presupuesto..."
          {...form.register("internalNotes")}
        />
      </div>
      </fieldset>

      {Object.entries(form.formState.errors).filter(([field]) => field !== "name").map(([field, error]) => (
        <p key={field} role="alert" className="text-sm text-destructive">{error?.message}</p>
      ))}

      {serverError && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}
      {createdBudgetId && (
        <p role="status" className="text-sm text-muted-foreground">
          El presupuesto ya está creado. Reintentar solo vuelve a importar la estructura EDT.
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending || preloading}>
          {isPending
            ? createdBudgetId ? "Importando EDT..." : "Creando..."
            : createdBudgetId
              ? "Reintentar importación EDT"
              : preloading
                ? "Leyendo archivo..."
                : parentBudgetId
              ? "Crear adenda / fase"
              : "Crear presupuesto"}
        </Button>
        <Button type="button" variant="outline" onClick={() => createdBudgetId ? router.push(`/proyectos/${projectId}/presupuestos/${createdBudgetId}`) : router.back()} disabled={isPending}>
          {createdBudgetId ? "Abrir presupuesto creado" : "Cancelar"}
        </Button>
      </div>
    </form>
  );
}
