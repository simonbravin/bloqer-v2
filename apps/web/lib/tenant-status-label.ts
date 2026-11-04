const TENANT_STATUS_LABEL_ES: Record<string, string> = {
  ACTIVE: "Activa",
  SUSPENDED: "Suspendida",
  INACTIVE: "Inactiva",
};

const SUBSCRIPTION_STATUS_LABEL_ES: Record<string, string> = {
  NONE: "Sin suscripción",
  TRIAL: "En prueba",
  ACTIVE: "Activa",
  PAST_DUE: "En mora",
  CANCELLED: "Cancelada",
};

const USER_ACCOUNT_STATUS_LABEL_ES: Record<string, string> = {
  INVITED: "Pendiente de activación",
  ACTIVE: "Activa",
  SUSPENDED: "Suspendida",
  INACTIVE: "Inactiva",
};

export function formatTenantStatusLabel(status: string): string {
  return Object.hasOwn(TENANT_STATUS_LABEL_ES, status) ? TENANT_STATUS_LABEL_ES[status]! : status;
}

export function formatSubscriptionStatusLabel(status: string): string {
  return Object.hasOwn(SUBSCRIPTION_STATUS_LABEL_ES, status) ? SUBSCRIPTION_STATUS_LABEL_ES[status]! : status;
}

export function formatMembershipStatusLabel(status: string): string {
  if (status === "ACTIVE") return "Activo";
  if (status === "INACTIVE") return "Inactivo";
  return status;
}

export function formatUserAccountStatusLabel(status: string): string {
  return Object.hasOwn(USER_ACCOUNT_STATUS_LABEL_ES, status) ? USER_ACCOUNT_STATUS_LABEL_ES[status]! : status;
}
