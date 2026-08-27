"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectTeamMemberKind } from "@bloqer/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import {
  addProjectTeamMemberAction,
  removeProjectTeamMemberAction,
} from "@/app/(app)/proyectos/[id]/team-actions";

export type ProjectTeamMemberView = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  kind: ProjectTeamMemberKind;
  membershipActive: boolean;
  canSuperviseJobsiteLog: boolean;
};

export type ProjectTeamPickerOptionView = {
  userId: string;
  email: string;
  name: string | null;
};

const KIND_LABELS: Record<ProjectTeamMemberKind, string> = {
  PROJECT_MANAGER: "Jefe de obra (PM)",
  SITE_FOREMAN: "Capataz",
  OTHER: "Otro",
};

function memberLabel(m: { name: string | null; email: string }): string {
  const n = m.name?.trim();
  if (n && n !== m.email) return `${n} (${m.email})`;
  return m.email;
}

export function ProjectTeamCard({
  projectId,
  members,
  pickerOptions,
  canEdit,
}: {
  projectId: string;
  members: ProjectTeamMemberView[];
  pickerOptions: ProjectTeamPickerOptionView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<ProjectTeamMemberKind>("PROJECT_MANAGER");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasAssignedPm = members.some((m) => m.kind === "PROJECT_MANAGER" && m.membershipActive);
  const hasSupervisor = members.some((m) => m.canSuperviseJobsiteLog);

  useEffect(() => {
    const scrollToTeam = () => {
      if (window.location.hash !== "#equipo-de-obra") return;
      document.getElementById("equipo-de-obra")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    scrollToTeam();
    window.addEventListener("hashchange", scrollToTeam);
    return () => window.removeEventListener("hashchange", scrollToTeam);
  }, []);

  const comboboxOptions = useMemo(
    () =>
      pickerOptions.map((o) => ({
        value: o.userId,
        label: memberLabel(o),
      })),
    [pickerOptions],
  );

  function handleAdd() {
    if (!userId) {
      setError("Seleccioná un usuario");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addProjectTeamMemberAction(projectId, { userId, kind });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setUserId("");
      router.refresh();
    });
  }

  function handleRemove(memberId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeProjectTeamMemberAction(projectId, memberId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card id="equipo-de-obra" className="scroll-mt-6 rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Equipo de obra</CardTitle>
        <p className="text-sm text-muted-foreground">
          Quién recibe avisos de libro de obra (campana y email). No cambia permisos de acceso a la
          obra.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAssignedPm ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            Hay que asignar un jefe de obra (PM).
            {!hasSupervisor
              ? " Sin alguien que pueda aprobar partes, los avisos pendientes van solo a OWNER/ADMIN."
              : null}
          </p>
        ) : !hasSupervisor ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            El PM del equipo no puede aprobar partes (revisá su rol en Configuración → Equipo). Los
            avisos pendientes van solo a OWNER/ADMIN.
          </p>
        ) : null}

        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay nadie en el equipo de esta obra.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{memberLabel(m)}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABELS[m.kind]}
                    {m.canSuperviseJobsiteLog ? " · recibe partes pendientes" : ""}
                    {!m.membershipActive ? " · membresía inactiva" : ""}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleRemove(m.id)}
                  >
                    Quitar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <div className="space-y-3 border-t pt-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="team-user">Usuario</Label>
                <SearchableCombobox
                  id="team-user"
                  options={comboboxOptions}
                  value={userId}
                  onValueChange={setUserId}
                  placeholder="Buscar miembro activo…"
                  searchPlaceholder="Nombre o email…"
                  emptyText="No hay más usuarios para agregar."
                  disabled={isPending || comboboxOptions.length === 0}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="team-kind">Rol en la obra</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => setKind(v as ProjectTeamMemberKind)}
                  disabled={isPending}
                >
                  <SelectTrigger id="team-kind" className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROJECT_MANAGER">{KIND_LABELS.PROJECT_MANAGER}</SelectItem>
                    <SelectItem value="SITE_FOREMAN">{KIND_LABELS.SITE_FOREMAN}</SelectItem>
                    <SelectItem value="OTHER">{KIND_LABELS.OTHER}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={handleAdd} disabled={isPending || !userId}>
                Agregar
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
