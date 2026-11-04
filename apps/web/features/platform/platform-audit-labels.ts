/** Spanish labels for `PlatformAuditLog.action` values (platform superadmin UI). */
export const PLATFORM_AUDIT_ACTION_LABEL_ES: Record<string, string> = {
  "platform.tenant.status_updated": "Estado operativo actualizado",
  "platform.tenant.plan_metadata_updated": "Plan / suscripción actualizada",
  "platform.tenant.module_updated": "Módulo actualizado",
  "platform.tenant.provisioned": "Organización creada",
  "platform.tenant.invitation_created": "Invitación creada",
  "platform.tenant.invitation_cancelled": "Invitación cancelada",
  "platform.tenant.trial_extended": "Prueba extendida",
};

export function platformAuditActionLabel(action: string): string {
  return PLATFORM_AUDIT_ACTION_LABEL_ES[action] ?? action;
}

export const PLATFORM_EXPIRATION_CATEGORY_LABEL_ES: Record<string, string> = {
  trial_ending_7: "Prueba vence en ≤7 días",
  trial_ending_14: "Prueba vence en ≤14 días",
  trial_ending_30: "Prueba vence en ≤30 días",
  trial_expired: "Prueba vencida",
  past_due: "Suscripción en mora",
  suspended: "Organización suspendida",
  no_active_owner: "Sin propietario activo",
  no_active_users: "Sin usuarios activos",
};
