"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  createCostAnalysisLineSchema, updateCostAnalysisLineSchema,
  type CreateCostAnalysisLineInput, type UpdateCostAnalysisLineInput,
} from "@bloqer/validators";
import type { CostCategory } from "@bloqer/database";
import { CATEGORY_LABELS, VISIBLE_COST_CATEGORIES } from "@/lib/budget-categories";
import { UnitSelect } from "./unit-select";

type CreateMode = {
  mode: "create";
  costItemId: string;
  nextSortOrder: number;
  onSubmit: (data: CreateCostAnalysisLineInput) => Promise<{ id: string } | { error: string }>;
};

type EditMode = {
  mode: "edit";
  defaults: {
    category: string;
    description: string;
    unit: string;
    coefficient: string;
    unitCost: string;
    notes: string | null;
  };
  onSubmit: (data: UpdateCostAnalysisLineInput) => Promise<{ ok: true } | { error: string }>;
};

type CostAnalysisLineFormProps = (CreateMode | EditMode) & { onDone: () => void };

export function CostAnalysisLineForm(props: CostAnalysisLineFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  if (props.mode === "create") {
    return <CreateLineForm {...props} isPending={isPending} startTransition={startTransition} serverError={serverError} setServerError={setServerError} />;
  }
  return <EditLineForm {...props} isPending={isPending} startTransition={startTransition} serverError={serverError} setServerError={setServerError} />;
}

type Shared = {
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  serverError: string | null;
  setServerError: (e: string | null) => void;
  onDone: () => void;
};

function CreateLineForm({
  costItemId, nextSortOrder, onSubmit, isPending, startTransition, serverError, setServerError, onDone,
}: CreateMode & Shared) {
  const form = useForm<CreateCostAnalysisLineInput>({
    resolver: zodResolver(createCostAnalysisLineSchema),
    defaultValues: {
      costItemId,
      category: "MATERIAL",
      coefficient: 1,
      unitCost: 0,
      sortOrder: nextSortOrder,
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await onSubmit(data);
      if ("error" in result) {
        setServerError(result.error);
        toast.error(result.error);
      } else {
        toast.success("Línea APU agregada");
        onDone();
      }
    });
  });

  return <LineFormFields form={form} onDone={onDone} isPending={isPending} serverError={serverError} onSubmit={handleSubmit} submitLabel="Agregar línea" />;
}

function EditLineForm({
  defaults, onSubmit, isPending, startTransition, serverError, setServerError, onDone,
}: EditMode & Shared) {
  const form = useForm<UpdateCostAnalysisLineInput>({
    resolver: zodResolver(updateCostAnalysisLineSchema),
    defaultValues: {
      category: defaults.category as CostCategory,
      description: defaults.description,
      unit: defaults.unit,
      coefficient: parseFloat(defaults.coefficient),
      unitCost: parseFloat(defaults.unitCost),
      notes: defaults.notes ?? "",
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await onSubmit(data);
      if ("error" in result) {
        setServerError(result.error);
        toast.error(result.error);
      } else {
        toast.success("Línea APU actualizada");
        onDone();
      }
    });
  });

  return <LineFormFields form={form} onDone={onDone} isPending={isPending} serverError={serverError} onSubmit={handleSubmit} submitLabel="Guardar" />;
}

function LineFormFields({
  form, onDone, isPending, serverError, onSubmit, submitLabel,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  onDone: () => void;
  isPending: boolean;
  serverError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
}) {
  const category = form.watch("category");

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Categoría *</Label>
          <Select value={category} onValueChange={(v) => form.setValue("category", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBLE_COST_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</SelectItem>
              ))}
              {category === "OTHER" ? (
                <SelectItem value="OTHER">{CATEGORY_LABELS.OTHER}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Unidad *</Label>
          <UnitSelect
            value={form.watch("unit") ?? ""}
            onChange={(v) => form.setValue("unit", v, { shouldValidate: true })}
          />
          {form.formState.errors.unit && (
            <p className="text-xs text-destructive">{form.formState.errors.unit.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Descripción *</Label>
        <Input placeholder="Hormigón H-21 elaborado en planta" {...form.register("description")} />
        {form.formState.errors.description && (
          <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Coeficiente</Label>
          <Input
            type="number"
            step="0.0001"
            min="0"
            {...form.register("coefficient", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Costo unitario</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            {...form.register("unitCost", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Total</Label>
          <Input
            value={(
              (parseFloat(form.watch("coefficient") ?? "0") || 0) *
              (parseFloat(form.watch("unitCost") ?? "0") || 0)
            ).toFixed(4)}
            readOnly
            className="bg-muted/50 font-mono text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Textarea rows={2} placeholder="Observaciones..." {...form.register("notes")} />
      </div>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
