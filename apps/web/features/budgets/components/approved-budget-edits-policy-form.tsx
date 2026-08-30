"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApprovedBudgetEditsPolicyView } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SwitchField } from "@/components/ui/switch-field";
import {
  updateTenantApprovedBudgetEditsPolicyAction,
  updateProjectApprovedBudgetEditsPolicyAction,
} from "@/app/(app)/configuracion/politicas/actions";

type Props = {
  policy: ApprovedBudgetEditsPolicyView;
  canEdit: boolean;
};

const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  ON_HOLD: "En pausa",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
};

export function ApprovedBudgetEditsPolicyForm({ policy, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tenantAllow, setTenantAllow] = useState(policy.tenantAllow);

  useEffect(() => {
    setTenantAllow(policy.tenantAllow);
  }, [policy.tenantAllow]);

  function runTenantToggle(next: boolean) {
    if (!canEdit) return;
    const msg = next
      ? "¿Habilitar la edición excepcional de presupuestos aprobados en toda la organización? Solo las obras que también tengan el flag activo podrán editarse. Cada cambio queda en el registro."
      : "¿Deshabilitar la edición de presupuestos aprobados para toda la organización? Ninguna obra podrá editar presupuestos APPROVED hasta que se vuelva a habilitar.";
    if (!window.confirm(msg)) return;

    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const res = await updateTenantApprovedBudgetEditsPolicyAction({ allow: next });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setTenantAllow(next);
      setSuccess(next ? "Política de organización habilitada." : "Política de organización deshabilitada.");
      router.refresh();
    });
  }

  function runProjectToggle(projectId: string, code: string, next: boolean) {
    if (!canEdit) return;
    if (next && !tenantAllow) return;
    const msg = next
      ? `¿Permitir editar presupuestos aprobados en la obra ${code}? Quien tenga permiso de edición de presupuestos podrá agregar o cambiar partidas, APU, costos y venta. Cada cambio queda auditado.`
      : `¿Congelar de nuevo los presupuestos aprobados de la obra ${code}?`;
    if (!window.confirm(msg)) return;

    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const res = await updateProjectApprovedBudgetEditsPolicyAction({ projectId, allow: next });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSuccess(next ? `Obra ${code}: edición habilitada.` : `Obra ${code}: edición deshabilitada.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-base">Organización (kill-switch)</CardTitle>
          <CardDescription>
            Por defecto está apagado. Si está off, ningún presupuesto aprobado se puede editar
            (ni economía ni partidas), aunque una obra tenga el permiso. Solo OWNER o ADMIN
            pueden cambiarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-green-600 dark:text-green-500">{success}</p>
          )}
          <div className="rounded-lg border bg-muted/20 p-4">
            <SwitchField
              id="tenant-approved-budget-edits"
              className="border-0 bg-transparent px-0 py-0"
              label="Permitir edición excepcional de presupuestos aprobados"
              description={
                <>
                  Estado actual:{" "}
                  <span className="font-medium text-foreground">
                    {tenantAllow ? "Habilitado" : "Deshabilitado"}
                  </span>
                  . El cambio pide confirmación porque afecta a toda la organización.
                </>
              }
              checked={tenantAllow}
              onCheckedChange={(next) => runTenantToggle(next)}
              disabled={!canEdit || pending}
            />
            {!canEdit ? (
              <p className="mt-2 text-sm text-muted-foreground">Solo lectura</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-base">Por obra</CardTitle>
          <CardDescription>
            La excepción solo aplica a presupuestos en estado Aprobado. Si la obra aún no tiene uno,
            aparece el aviso; cuando lo aprueben, vas a poder habilitar la edición acá.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!tenantAllow && (
            <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">
              Primero habilitá el kill-switch de la organización para poder activar obras.
            </p>
          )}
          {policy.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay obras en este tenant.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Obra</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Presupuesto</th>
                    <th className="px-3 py-2 font-medium">Edición excepcional</th>
                  </tr>
                </thead>
                <tbody>
                  {policy.projects.map((p) => {
                    const terminal = p.status === "CANCELLED" || p.status === "COMPLETED";
                    const canEnable =
                      canEdit &&
                      tenantAllow &&
                      p.hasApprovedBudget &&
                      !terminal &&
                      !p.allow;
                    // Congelar even if the org kill-switch is off (cleanup project flags).
                    const canFreeze = canEdit && p.allow;
                    const interactive = canEnable || canFreeze;
                    const statusLabel = p.allow
                      ? "Habilitada"
                      : p.hasApprovedBudget
                        ? "Bloqueada"
                        : "No aplica aún";

                    return (
                      <tr key={p.id} className="border-t align-middle">
                        <td className="px-3 py-2.5 font-mono text-xs">{p.code}</td>
                        <td className="px-3 py-2.5">{p.name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                          {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                        </td>
                        <td className="px-3 py-2.5 max-w-[280px]">
                          {p.hasApprovedBudget ? (
                            <span className="font-medium">{p.budgetStatusLabel}</span>
                          ) : (
                            <span className="text-muted-foreground">{p.budgetStatusLabel}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3 min-w-[11rem]">
                            <span
                              className={
                                p.allow
                                  ? "text-xs font-medium text-amber-700 dark:text-amber-400"
                                  : "text-xs text-muted-foreground"
                              }
                            >
                              {statusLabel}
                            </span>
                            <Switch
                              checked={p.allow}
                              disabled={pending || !interactive}
                              onCheckedChange={(next) => {
                                if (next === p.allow) return;
                                runProjectToggle(p.id, p.code, next);
                              }}
                              aria-label={`Edición excepcional — ${p.code}`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
