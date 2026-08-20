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
};

export function FieldPlusSheet({
  open,
  onOpenChange,
  roles,
  moduleGateSnapshot,
  convenienceProjectId,
}: Props) {
  const router = useRouter();
  const gate = tenantGateFromSnapshot(moduleGateSnapshot);
  const actions = listFieldQuickActions(roles, (m) => gate.isEnabled(m));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<FieldQuickActionId | null>(null);
  const [projects, setProjects] = useState<FieldHomeProject[]>([]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    void fetch("/api/field/projects", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("projects"))))
      .then((data: { projects?: FieldHomeProject[] }) => {
        if (!cancelled) setProjects(data.projects ?? []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen]);

  function run(id: FieldQuickActionId) {
    if (convenienceProjectId) {
      onOpenChange(false);
      router.push(fieldQuickActionHref(convenienceProjectId, id));
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
          className="rounded-t-xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          data-testid="field-plus-sheet"
        >
          <SheetHeader>
            <SheetTitle>Registrar</SheetTitle>
            <SheetDescription>
              {convenienceProjectId
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
        afterSelectHref={
          pendingAction ? (projectId) => fieldQuickActionHref(projectId, pendingAction) : undefined
        }
      />
    </>
  );
}
