"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createCertificationSchema, type CreateCertificationInput } from "@bloqer/validators";

export type BudgetOption = { id: string; name: string; versionNumber: number; status: string };

interface CertificationFormProps {
  projectId: string;
  budgets: BudgetOption[];
  defaultBudgetId?: string;
  onSubmit: (data: CreateCertificationInput) => Promise<{ id: string } | { error: string }>;
}

export function CertificationForm({ projectId, budgets, defaultBudgetId, onSubmit }: CertificationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateCertificationInput>({
    resolver: zodResolver(createCertificationSchema),
    defaultValues: {
      projectId,
      budgetId: defaultBudgetId ?? budgets[0]?.id ?? "",
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await onSubmit(data);
      if ("error" in result) {
        setServerError(result.error);
      } else {
        router.push(`/proyectos/${projectId}/certificaciones/${result.id}`);
      }
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {budgets.length > 1 && (
        <div className="space-y-1.5">
          <Label>Presupuesto *</Label>
          <Select
            value={form.watch("budgetId")}
            onValueChange={(v) => form.setValue("budgetId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar presupuesto..." />
            </SelectTrigger>
            <SelectContent>
              {budgets.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  v{b.versionNumber} — {b.name} ({b.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.budgetId && (
            <p className="text-xs text-destructive">{form.formState.errors.budgetId.message}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Inicio del período *</Label>
          <Input type="date" {...form.register("periodStart")} />
          {form.formState.errors.periodStart && (
            <p className="text-xs text-destructive">{form.formState.errors.periodStart.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Fin del período *</Label>
          <Input type="date" {...form.register("periodEnd")} />
          {form.formState.errors.periodEnd && (
            <p className="text-xs text-destructive">{form.formState.errors.periodEnd.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notas para el cliente</Label>
        <Textarea
          rows={3}
          placeholder="Observaciones o aclaraciones para el cliente..."
          {...form.register("notes")}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Notas internas</Label>
        <Textarea
          rows={2}
          placeholder="Notas internas (no visibles al cliente)..."
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
          {isPending ? "Creando..." : "Crear certificación"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
