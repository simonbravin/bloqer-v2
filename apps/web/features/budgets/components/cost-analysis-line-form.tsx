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
import {
  canUseTotalPartidaMode,
  convertApuEntryMode,
  previewApuEntry,
  toStoredApuLine,
  type ApuEntryMode,
} from "@bloqer/domain";
import { CATEGORY_LABELS, VISIBLE_COST_CATEGORIES } from "@/lib/budget-categories";
import { budgetUnitLabel } from "@/lib/budget-units";
import { UnitSelect } from "./unit-select";
import { ApuEntryModeToggle } from "./apu-entry-mode-toggle";

type CreateMode = {
  mode: "create";
  costItemId: string;
  nextSortOrder: number;
  itemQuantity: number;
  itemUnit?: string;
  /** When false, skip success toast (caller persists later). Default true. */
  toastOnSuccess?: boolean;
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
  itemQuantity: number;
  itemUnit?: string;
  toastOnSuccess?: boolean;
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
  costItemId, nextSortOrder, itemQuantity, itemUnit, toastOnSuccess = true, onSubmit,
  isPending, startTransition, serverError, setServerError, onDone,
}: CreateMode & Shared) {
  const [entryMode, setEntryMode] = useState<ApuEntryMode>("unit");
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

  const handleEntryModeChange = (next: ApuEntryMode) => {
    if (next === "total" && !canUseTotalPartidaMode(itemQuantity)) {
      toast.error("Definí la cantidad del ítem para cargar por total de partida");
      return;
    }
    if (next !== entryMode) {
      const converted = convertApuEntryMode(
        entryMode,
        next,
        {
          coefficient: form.getValues("coefficient") ?? 0,
          unitCost: form.getValues("unitCost") ?? 0,
        },
        itemQuantity,
      );
      form.setValue("coefficient", converted.coefficient);
      form.setValue("unitCost", converted.unitCost);
    }
    setEntryMode(next);
  };

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    if (entryMode === "total" && !canUseTotalPartidaMode(itemQuantity)) {
      toast.error("Definí la cantidad del ítem para cargar por total de partida");
      return;
    }
    const stored = toStoredApuLine({
      mode: entryMode,
      coefficient: data.coefficient,
      unitCost: data.unitCost,
      itemQuantity,
    });
    startTransition(async () => {
      const result = await onSubmit({ ...data, ...stored });
      if ("error" in result) {
        setServerError(result.error);
        toast.error(result.error);
      } else {
        if (toastOnSuccess) toast.success("Línea APU agregada");
        onDone();
      }
    });
  });

  return (
    <LineFormFields
      form={form}
      onDone={onDone}
      isPending={isPending}
      serverError={serverError}
      onSubmit={handleSubmit}
      submitLabel="Agregar línea"
      entryMode={entryMode}
      onEntryModeChange={handleEntryModeChange}
      itemQuantity={itemQuantity}
      itemUnit={itemUnit}
    />
  );
}

function EditLineForm({
  defaults, itemQuantity, itemUnit, toastOnSuccess = true, onSubmit,
  isPending, startTransition, serverError, setServerError, onDone,
}: EditMode & Shared) {
  const [entryMode, setEntryMode] = useState<ApuEntryMode>("unit");
  const form = useForm<UpdateCostAnalysisLineInput>({
    resolver: zodResolver(updateCostAnalysisLineSchema),
    defaultValues: {
      category: defaults.category as CostCategory,
      description: defaults.description,
      unit: defaults.unit,
      coefficient: parseFloat(defaults.coefficient) || 0,
      unitCost: parseFloat(defaults.unitCost) || 0,
      notes: defaults.notes ?? "",
    },
  });

  const handleEntryModeChange = (next: ApuEntryMode) => {
    if (next === "total" && !canUseTotalPartidaMode(itemQuantity)) {
      toast.error("Definí la cantidad del ítem para cargar por total de partida");
      return;
    }
    if (next !== entryMode) {
      const converted = convertApuEntryMode(
        entryMode,
        next,
        {
          coefficient: form.getValues("coefficient") ?? 0,
          unitCost: form.getValues("unitCost") ?? 0,
        },
        itemQuantity,
      );
      form.setValue("coefficient", converted.coefficient);
      form.setValue("unitCost", converted.unitCost);
    }
    setEntryMode(next);
  };

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    if (entryMode === "total" && !canUseTotalPartidaMode(itemQuantity)) {
      toast.error("Definí la cantidad del ítem para cargar por total de partida");
      return;
    }
    const stored = toStoredApuLine({
      mode: entryMode,
      coefficient: data.coefficient ?? 0,
      unitCost: data.unitCost ?? 0,
      itemQuantity,
    });
    startTransition(async () => {
      const result = await onSubmit({ ...data, ...stored });
      if ("error" in result) {
        setServerError(result.error);
        toast.error(result.error);
      } else {
        if (toastOnSuccess) toast.success("Línea APU actualizada");
        onDone();
      }
    });
  });

  return (
    <LineFormFields
      form={form}
      onDone={onDone}
      isPending={isPending}
      serverError={serverError}
      onSubmit={handleSubmit}
      submitLabel="Guardar"
      entryMode={entryMode}
      onEntryModeChange={handleEntryModeChange}
      itemQuantity={itemQuantity}
      itemUnit={itemUnit}
    />
  );
}

function formatPreview(n: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function LineFormFields({
  form, onDone, isPending, serverError, onSubmit, submitLabel,
  entryMode, onEntryModeChange, itemQuantity, itemUnit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  onDone: () => void;
  isPending: boolean;
  serverError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  entryMode: ApuEntryMode;
  onEntryModeChange: (mode: ApuEntryMode) => void;
  itemQuantity: number;
  itemUnit?: string;
}) {
  const category = form.watch("category");
  const coef = Number(form.watch("coefficient")) || 0;
  const unitCost = Number(form.watch("unitCost")) || 0;
  const preview = previewApuEntry({
    mode: entryMode,
    coefficient: coef,
    unitCost,
    itemQuantity,
  });
  const unitLabel = itemUnit ? budgetUnitLabel(itemUnit) : "und.";
  const entryProduct = coef * unitCost;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ApuEntryModeToggle
        value={entryMode}
        onChange={onEntryModeChange}
        totalDisabled={!canUseTotalPartidaMode(itemQuantity)}
      />

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
          <Label>Cant.</Label>
          <Input
            type="number"
            step="0.0001"
            min="0"
            {...form.register("coefficient", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Precio</Label>
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
            value={formatPreview(entryProduct)}
            readOnly
            className="bg-muted/50 font-mono text-sm"
          />
        </div>
      </div>

      <p className="font-mono text-[11px] text-muted-foreground">
        {entryMode === "unit"
          ? `En partida: ${formatPreview(preview.partidaTotal)}`
          : `Por ${unitLabel}: ${formatPreview(preview.unitTotal)}`}
      </p>

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
