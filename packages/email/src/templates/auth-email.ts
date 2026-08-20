import {
  APP_NAME,
  notificationEyebrow,
  renderTransactionalEmailHtml,
  renderTransactionalEmailText,
  type EmailContextField,
} from "./transactional-layout";

export type AuthEmailTemplateInput = {
  title: string;
  body: string;
  actionLabel: string;
  actionUrlAbsolute: string;
  organizationName?: string | null;
  contextFields?: EmailContextField[];
};

const AUTH_FOOTER = "Si no pediste este correo, podés ignorarlo.";

export function renderAuthEmailHtml(input: AuthEmailTemplateInput): string {
  return renderTransactionalEmailHtml({
    eyebrow: notificationEyebrow(input.organizationName),
    title: input.title,
    body: input.body,
    contextFields: input.contextFields,
    actionUrlAbsolute: input.actionUrlAbsolute,
    actionLabel: input.actionLabel,
    footer: AUTH_FOOTER,
    showFallbackLink: true,
  });
}

export function renderAuthEmailText(input: AuthEmailTemplateInput): string {
  return renderTransactionalEmailText({
    eyebrow: notificationEyebrow(input.organizationName),
    title: input.title,
    body: input.body,
    contextFields: input.contextFields,
    actionUrlAbsolute: input.actionUrlAbsolute,
    actionLabel: input.actionLabel,
    footer: AUTH_FOOTER,
  });
}

export { APP_NAME };
