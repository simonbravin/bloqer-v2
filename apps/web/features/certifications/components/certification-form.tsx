"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOperationalAction } from "@/hooks/use-operational-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCertificationSchema, type CreateCertificationInput } from "@bloqer/validators";
import { budgetStatusLabel } from "@/features/budgets/components/budget-status-badge";

export type BudgetOption = {
  id: string;
  name: string;
  versionNumber: number;
  status: string;
  isAddendum?: boolean;
};

interface CertificationFormProps {
  projectId: string;
  budgets: BudgetOption[];
  defaultBudgetId?: string;
  onSubmit: (data: CreateCertificationInput) => Promise<{ id: string } | { error: string }>;
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export function CertificationForm({
  projectId,
  budgets,
  defaultBudgetId,
  onSubmit,
  variant = "card",
  onCancel,
  onSuccess,
  onPendingChange,
}: CertificationFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { pending: isPending, run } = useOperationalAction({
    onPendingChange,
    onError: setServerError,
  });

  const form = useForm<CreateCertificationInput>({
    resolver: zodResolver(createCertificationSchema),
    defaultValues: {
      projectId,
      budgetId: defaultBudgetId ?? budgets[0]?.id ?? "",
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    run(async () => {
      setServerError(null);
      const result = await onSubmit(data);
      if ("error" in result) {
        setServerError(result.error);
      } else {
        onSuccess?.();
        // replace avoids Back landing on ?create=1 and reopening the dialog
        router.replace(`/proyectos/${projectId}/certificaciones/${result.id}`);
      }
    });
  });

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset disabled={isPending} className="min-w-0 space-y-5">
          {budgets.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="cert-budget">Presupuesto *</Label>
              <Select
                disabled={isPending}
                value={form.watch("budgetId")}
                onValueChange={(v) => form.setValue("budgetId", v)}
              >
                <SelectTrigger
                  id="cert-budget"
                  aria-invalid={Boolean(form.formState.errors.budgetId)}
                  aria-describedby={
                    form.formState.errors.budgetId ? "cert-budget-error" : undefined
                  }
                >
                  <SelectValue placeholder="Seleccionar presupuesto..." />
                </SelectTrigger>
                <SelectContent>
                  {budgets.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      v{b.versionNumber} — {b.name}
                      {b.isAddendum ? " · Adenda" : " · Principal"} ({budgetStatusLabel(b.status)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.budgetId && (
                <p id="cert-budget-error" role="alert" className="text-xs text-destructive">
                  {form.formState.errors.budgetId.message}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cert-period-start">Inicio del período *</Label>
              <Input
                id="cert-period-start"
                type="date"
                aria-invalid={Boolean(form.formState.errors.periodStart)}
                aria-describedby={
                  form.formState.errors.periodStart ? "cert-period-start-error" : undefined
                }
                {...form.register("periodStart")}
              />
              {form.formState.errors.periodStart && (
                <p id="cert-period-start-error" role="alert" className="text-xs text-destructive">
                  {form.formState.errors.periodStart.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-period-end">Fin del período *</Label>
              <Input
                id="cert-period-end"
                type="date"
                aria-invalid={Boolean(form.formState.errors.periodEnd)}
                aria-describedby={
                  form.formState.errors.periodEnd ? "cert-period-end-error" : undefined
                }
                {...form.register("periodEnd")}
              />
              {form.formState.errors.periodEnd && (
                <p id="cert-period-end-error" role="alert" className="text-xs text-destructive">
                  {form.formState.errors.periodEnd.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cert-notes">Notas para el cliente</Label>
            <Textarea
              id="cert-notes"
              rows={3}
              placeholder="Observaciones o aclaraciones para el cliente..."
              {...form.register("notes")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cert-internal-notes">Notas internas</Label>
            <Textarea
              id="cert-internal-notes"
              rows={2}
              placeholder="Notas internas (no visibles al cliente)..."
              {...form.register("internalNotes")}
            />
          </div>

          {serverError && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive"
            >
              {serverError}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creando..." : "Crear certificación"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => (onCancel ? onCancel() : router.back())}
              disabled={isPending}
            >
              Cancelar
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
