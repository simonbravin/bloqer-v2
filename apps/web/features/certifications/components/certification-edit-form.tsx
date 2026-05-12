"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCertificationSchema, type UpdateCertificationInput } from "@bloqer/validators";

interface CertificationEditFormProps {
  certId: string;
  projectId: string;
  defaults: {
    periodStart: string;
    periodEnd: string;
    notes: string;
    internalNotes: string;
  };
  onSubmit: (data: UpdateCertificationInput) => Promise<{ ok: true } | { error: string }>;
}

export function CertificationEditForm({
  certId, projectId, defaults, onSubmit,
}: CertificationEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<UpdateCertificationInput>({
    resolver: zodResolver(updateCertificationSchema),
    defaultValues: defaults,
  });

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await onSubmit(data);
      if ("error" in result) {
        setServerError(result.error);
      } else {
        router.push(`/proyectos/${projectId}/certificaciones/${certId}`);
      }
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
        <Textarea rows={3} {...form.register("notes")} />
      </div>

      <div className="space-y-1.5">
        <Label>Notas internas</Label>
        <Textarea rows={2} {...form.register("internalNotes")} />
      </div>

      {serverError && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
