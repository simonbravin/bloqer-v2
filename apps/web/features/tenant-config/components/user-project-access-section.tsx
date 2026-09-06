"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserProjectAccessEditor } from "@bloqer/services";
import { saveUserProjectAccessAction } from "@/app/(app)/configuracion/project-access-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  membershipId: string;
  initial: UserProjectAccessEditor;
  canEdit: boolean;
};

export function UserProjectAccessSection({ membershipId, initial, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial.projects.filter((p) => p.assigned).map((p) => p.projectId)),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSelected(new Set(initial.projects.filter((p) => p.assigned).map((p) => p.projectId)));
  }, [initial]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initial.projects;
    return initial.projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q),
    );
  }, [initial.projects, query]);

  const assignedCount = selected.size;

  function toggle(projectId: string) {
    setSuccess(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function onSave() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await saveUserProjectAccessAction(
        membershipId,
        initial.userId,
        [...selected],
      );
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  const modeLabel =
    initial.mode === "MEMBERSHIP_SCOPED" ? "Solo proyectos asignados" : "Todos los proyectos";

  return (
    <Card>
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">Acceso a obras</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1">
          <p className="text-sm font-medium">Acceso actual del tenant: {modeLabel}</p>
          {initial.mode === "TENANT_WIDE" ? (
            <p className="text-sm text-muted-foreground">
              Los usuarios con permisos de proyectos pueden acceder a todas las obras de la
              empresa. Las asignaciones de abajo se preparan y entran en vigencia cuando la
              empresa active el acceso por obra.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Los usuarios solo pueden acceder a las obras que tengan asignadas, salvo permisos
              de alcance global.
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground border-l-2 border-muted pl-3">
          Los <strong className="font-medium text-foreground">permisos (roles)</strong> definen
          qué puede hacer. El <strong className="font-medium text-foreground">acceso a obras</strong>{" "}
          define en qué proyectos puede hacerlo.
        </p>

        {initial.targetHasTenantWideAccess ? (
          <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">Acceso global a todas las obras</p>
            <p className="text-muted-foreground mt-1">
              Este usuario tiene autorización de alcance global: no necesita asignaciones por
              obra para ver proyectos. Podés preparar memberships de todas formas; no son
              obligatorias.
            </p>
          </div>
        ) : null}

        {initial.mode === "TENANT_WIDE" && !initial.targetHasTenantWideAccess ? (
          <p className="text-sm rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-950 dark:text-amber-100">
            Estas asignaciones entrarán en vigencia cuando la empresa active el acceso por obra.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Asignadas:{" "}
            <span className="font-medium text-foreground">
              {assignedCount} de {initial.totalProjects}
            </span>
          </p>
          {initial.totalProjects > 8 ? (
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o código…"
              className="max-w-xs"
              aria-label="Buscar obras"
            />
          ) : null}
        </div>

        <ul className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-2">
          {filtered.length === 0 ? (
            <li className="px-2 py-3 text-sm text-muted-foreground">No hay obras que coincidan.</li>
          ) : (
            filtered.map((p) => (
              <li key={p.projectId}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50",
                    !canEdit && "cursor-default",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border border-input"
                    checked={selected.has(p.projectId)}
                    disabled={!canEdit || pending}
                    onChange={() => toggle(p.projectId)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{p.name}</span>
                    {p.code ? (
                      <span className="ml-2 text-muted-foreground">{p.code}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">Asignaciones guardadas.</p>
        ) : null}

        {canEdit ? (
          <Button type="button" size="sm" onClick={onSave} disabled={pending}>
            {pending ? "Guardando…" : "Guardar acceso a obras"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">No tenés permisos para editar acceso a obras.</p>
        )}
      </CardContent>
    </Card>
  );
}
