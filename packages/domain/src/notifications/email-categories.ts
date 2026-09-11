import type { UserRole } from "../permissions/roles";

/**
 * Email preference categories ([D-114] / P-EMAIL-02).
 * In-app campana stays on D-054 CC; these gates only outbound email.
 */
export const NOTIFICATION_EMAIL_CATEGORIES = [
  "PROCUREMENT_FLOW",
  "PROCUREMENT_ESCALATION",
  "AP_PAYMENT",
  "AR_COLLECTION",
  "AP_OVERDUE",
  "JOBSITE_LOG",
  "OPERATIONAL_OTHER",
  "DAILY_DIGEST",
] as const;

export type NotificationEmailCategory = (typeof NOTIFICATION_EMAIL_CATEGORIES)[number];

export const NOTIFICATION_EMAIL_CATEGORY_LABEL_ES: Record<NotificationEmailCategory, string> = {
  PROCUREMENT_FLOW: "Compras — flujo diario (SC / OC)",
  PROCUREMENT_ESCALATION: "Compras — alertas y escalamientos",
  AP_PAYMENT: "CxP — listo para pagar",
  AR_COLLECTION: "CxC — cobranza y vencidos",
  AP_OVERDUE: "CxP — vencidos",
  JOBSITE_LOG: "Libro de obra",
  OPERATIONAL_OTHER: "Otras alertas operativas",
  DAILY_DIGEST: "Resumen diario (digest)",
};

export const NOTIFICATION_EMAIL_CATEGORY_DESCRIPTION_ES: Record<NotificationEmailCategory, string> = {
  PROCUREMENT_FLOW:
    "Solicitudes enviadas o devueltas, OC pendiente / aprobada / devuelta / confirmada, pago confirmado.",
  PROCUREMENT_ESCALATION:
    "Recordatorios SLA, entregas o neededBy vencidos, recepción sin factura, OC sobre umbral alto.",
  AP_PAYMENT: "Factura de proveedor emitida lista para registrar el pago (también respeta la política de canal AP).",
  AR_COLLECTION: "Factura de venta lista para cobrar y CxC vencidas.",
  AP_OVERDUE: "Cuentas por pagar vencidas.",
  JOBSITE_LOG: "Parte enviado, devuelto o aprobado.",
  OPERATIONAL_OTHER: "Stock negativo, certificación sin factura de venta, documentos colgados en carga.",
  DAILY_DIGEST: "Un mail matutino con colas estilo Pendientes y críticos (Propietario / Administrador).",
};

/** NotificationType string union mirrored from Prisma (domain stays Prisma-free). */
export type NotificationTypeKey =
  | "DOCUMENT_UPLOAD_CONFIRMED"
  | "JOBSITE_LOG_RETURNED"
  | "JOBSITE_LOG_SUBMITTED"
  | "JOBSITE_LOG_APPROVED"
  | "CERTIFICATION_APPROVED"
  | "RECEIVABLE_OVERDUE"
  | "PAYABLE_OVERDUE"
  | "NEGATIVE_STOCK"
  | "CERTIFICATION_APPROVED_WITHOUT_INVOICE"
  | "STALE_DOCUMENT_UPLOAD"
  | "PURCHASE_REQUEST_SUBMITTED"
  | "PURCHASE_REQUEST_RETURNED"
  | "PURCHASE_ORDER_PENDING_APPROVAL"
  | "PURCHASE_ORDER_APPROVED"
  | "PURCHASE_ORDER_RETURNED"
  | "PURCHASE_ORDER_CONFIRMED"
  | "PROCUREMENT_SLA_REMINDER"
  | "PURCHASE_ORDER_DELIVERY_OVERDUE"
  | "PURCHASE_REQUEST_NEEDED_BY_OVERDUE"
  | "PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE"
  | "ACCOUNTING_DRAFTS_PENDING"
  | "PAYABLE_READY_TO_PAY"
  | "PAYMENT_CONFIRMED"
  | "RECEIVABLE_READY_TO_COLLECT";

/**
 * Types that never send transactional notification email from this preference system
 * (auth / invite use other templates; some types are in-app only).
 */
export const NOTIFICATION_TYPES_WITHOUT_EMAIL: ReadonlySet<NotificationTypeKey> = new Set([
  "DOCUMENT_UPLOAD_CONFIRMED",
  "CERTIFICATION_APPROVED",
  "ACCOUNTING_DRAFTS_PENDING",
]);

const TYPE_TO_CATEGORY: Record<NotificationTypeKey, NotificationEmailCategory | null> = {
  PURCHASE_REQUEST_SUBMITTED: "PROCUREMENT_FLOW",
  PURCHASE_REQUEST_RETURNED: "PROCUREMENT_FLOW",
  PURCHASE_ORDER_PENDING_APPROVAL: "PROCUREMENT_FLOW",
  PURCHASE_ORDER_APPROVED: "PROCUREMENT_FLOW",
  PURCHASE_ORDER_RETURNED: "PROCUREMENT_FLOW",
  PURCHASE_ORDER_CONFIRMED: "PROCUREMENT_FLOW",
  PAYMENT_CONFIRMED: "PROCUREMENT_FLOW",
  PROCUREMENT_SLA_REMINDER: "PROCUREMENT_ESCALATION",
  PURCHASE_ORDER_DELIVERY_OVERDUE: "PROCUREMENT_ESCALATION",
  PURCHASE_REQUEST_NEEDED_BY_OVERDUE: "PROCUREMENT_ESCALATION",
  PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE: "PROCUREMENT_ESCALATION",
  PAYABLE_READY_TO_PAY: "AP_PAYMENT",
  RECEIVABLE_READY_TO_COLLECT: "AR_COLLECTION",
  RECEIVABLE_OVERDUE: "AR_COLLECTION",
  PAYABLE_OVERDUE: "AP_OVERDUE",
  JOBSITE_LOG_SUBMITTED: "JOBSITE_LOG",
  JOBSITE_LOG_RETURNED: "JOBSITE_LOG",
  JOBSITE_LOG_APPROVED: "JOBSITE_LOG",
  NEGATIVE_STOCK: "OPERATIONAL_OTHER",
  CERTIFICATION_APPROVED_WITHOUT_INVOICE: "OPERATIONAL_OTHER",
  STALE_DOCUMENT_UPLOAD: "OPERATIONAL_OTHER",
  DOCUMENT_UPLOAD_CONFIRMED: null,
  CERTIFICATION_APPROVED: null,
  ACCOUNTING_DRAFTS_PENDING: null,
};

/** Categories where OWNER/ADMIN are CC'd on email only if tenant policy or user opt-in. */
export const LEADERSHIP_DAILY_FLOW_CATEGORIES: ReadonlySet<NotificationEmailCategory> = new Set([
  "PROCUREMENT_FLOW",
  "AP_PAYMENT",
  "AR_COLLECTION",
  "AP_OVERDUE",
  "JOBSITE_LOG",
  "OPERATIONAL_OTHER",
]);

export function notificationTypeToEmailCategory(
  type: string,
  options?: { highLevelApproval?: boolean },
): NotificationEmailCategory | null {
  if (NOTIFICATION_TYPES_WITHOUT_EMAIL.has(type as NotificationTypeKey)) {
    return null;
  }
  if (options?.highLevelApproval && type === "PURCHASE_ORDER_PENDING_APPROVAL") {
    return "PROCUREMENT_ESCALATION";
  }
  if (!(type in TYPE_TO_CATEGORY)) return null;
  return TYPE_TO_CATEGORY[type as NotificationTypeKey];
}

function isOwnerOrAdmin(roles: readonly UserRole[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "ADMIN");
}

function hasAnyRole(roles: readonly UserRole[], wanted: readonly UserRole[]): boolean {
  return roles.some((r) => wanted.includes(r));
}

/**
 * Default email ON/OFF when the user has no preference row.
 * Leadership daily-flow OFF is the main anti-spam rule ([D-114]).
 */
export function defaultEmailEnabledForCategory(
  category: NotificationEmailCategory,
  roles: readonly UserRole[],
): boolean {
  const oa = isOwnerOrAdmin(roles);

  switch (category) {
    case "DAILY_DIGEST":
      return oa;
    case "PROCUREMENT_ESCALATION":
      return oa || hasAnyRole(roles, ["PROCUREMENT", "PROJECT_MANAGER", "WAREHOUSE", "FINANCE"]);
    case "PROCUREMENT_FLOW":
      if (oa) return false;
      return hasAnyRole(roles, ["PROCUREMENT", "PROJECT_MANAGER", "WAREHOUSE"]);
    case "AP_PAYMENT":
      if (oa) return false;
      return hasAnyRole(roles, ["FINANCE", "TREASURER"]);
    case "AR_COLLECTION":
      if (oa) return false;
      return hasAnyRole(roles, ["FINANCE", "TREASURER", "SALES", "PROJECT_FINANCE", "VIEWER"]);
    case "AP_OVERDUE":
      if (oa) return false;
      return hasAnyRole(roles, ["FINANCE", "TREASURER", "PROCUREMENT", "PROJECT_FINANCE", "VIEWER"]);
    case "JOBSITE_LOG":
      if (oa) return false;
      return hasAnyRole(roles, ["PROJECT_MANAGER", "SITE_FOREMAN"]);
    case "OPERATIONAL_OTHER":
      if (oa) return false;
      return hasAnyRole(roles, [
        "FINANCE",
        "PROCUREMENT",
        "WAREHOUSE",
        "PROJECT_MANAGER",
        "PROJECT_FINANCE",
        "VIEWER",
        "SITE_FOREMAN",
      ]);
    default:
      return false;
  }
}

/** Categories a user should see in the preferences UI. */
export function visibleEmailCategoriesForRoles(
  roles: readonly UserRole[],
): NotificationEmailCategory[] {
  const oa = isOwnerOrAdmin(roles);
  if (oa) return [...NOTIFICATION_EMAIL_CATEGORIES];

  return NOTIFICATION_EMAIL_CATEGORIES.filter((cat) => {
    if (cat === "DAILY_DIGEST") return false;
    // Show category if default would be on OR role could reasonably opt in
    // (anyone who might receive that notification type via permission audience).
    switch (cat) {
      case "PROCUREMENT_FLOW":
      case "PROCUREMENT_ESCALATION":
        return hasAnyRole(roles, ["PROCUREMENT", "PROJECT_MANAGER", "WAREHOUSE", "FINANCE"]);
      case "AP_PAYMENT":
        return hasAnyRole(roles, ["FINANCE", "TREASURER"]);
      case "AR_COLLECTION":
        return hasAnyRole(roles, ["FINANCE", "TREASURER", "SALES", "PROJECT_FINANCE", "VIEWER"]);
      case "AP_OVERDUE":
        return hasAnyRole(roles, ["FINANCE", "TREASURER", "PROCUREMENT", "PROJECT_FINANCE", "VIEWER"]);
      case "JOBSITE_LOG":
        return hasAnyRole(roles, ["PROJECT_MANAGER", "SITE_FOREMAN"]);
      case "OPERATIONAL_OTHER":
        return hasAnyRole(roles, [
          "FINANCE",
          "PROCUREMENT",
          "WAREHOUSE",
          "PROJECT_MANAGER",
          "PROJECT_FINANCE",
          "VIEWER",
          "SITE_FOREMAN",
        ]);
      default:
        return false;
    }
  });
}

export type ResolveNotificationEmailPreferenceInput = {
  category: NotificationEmailCategory;
  roles: readonly UserRole[];
  /** Explicit user row; null/undefined = use role default. */
  userEmailEnabled?: boolean | null;
  /**
   * Tenant policy: when true, OWNER/ADMIN get role-default replaced with ON
   * for leadership daily-flow categories (restores legacy CC email).
   */
  leadershipDailyFlowEmailCc?: boolean;
  /** Tenant default for digest when user has no preference. */
  digestEnabledDefault?: boolean;
};

/**
 * Pure resolver: should this user receive email for this category?
 */
export function resolveNotificationEmailPreference(
  input: ResolveNotificationEmailPreferenceInput,
): boolean {
  const { category, roles, userEmailEnabled, leadershipDailyFlowEmailCc, digestEnabledDefault } =
    input;

  if (userEmailEnabled === true || userEmailEnabled === false) {
    return userEmailEnabled;
  }

  if (category === "DAILY_DIGEST") {
    if (typeof digestEnabledDefault === "boolean" && isOwnerOrAdmin(roles)) {
      return digestEnabledDefault;
    }
    return defaultEmailEnabledForCategory(category, roles);
  }

  if (
    leadershipDailyFlowEmailCc &&
    isOwnerOrAdmin(roles) &&
    LEADERSHIP_DAILY_FLOW_CATEGORIES.has(category)
  ) {
    return true;
  }

  return defaultEmailEnabledForCategory(category, roles);
}
