import {
  APP_NAME,
  renderTransactionalEmailHtml,
  renderTransactionalEmailText,
  type EmailContextField,
} from "./transactional-layout";

export type NotificationDigestEmailInput = {
  organizationName: string | null;
  recipientName: string | null;
  pendingFields: EmailContextField[];
  criticalFields: EmailContextField[];
  actionUrlAbsolute: string | null;
  settingsUrlAbsolute: string | null;
};

function digestEyebrow(organizationName: string | null): string {
  return organizationName?.trim()
    ? `${APP_NAME} · ${organizationName.trim()}`
    : `${APP_NAME} · Resumen diario`;
}

function buildBody(recipientName: string | null): string {
  const hello = recipientName?.trim() ? `Hola ${recipientName.trim()},` : "Hola,";
  return `${hello}\n\nEste es tu resumen matutino de colas operativas y alertas críticas. La campana in-app sigue mostrando el detalle completo.`;
}

function buildFooter(settingsUrlAbsolute: string | null): string {
  if (settingsUrlAbsolute?.trim()) {
    return `Este es un aviso automático de ${APP_NAME}. Preferencias de email: ${settingsUrlAbsolute.trim()}`;
  }
  return `Este es un aviso automático de ${APP_NAME}. Preferencias: Configuración → Notificaciones.`;
}

export function renderNotificationDigestEmailHtml(input: NotificationDigestEmailInput): string {
  const contextFields = [...input.pendingFields, ...input.criticalFields];
  const settings = input.settingsUrlAbsolute?.trim() || null;
  const body = settings
    ? `${buildBody(input.recipientName)}\n\nPreferencias de email: ${settings}`
    : buildBody(input.recipientName);

  return renderTransactionalEmailHtml({
    eyebrow: digestEyebrow(input.organizationName),
    title: "Resumen diario",
    body,
    contextFields,
    actionUrlAbsolute: input.actionUrlAbsolute,
    actionLabel: "Ver Pendientes",
    footer: `Este es un aviso automático de ${APP_NAME}.`,
    showFallbackLink: Boolean(input.actionUrlAbsolute),
  });
}

export function renderNotificationDigestEmailText(input: NotificationDigestEmailInput): string {
  const contextFields = [...input.pendingFields, ...input.criticalFields];
  return renderTransactionalEmailText({
    eyebrow: digestEyebrow(input.organizationName),
    title: "Resumen diario",
    body: buildBody(input.recipientName),
    contextFields,
    actionUrlAbsolute: input.actionUrlAbsolute,
    actionLabel: "Ver Pendientes",
    footer: buildFooter(input.settingsUrlAbsolute),
  });
}
