"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateProjectApprovedBudgetEditsPolicyAction } from "@/app/(app)/configuracion/politicas/actions";

type Props = {
  projectId: string;
  projectAllow: boolean;
  canManagePolicy: boolean;
  /** Override activo pero el usuario no tiene EDIT BUDGETS. */
  readOnlyEdit?: boolean;
};

export function ApprovedBudgetEditBanner({
  projectId,
  projectAllow,
  canManagePolicy,
  readOnlyEdit = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function freezeProject() {
    if (!canManagePolicy || !projectAllow) return;
    if (
      !window.confirm(
        "¿Congelar de nuevo los presupuestos aprobados de esta obra? Dejará de poder editarse la economía mientras el presupuesto esté aprobado.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await updateProjectApprovedBudgetEditsPolicyAction({
        projectId,
        allow: false,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <p className="font-medium">Edición excepcional en presupuesto aprobado</p>
      <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
        {readOnlyEdit
          ? "La obra tiene habilitada la excepción, pero tu usuario no puede editar presupuestos. Pedile a alguien con permiso de edición o congelá la excepción si sos OWNER/ADMIN."
          : "Podés agregar, quitar y editar partidas, APU, costos y venta. Cada cambio queda en el registro de auditoría. Cuando la obra esté definida, congelá esta excepción."}
      </p>
      {error && <p className="mt-2 text-destructive">{error}</p>}
      {canManagePolicy && projectAllow ? (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={freezeProject}
          >
            Congelar edición en esta obra
          </Button>
        </div>
      ) : null}
    </div>
  );
}
