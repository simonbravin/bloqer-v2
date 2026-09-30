"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
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
  /** Cierra el diálogo y se queda en el detalle. Sin esto, vuelve a la ficha por navegación. */
  onDone?: () => void;
}

export function CertificationEditForm({
  certId, projectId, defaults, onSubmit, onDone,
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
      } else if (onDone) {
        router.refresh();
        onDone();
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

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => (onDone ? onDone() : router.back())}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

export function CertificationHeaderDialog({
  certId,
  projectId,
  defaults,
  onSubmit,
  defaultOpen = false,
}: CertificationEditFormProps & { defaultOpen?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  function close() {
    setOpen(false);
    if (!defaultOpen) return;
    router.replace(pathname, { scroll: false });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Editar encabezado</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar encabezado</DialogTitle>
          <DialogDescription>
            Período y notas. Las partidas se miden en la planilla.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CertificationEditForm
            key={`${defaults.periodStart}|${defaults.periodEnd}|${defaults.notes}|${defaults.internalNotes}`}
            certId={certId}
            projectId={projectId}
            defaults={defaults}
            onSubmit={onSubmit}
            onDone={close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
