"use client";

import { useMemo, useState } from "react";
import { OVERVIEW_ROLES, type UserRole } from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORM_ROLE_LABEL_ES, PLATFORM_ROLE_PRESETS } from "./platform-role-presets";
import { RolePermissionPreview } from "./role-permission-preview";

interface TenantInvitationFormProps {
  action: (formData: FormData) => void | Promise<void>;
  tenantId?: string;
  companies?: { id: string; name: string }[];
  submitLabel?: string;
}

export function TenantInvitationForm({
  action,
  tenantId,
  companies,
  submitLabel = "Crear invitación",
}: TenantInvitationFormProps) {
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);

  const selectedSet = useMemo(() => new Set(selectedRoles), [selectedRoles]);

  function toggleRole(role: UserRole, checked: boolean) {
    setSelectedRoles((prev) => {
      if (checked) return prev.includes(role) ? prev : [...prev, role];
      return prev.filter((r) => r !== role);
    });
  }

  function applyPreset(roles: readonly UserRole[]) {
    setSelectedRoles([...roles]);
  }

  return (
    <form action={action} className="space-y-4 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
      {tenantId ? <input type="hidden" name="tenantId" value={tenantId} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="nombre@empresa.com"
        />
      </div>
      {companies && companies.length > 0 ? (
        <div className="grid gap-2">
          <Label htmlFor="companyId">Empresa (opcional)</Label>
          <select
            id="companyId"
            name="companyId"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">— Sin asignar —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="expiresInDays">Vencimiento (días)</Label>
        <Input
          id="expiresInDays"
          name="expiresInDays"
          type="number"
          min={1}
          max={30}
          defaultValue={7}
          className="max-w-[120px]"
        />
        <p className="text-xs text-muted-foreground">Entre 1 y 30 días (por defecto 7).</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Plantillas rápidas</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_ROLE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset.roles)}
            >
              {preset.labelEs}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Roles</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OVERVIEW_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`role_${role}`}
                className="h-4 w-4 rounded border border-input"
                checked={selectedSet.has(role)}
                onChange={(e) => toggleRole(role, e.target.checked)}
              />
              <span>
                {PLATFORM_ROLE_LABEL_ES[role]}
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">({role})</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Marcá al menos un rol.</p>
      </div>

      <RolePermissionPreview selectedRoles={selectedRoles} />

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
