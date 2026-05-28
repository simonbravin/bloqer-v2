"use client";

import { useMemo } from "react";
import {
  effectivePermissionCeiling,
  getPermissionModuleGroupSections,
  type PermissionAction,
  type PermissionModule,
  type UserRole,
} from "@bloqer/domain";
import { TENANT_MODULE_LABEL_ES } from "@bloqer/domain";
import { PLATFORM_ROLE_LABEL_ES } from "./platform-role-presets";

type Props = {
  selectedRoles: readonly UserRole[];
};

function ceilingLabel(v: PermissionAction | null): string {
  if (v === null) return "";
  if (v === "VIEW") return "Ver";
  if (v === "EDIT") return "Editar";
  return "Aprobar";
}

export function RolePermissionPreview({ selectedRoles }: Props) {
  const sections = useMemo(() => getPermissionModuleGroupSections(), []);

  if (selectedRoles.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Seleccioná al menos un rol para ver un resumen de permisos (matriz canónica del producto).
      </p>
    );
  }

  const level = (a: PermissionAction) => (a === "VIEW" ? 1 : a === "EDIT" ? 2 : 3);

  const modulesWithAccess: { module: string; label: string; ceiling: PermissionAction }[] = [];
  for (const section of sections) {
    for (const mod of section.modules) {
      let best: PermissionAction | null = null;
      for (const role of selectedRoles) {
        const cell = effectivePermissionCeiling(role, mod as PermissionModule);
        if (cell === null) continue;
        if (best === null || level(cell) > level(best)) best = cell;
      }
      if (best !== null) {
        modulesWithAccess.push({
          module: mod,
          label: TENANT_MODULE_LABEL_ES[mod],
          ceiling: best,
        });
      }
    }
  }

  if (modulesWithAccess.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Los roles seleccionados no tienen módulos habilitados en la matriz.
      </p>
    );
  }

  const preview = modulesWithAccess.slice(0, 12);
  const more = modulesWithAccess.length - preview.length;

  return (
    <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-3 text-xs">
      <p className="mb-2 font-medium text-foreground">
        Vista previa ({selectedRoles.map((r) => PLATFORM_ROLE_LABEL_ES[r]).join(", ")})
      </p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {preview.map((item) => (
          <li key={item.module} className="flex justify-between gap-2 text-muted-foreground">
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 font-medium text-foreground">{ceilingLabel(item.ceiling)}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-2 text-muted-foreground">+{more} módulos más con acceso.</p>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Resumen informativo; permisos finos por proyecto se aplican en servicios del tenant.
      </p>
    </div>
  );
}
