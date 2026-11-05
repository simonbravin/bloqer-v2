"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@bloqer/domain";
import type { PermissionModule } from "@bloqer/domain";
import type { FieldHomeProject } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { tenantGateFromSnapshot } from "@/features/projects/tenant-gate-from-snapshot";
import { useFieldProjectContext } from "@/lib/field-project-context";
import {
  fieldQuickActionHref,
  listFieldQuickActions,
  type FieldQuickActionId,
} from "@/lib/field-quick-actions";
import { FieldProjectPickerSheet } from "./field-project-picker";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: UserRole[];
  moduleGateSnapshot: Partial<Record<PermissionModule, boolean>>;
  convenienceProjectId: string | null;
  onCloseAutoFocus?: (event: Event) => void;
};

export function FieldPlusSheet({
  open,
  onOpenChange,
  roles,
  moduleGateSnapshot,
  convenienceProjectId,
  onCloseAutoFocus,
}: Props) {
  const router = useRouter();
  const { pathProjectId } = useFieldProjectContext();
  const gate = tenantGateFromSnapshot(moduleGateSnapshot);
  const actions = listFieldQuickActions(roles, (m) => gate.isEnabled(m));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<FieldQuickActionId | null>(null);
  const [projects, setProjects] = useState<FieldHomeProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  // Both path and remembered IDs must still be in the active, authorized registration list.
  const preferredProjectId = pathProjectId ?? convenienceProjectId;
  const actionProjectId = projects.some((project) => project.id === preferredProjectId)
    ? preferredProjectId
    : null;

  const selectingProject = open || pickerOpen;
  useEffect(() => {
    if (!selectingProject) return;
    let cancelled = false;
    setProjects([]);
    setProjectsLoading(true);
    setProjectsError(null);
    void fetch("/api/field/projects", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("projects"))))
      .then((data: { projects?: FieldHomeProject[] }) => {
        if (!cancelled) setProjects(data.projects ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([]);
          setProjectsError("No pudimos cargar las obras. Volvé a intentar.");
        }
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectingProject, pathProjectId, retryVersion]);

  function run(id: FieldQuickActionId) {
    if (actionProjectId) {
      onOpenChange(false);
      router.push(fieldQuickActionHref(actionProjectId, id));
      return;
    }
    setPendingAction(id);
    onOpenChange(false);
    setPickerOpen(true);
  }

  const operacion = actions.filter((a) => a.group === "operacion");
  const compras = actions.filter((a) => a.group === "compras");

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          onCloseAutoFocus={pickerOpen ? (event) => event.preventDefault() : onCloseAutoFocus}
          className="rounded-t-xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          data-testid="field-plus-sheet"
        >
          <SheetHeader>
            <SheetTitle>Registrar</SheetTitle>
            <SheetDescription>
              {actionProjectId
                ? "Elegí una acción. Se abre el flujo existente de la obra."
                : "Primero tenés que elegir una obra."}
            </SheetDescription>
          </SheetHeader>
          {actions.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No tenés acciones de campo habilitadas.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {operacion.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Operación</p>
                  {operacion.map((action) => (
                    <Button
                      key={action.id}
                      type="button"
                      variant="outline"
                      className="min-h-11 w-full justify-start"
                      onClick={() => run(action.id)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              ) : null}
              {compras.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Compras</p>
                  {compras.map((action) => (
                    <Button
                      key={action.id}
                      type="button"
                      variant="outline"
                      className="min-h-11 w-full justify-start"
                      onClick={() => run(action.id)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <FieldProjectPickerSheet
        open={pickerOpen}
        onOpenChange={(next) => {
          setPickerOpen(next);
          if (!next) setPendingAction(null);
        }}
        projects={projects}
        loading={projectsLoading}
        error={projectsError}
        onRetry={() => setRetryVersion((version) => version + 1)}
        onCloseAutoFocus={onCloseAutoFocus}
        afterSelectHref={
          pendingAction ? (projectId) => fieldQuickActionHref(projectId, pendingAction) : undefined
        }
      />
    </>
  );
}
