"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { createProjectSchema, type CreateProjectInput, type ProjectFormInput } from "@bloqer/validators";

interface ClientOption {
  id: string;
  legalName: string;
  fantasyName: string | null;
}

interface ProjectFormProps {
  clients: ClientOption[];
  defaultValues?: Partial<ProjectFormInput>;
  submitLabel?: string;
  successRedirect?: string;
  onSubmit: (data: CreateProjectInput) => Promise<{ id: string } | { ok: true } | { error: string }>;
}

export function ProjectForm({
  clients,
  defaultValues,
  submitLabel = "Crear proyecto",
  successRedirect,
  onSubmit,
}: ProjectFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ProjectFormInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      type: "PRIVATE",
      country: "AR",
      ...defaultValues,
    },
  });

  const clientContactId = form.watch("clientContactId");

  const handleSubmit = form.handleSubmit((raw) => {
    const parsed = createProjectSchema.safeParse(raw);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setServerError(null);
    startTransition(async () => {
      const result = await onSubmit(parsed.data);
      if ("error" in result) {
        setServerError(result.error);
      } else {
        const id = "id" in result ? result.id : null;
        router.push(successRedirect ?? (id ? `/proyectos/${id}` : "/proyectos"));
      }
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Código *</Label>
          <Input placeholder="PRY-2024-001" {...form.register("code")} />
          {form.formState.errors.code && (
            <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Tipo *</Label>
          <Select
            value={form.watch("type")}
            onValueChange={(v) => form.setValue("type", v as "PUBLIC" | "PRIVATE")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRIVATE">Privado</SelectItem>
              <SelectItem value="PUBLIC">Público</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Nombre *</Label>
        <Input placeholder="Edificio Residencial Torre Norte" {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Cliente *</Label>
        {clients.length === 0 ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
            No hay contactos con rol <strong>Cliente</strong> activo. Los proyectos solo pueden asociarse a ese tipo
            de contacto. Podés{" "}
            <Link href="/directorio/nuevo" className="font-medium text-primary underline underline-offset-2">
              crear un contacto
            </Link>{" "}
            y elegir &quot;Cliente&quot; en <strong>Rol inicial</strong>, o editar uno existente en{" "}
            <Link href="/directorio" className="font-medium text-primary underline underline-offset-2">
              Directorio
            </Link>{" "}
            y asignarle el rol Cliente.
          </p>
        ) : (
          <Select
            value={clientContactId || undefined}
            onValueChange={(v) => form.setValue("clientContactId", v, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar cliente..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.fantasyName ?? c.legalName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {form.formState.errors.clientContactId && (
          <p className="text-xs text-destructive">{form.formState.errors.clientContactId.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Textarea rows={3} placeholder="Descripción del proyecto..." {...form.register("description")} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Fecha de inicio</Label>
          <Input type="date" {...form.register("startDate")} />
        </div>
        <div className="space-y-1.5">
          <Label>Fecha estimada de fin</Label>
          <Input type="date" {...form.register("expectedEndDate")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Dirección</Label>
          <Input placeholder="Av. Corrientes 1234" {...form.register("address")} />
        </div>
        <div className="space-y-1.5">
          <Label>Ciudad</Label>
          <Input placeholder="Buenos Aires" {...form.register("city")} />
        </div>
        <div className="space-y-1.5">
          <Label>Provincia</Label>
          <Input placeholder="CABA" {...form.register("province")} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Textarea rows={2} placeholder="Observaciones..." {...form.register("notes")} />
      </div>

      {serverError && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending || clients.length === 0}>
          {isPending ? "Guardando..." : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
