"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApprovedBudgetEditsPolicyView } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      ? `¿Permitir editar presupuestos aprobados en la obra ${code}? Quien tenga permiso de edición de presupuestos podrá cambiar WBS, costos y venta. Cada cambio queda auditado.`
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organización (kill-switch)</CardTitle>
          <CardDescription>
            Por defecto está apagado. Si está off, ningún presupuesto aprobado se puede editar aunque
            una obra tenga el permiso. Solo OWNER o ADMIN pueden cambiarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-green-600 dark:text-green-500">{success}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div className="space-y-1">
              <Label>Permitir edición excepcional de presupuestos aprobados</Label>
              <p className="text-xs text-muted-foreground">
                Estado actual:{" "}
                <span className="font-medium text-foreground">
                  {tenantAllow ? "Habilitado" : "Deshabilitado"}
                </span>
              </p>
            </div>
            {canEdit ? (
              <Button
                type="button"
                variant={tenantAllow ? "destructive" : "default"}
                disabled={pending}
                onClick={() => runTenantToggle(!tenantAllow)}
              >
                {tenantAllow ? "Deshabilitar" : "Habilitar"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Solo lectura</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
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
                    <th className="px-3 py-2 font-medium" />
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
                    return (
                      <tr key={p.id} className="border-t align-top">
                        <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                        <td className="px-3 py-2">{p.name}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                        </td>
                        <td className="px-3 py-2 max-w-[280px]">
                          {p.hasApprovedBudget ? (
                            <span className="font-medium">{p.budgetStatusLabel}</span>
                          ) : (
                            <span className="text-muted-foreground">{p.budgetStatusLabel}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {p.allow ? (
                            <span className="font-medium text-amber-700 dark:text-amber-400">
                              Habilitada
                            </span>
                          ) : p.hasApprovedBudget ? (
                            <span className="text-muted-foreground">Bloqueada</span>
                          ) : (
                            <span className="text-muted-foreground">No aplica aún</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {canFreeze ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => runProjectToggle(p.id, p.code, false)}
                            >
                              Congelar
                            </Button>
                          ) : canEnable ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              disabled={pending}
                              onClick={() => runProjectToggle(p.id, p.code, true)}
                            >
                              Habilitar
                            </Button>
                          ) : null}
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
