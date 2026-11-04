"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
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
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, contactsToSearchableOptions } from "@/lib/searchable-options";
import { createProjectSchema, type CreateProjectInput, type ProjectFormInput } from "@bloqer/validators";
import { invalidateProjectShellCache } from "@/lib/project-shell-context";

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
  /** BR-PROJ-002: lock PUBLIC/PRIVATE after first APPROVED/CLOSED budget. */
  typeLocked?: boolean;
  onSubmit: (data: CreateProjectInput) => Promise<{ id: string } | { ok: true } | { error: string }>;
}

export function ProjectForm({
  clients,
  defaultValues,
  submitLabel = "Crear proyecto",
  successRedirect,
  typeLocked = false,
  onSubmit,
}: ProjectFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const formId = useId();
  const submitting = useRef(false);

  const form = useForm<ProjectFormInput, unknown, CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      type: "PRIVATE",
      country: "AR",
      ...defaultValues,
    },
  });

  const clientContactId = form.watch("clientContactId");

  const handleSubmit = form.handleSubmit((raw) => {
    if (submitting.current) return;
    const parsed = createProjectSchema.safeParse(raw);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setServerError(null);
    submitting.current = true;
    startTransition(async () => {
      try {
        const result = await onSubmit(parsed.data);
        if ("error" in result) {
          setServerError(result.error);
        } else {
          const id = "id" in result ? result.id : null;
          const redirectPath = successRedirect ?? (id ? `/proyectos/${id}` : "/proyectos");
          const updatedProjectId =
            id ?? redirectPath.match(/^\/proyectos\/([^/]+)/)?.[1] ?? null;
          if ("ok" in result && updatedProjectId) {
            invalidateProjectShellCache(updatedProjectId);
          }
          router.push(redirectPath);
        }
      } catch {
        setServerError("No se pudo guardar el proyecto. Volvé a intentar.");
      } finally {
        submitting.current = false;
      }
    });
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-code`}>Código *</Label>
          <Input id={`${formId}-code`} aria-required aria-invalid={Boolean(form.formState.errors.code)} aria-describedby={form.formState.errors.code ? `${formId}-code-error` : undefined} placeholder="PRY-2024-001" {...form.register("code")} />
          {form.formState.errors.code && (
            <p id={`${formId}-code-error`} role="alert" className="text-xs text-destructive">{form.formState.errors.code.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-type`}>Tipo *</Label>
          <Select
            value={form.watch("type")}
            onValueChange={(v) => form.setValue("type", v as "PUBLIC" | "PRIVATE")}
            disabled={typeLocked}
          >
            <SelectTrigger id={`${formId}-type`} aria-required aria-describedby={typeLocked ? `${formId}-type-help` : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRIVATE">Privado</SelectItem>
              <SelectItem value="PUBLIC">Público</SelectItem>
            </SelectContent>
          </Select>
          {typeLocked ? (
            <p id={`${formId}-type-help`} className="text-xs text-muted-foreground">
              El tipo no se puede cambiar después de un presupuesto aprobado o cerrado.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-name`}>Nombre *</Label>
        <Input id={`${formId}-name`} aria-required aria-invalid={Boolean(form.formState.errors.name)} aria-describedby={form.formState.errors.name ? `${formId}-name-error` : undefined} placeholder="Edificio Residencial Torre Norte" {...form.register("name")} />
        {form.formState.errors.name && (
          <p id={`${formId}-name-error`} role="alert" className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={clients.length ? `${formId}-client` : undefined}>Cliente *</Label>
        {clients.length === 0 ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
            No hay contactos con rol <strong>Cliente</strong> activo. Los proyectos solo pueden asociarse a ese tipo
            de contacto. Podés{" "}
            <Link href="/directorio/nuevo?role=CLIENT" className="font-medium text-primary underline underline-offset-2">
              crear un contacto
            </Link>{" "}
            y elegir &quot;Cliente&quot; en <strong>Rol</strong>, o editar uno existente en{" "}
            <Link href="/directorio" className="font-medium text-primary underline underline-offset-2">
              Directorio
            </Link>{" "}
            y asignarle el rol Cliente.
          </p>
        ) : (
          <SearchableCombobox
            id={`${formId}-client`}
            aria-required
            aria-invalid={Boolean(form.formState.errors.clientContactId)}
            aria-describedby={form.formState.errors.clientContactId ? `${formId}-client-error` : undefined}
            popoverWidth="wide"
            options={contactsToSearchableOptions(clients)}
            value={clientContactId ?? ""}
            onValueChange={(v) => form.setValue("clientContactId", v, { shouldValidate: true })}
            placeholder="Seleccionar cliente…"
            searchPlaceholder={CONTACT_PICKER_SEARCH_PLACEHOLDER}
            emptyText="Ningún cliente coincide."
          />
        )}
        {form.formState.errors.clientContactId && (
          <p id={`${formId}-client-error`} role="alert" className="text-xs text-destructive">{form.formState.errors.clientContactId.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-description`}>Descripción</Label>
        <Textarea id={`${formId}-description`} rows={3} placeholder="Descripción del proyecto..." {...form.register("description")} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-start`}>Fecha de inicio</Label>
          <Input id={`${formId}-start`} type="date" aria-invalid={Boolean(form.formState.errors.startDate)} aria-describedby={form.formState.errors.startDate ? `${formId}-start-error` : undefined} {...form.register("startDate")} />
          {form.formState.errors.startDate ? <p id={`${formId}-start-error`} role="alert" className="text-xs text-destructive">{form.formState.errors.startDate.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-end`}>Fecha estimada de fin</Label>
          <Input id={`${formId}-end`} type="date" aria-invalid={Boolean(form.formState.errors.expectedEndDate)} aria-describedby={form.formState.errors.expectedEndDate ? `${formId}-end-error` : undefined} {...form.register("expectedEndDate")} />
          {form.formState.errors.expectedEndDate ? <p id={`${formId}-end-error`} role="alert" className="text-xs text-destructive">{form.formState.errors.expectedEndDate.message}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-address`}>Dirección</Label>
          <Input id={`${formId}-address`} placeholder="Av. Corrientes 1234" {...form.register("address")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-city`}>Ciudad</Label>
          <Input id={`${formId}-city`} placeholder="Buenos Aires" {...form.register("city")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-province`}>Provincia</Label>
          <Input id={`${formId}-province`} placeholder="CABA" {...form.register("province")} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-notes`}>Notas</Label>
        <Textarea id={`${formId}-notes`} rows={2} placeholder="Observaciones..." {...form.register("notes")} />
      </div>

      {serverError && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
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
