import { can, type UserRole } from "@bloqer/domain";
import type { PermissionModule } from "@bloqer/domain";

export type FieldQuickActionId = "jobsiteLog" | "purchaseRequest" | "consumption" | "document";

export type FieldQuickAction = {
  id: FieldQuickActionId;
  label: string;
  group: "operacion" | "compras";
};

const ACTIONS: FieldQuickAction[] = [
  { id: "jobsiteLog", label: "Nuevo parte", group: "operacion" },
  { id: "consumption", label: "Registrar consumo", group: "operacion" },
  { id: "document", label: "Subir documento/foto", group: "operacion" },
  { id: "purchaseRequest", label: "Solicitud de compra", group: "compras" },
];

export function fieldQuickActionHref(projectId: string, id: FieldQuickActionId): string {
  switch (id) {
    case "jobsiteLog":
      return `/proyectos/${projectId}/libro-obra/nuevo`;
    case "purchaseRequest":
      return `/proyectos/${projectId}/solicitudes-compra/nueva`;
    case "consumption":
      return `/proyectos/${projectId}/consumos`;
    case "document":
      return `/proyectos/${projectId}/documentos`;
  }
}

export function listFieldQuickActions(
  roles: UserRole[],
  isEnabled: (module: PermissionModule) => boolean,
): FieldQuickAction[] {
  return ACTIONS.filter((action) => {
    switch (action.id) {
      case "jobsiteLog":
        return (
          isEnabled("JOBSITE_LOG") &&
          (can(roles, "EDIT", "JOBSITE_LOG") || can(roles, "EDIT", "PROJECTS"))
        );
      case "purchaseRequest":
        return (
          isEnabled("PROCUREMENT") &&
          (can(roles, "EDIT", "PURCHASE_REQUESTS") || can(roles, "EDIT", "PROCUREMENT"))
        );
      case "consumption":
        return isEnabled("INVENTORY") && can(roles, "EDIT", "INVENTORY");
      case "document":
        return can(roles, "EDIT", "PROJECTS");
    }
  });
}
