"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MembershipScopedActivationPreview, ProjectAccessMode } from "@bloqer/services";
import {
  previewProjectAccessModeAction,
  setProjectAccessModeAction,
} from "@/app/(app)/configuracion/project-access-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import Link from "next/link";

type Props = {
  initialMode: ProjectAccessMode;
  canEdit: boolean;
};

export function ProjectAccessModeSection({ initialMode, canEdit }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<ProjectAccessMode>(initialMode);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<MembershipScopedActivationPreview | null>(null);
  const [confirmLockouts, setConfirmLockouts] = useState(false);
  const [targetMode, setTargetMode] = useState<ProjectAccessMode | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  function openConfirm(next: ProjectAccessMode) {
    if (next === mode) return;
    setError(null);
    setSuccess(null);
    setConfirmLockouts(false);
    setTargetMode(next);
    startTransition(async () => {
      const res = await previewProjectAccessModeAction();
      if ("error" in res) {
        setError(res.error ?? "No se pudo previsualizar el cambio.");
        setTargetMode(null);
        return;
      }
      setPreview(res.preview);
      setDialogOpen(true);
    });
  }

  function onConfirm() {
    if (!targetMode) return;
    if (activatingScoped && lockoutCount > 0 && !confirmLockouts) {
      setError("Confirmá que revisaste las asignaciones antes de activar.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await setProjectAccessModeAction({
        mode: targetMode,
        confirmLockouts:
          targetMode === "MEMBERSHIP_SCOPED" && lockoutCount > 0 ? true : undefined,
      });
      if ("error" in res) {
        setError(res.error ?? "No se pudo cambiar el modo.");
        return;
      }
      setMode(res.mode as ProjectAccessMode);
      setDialogOpen(false);
      setTargetMode(null);
      setPreview(null);
      setSuccess(
        res.mode === "MEMBERSHIP_SCOPED"
          ? "Acceso por obras activado."
          : "Se restauró el acceso a todos los proyectos.",
      );
      router.refresh();
    });
  }

  const lockoutCount = preview?.projectCapableWithoutProjects.length ?? 0;
  const activatingScoped = targetMode === "MEMBERSHIP_SCOPED";

  return (
    <>
      <Card>
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-base">Acceso a proyectos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground max-w-3xl">
            Separá <strong className="font-medium text-foreground">qué puede hacer</strong> un
            usuario (roles) de <strong className="font-medium text-foreground">en qué obras</strong>{" "}
            puede hacerlo (asignaciones). Prepará asignaciones en{" "}
            <Link href="/configuracion/equipo" className="underline underline-offset-2">
              Equipo
            </Link>{" "}
            antes de restringir.
          </p>

          <fieldset className="space-y-3" disabled={!canEdit || pending}>
            <legend className="sr-only">Modo de acceso a proyectos</legend>
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
              <input
                type="radio"
                name="projectAccessMode"
                className="mt-1"
                checked={mode === "TENANT_WIDE"}
                onChange={() => openConfirm("TENANT_WIDE")}
              />
              <span>
                <span className="font-medium text-sm">Todos los proyectos</span>
                <span className="block text-sm text-muted-foreground mt-0.5">
                  Quien tenga permisos de proyectos puede acceder a todas las obras de la empresa.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
              <input
                type="radio"
                name="projectAccessMode"
                className="mt-1"
                checked={mode === "MEMBERSHIP_SCOPED"}
                onChange={() => openConfirm("MEMBERSHIP_SCOPED")}
              />
              <span>
                <span className="font-medium text-sm">Solo proyectos asignados</span>
                <span className="block text-sm text-muted-foreground mt-0.5">
                  Cada usuario solo ve las obras asignadas (salvo acceso global de administración).
                </span>
              </span>
            </label>
          </fieldset>

          {!canEdit ? (
            <p className="text-sm text-muted-foreground">
              No tenés permisos para cambiar este modo.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">{success}</p>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setTargetMode(null);
            setPreview(null);
            setConfirmLockouts(false);
          }
        }}
        title={
          activatingScoped ? "Activar acceso por obras" : "Restaurar acceso a todos los proyectos"
        }
        confirmLabel={
          activatingScoped ? "Activar acceso por obras" : "Restaurar acceso amplio"
        }
        variant={activatingScoped && lockoutCount > 0 ? "destructive" : "default"}
        pending={pending}
        confirmDisabled={activatingScoped && lockoutCount > 0 && !confirmLockouts}
        onConfirm={onConfirm}
        description={
          <div className="space-y-3">
            {activatingScoped ? (
              <p>
                A partir de este cambio, los usuarios afectados solo podrán acceder a proyectos
                que tengan asignados.
              </p>
            ) : (
              <p>
                Los usuarios con permisos de proyectos volverán a poder acceder a todas las obras
                de la empresa. Las asignaciones preparadas se conservan.
              </p>
            )}
            {preview ? (
              <ul className="list-disc pl-4 space-y-1 text-sm">
                <li>{preview.activeMemberCount} usuarios activos</li>
                <li>{preview.membersWithMembership} con obras asignadas</li>
                <li>{preview.companyWideAccessCount} con acceso global</li>
                <li>{preview.projectCount} obras en la empresa</li>
                {lockoutCount > 0 ? (
                  <li className="text-destructive font-medium">
                    {lockoutCount} con permisos de proyecto quedarían sin ninguna obra
                  </li>
                ) : null}
              </ul>
            ) : null}
            {activatingScoped && lockoutCount > 0 ? (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  Revisá las asignaciones antes de continuar.
                </p>
                <ul className="max-h-28 overflow-y-auto text-xs space-y-0.5">
                  {preview?.projectCapableWithoutProjects.slice(0, 12).map((u) => (
                    <li key={u.userId}>
                      {u.name ?? u.email}{" "}
                      <span className="text-muted-foreground">({u.email})</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/configuracion/equipo"
                  className="text-sm underline underline-offset-2"
                  onClick={() => setDialogOpen(false)}
                >
                  Revisar asignaciones
                </Link>
                <label className="flex items-start gap-2 text-sm pt-1">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border"
                    checked={confirmLockouts}
                    onChange={(e) => setConfirmLockouts(e.target.checked)}
                  />
                  <span>Confirmo que revisé las asignaciones.</span>
                </label>
              </div>
            ) : null}
          </div>
        }
      />
    </>
  );
}
