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
  createWbsNodeSchema, updateWbsNodeSchema,
  type CreateWbsNodeInput,
  type SubdivideApuChoice,
  type UpdateWbsNodeInput,
} from "@bloqer/validators";
import { UnitSelect } from "./unit-select";

export type WbsCreatePreset = "childItem";

type CreateMode = {
  mode: "create";
  parentId?: string;
  preset?: WbsCreatePreset;
  suggestedCode?: string;
  subdivideApu?: SubdivideApuChoice;
  onSubmit: (data: CreateWbsNodeInput) => Promise<{ id: string } | { error: string }>;
};

type EditMode = {
  mode: "edit";
  defaults: { code: string; name: string; description: string | null };
  onSubmit: (data: UpdateWbsNodeInput) => Promise<{ ok: true } | { error: string }>;
};

type WbsNodeFormProps = (CreateMode | EditMode) & { onDone: () => void };

export function WbsNodeForm(props: WbsNodeFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  if (props.mode === "create") {
    return <CreateForm {...props} isPending={isPending} startTransition={startTransition} serverError={serverError} setServerError={setServerError} />;
  }
  return <EditForm {...props} isPending={isPending} startTransition={startTransition} serverError={serverError} setServerError={setServerError} />;
}

type Shared = {
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  serverError: string | null;
  setServerError: (e: string | null) => void;
  onDone: () => void;
};

function CreateForm({
  parentId, preset, suggestedCode, subdivideApu, onSubmit, isPending, startTransition, serverError, setServerError, onDone,
}: CreateMode & Shared) {
  const nodeType = "ITEM" as const;
  const isItem = true;

  const form = useForm<CreateWbsNodeInput>({
    resolver: zodResolver(createWbsNodeSchema),
    defaultValues: {
      parentId,
      type: nodeType,
      unit: isItem ? "un" : undefined,
      quantity: isItem ? 0 : undefined,
    },
  });

  const unit = form.watch("unit") ?? "";

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    const payload: CreateWbsNodeInput = {
      ...data,
      type: nodeType,
      parentId,
      code: suggestedCode || data.code,
      subdivideApu,
    };
    startTransition(async () => {
      const result = await onSubmit(payload);
      if ("error" in result) {
        setServerError(result.error);
        toast.error(result.error);
      } else {
        toast.success("Ítem agregado");
        onDone();
      }
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {suggestedCode ? (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Código asignado: </span>
          <span className="font-mono font-semibold">{suggestedCode}</span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>Nombre *</Label>
        <Input
          placeholder={preset === "childItem" ? "Hormigón H-21" : "Estructura"}
          autoFocus
          {...form.register("name")}
        />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      {isItem && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Unidad</Label>
            <UnitSelect value={unit} onChange={(v) => form.setValue("unit", v)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cantidad</Label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              {...form.register("quantity", { valueAsNumber: true })}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Textarea rows={2} placeholder="Opcional..." {...form.register("description")} />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando..." : "Agregar"}
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  defaults, onSubmit, isPending, startTransition, serverError, setServerError, onDone,
}: EditMode & Shared) {
  const form = useForm<UpdateWbsNodeInput>({
    resolver: zodResolver(updateWbsNodeSchema),
    defaultValues: {
      code: defaults.code,
      name: defaults.name,
      description: defaults.description ?? "",
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
        toast.success("Nodo actualizado");
        onDone();
      }
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Código *</Label>
          <Input {...form.register("code")} />
          {form.formState.errors.code && (
            <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Nombre *</Label>
          <Input {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Textarea rows={2} {...form.register("description")} />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
