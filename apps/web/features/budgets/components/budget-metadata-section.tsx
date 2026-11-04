"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { BudgetStatus } from "@bloqer/database";
import { updateBudgetSchema, type UpdateBudgetInput } from "@bloqer/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBudgetAction } from "../lib/use-budget-action";

type Props = {
  name: string;
  internalNotes: string | null;
  status: BudgetStatus;
  canEdit: boolean;
  onSubmit: (input: UpdateBudgetInput) => Promise<{ ok: true } | { error: string }>;
};

export function BudgetMetadataSection({ name, internalNotes, status, canEdit, onSubmit }: Props) {
  const router = useRouter();
  const formId = useId();
  const editable = canEdit && status !== "CANCELLED";
  const canRename = status !== "CLOSED";
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { isPending, run } = useBudgetAction(setError);
  const form = useForm<UpdateBudgetInput>({
    resolver: zodResolver(canRename ? updateBudgetSchema : updateBudgetSchema.pick({ internalNotes: true })),
    defaultValues: { name, internalNotes: internalNotes ?? "" },
  });

  const handleSubmit = form.handleSubmit((data) => {
    if (!editable) return;
    setError(null);
    setSaved(false);
    run(async () => {
      const payload: UpdateBudgetInput = { internalNotes: data.internalNotes ?? "" };
      if (canRename) payload.name = data.name;
      const result = await onSubmit(payload);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      form.reset({ name: canRename ? data.name : name, internalNotes: payload.internalNotes });
      setSaved(true);
      router.refresh();
    });
  });

  return (
    <section id="datos-presupuesto" className="rounded-xl border bg-card shadow-sm scroll-mt-6">
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">Datos del presupuesto</h2>
        <p className="mt-1 text-xs text-muted-foreground">Nombre y notas internas. Los cambios económicos se realizan en la EDT y en la configuración de márgenes.</p>
      </div>
      {editable ? (
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <fieldset disabled={isPending} className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-name`}>Nombre del presupuesto</Label>
              <Input id={`${formId}-name`} readOnly={!canRename} {...form.register("name")} />
              {!canRename && <p className="text-xs text-muted-foreground">Presupuesto cerrado: solo podés cambiar las notas internas.</p>}
              {form.formState.errors.name && <p role="alert" className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-notes`}>Notas internas</Label>
              <Textarea id={`${formId}-notes`} rows={3} maxLength={2000} placeholder="Observaciones internas del presupuesto..." {...form.register("internalNotes")} />
              {form.formState.errors.internalNotes && <p role="alert" className="text-sm text-destructive">{form.formState.errors.internalNotes.message}</p>}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {saved && <p role="status" className="text-sm text-green-700 dark:text-green-400">Datos guardados.</p>}
          <Button type="submit" disabled={isPending}>{isPending ? "Guardando..." : "Guardar datos"}</Button>
        </form>
      ) : (
        <dl className="space-y-4 p-4 text-sm">
          <div><dt className="text-xs text-muted-foreground">Nombre del presupuesto</dt><dd className="mt-1 break-words font-medium">{name}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Notas internas</dt><dd className="mt-1 whitespace-pre-wrap break-words">{internalNotes?.trim() ? internalNotes : "Sin notas internas."}</dd></div>
        </dl>
      )}
    </section>
  );
}
