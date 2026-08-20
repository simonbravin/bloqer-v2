import {
  APP_NAME,
  notificationEyebrow,
  renderTransactionalEmailHtml,
  renderTransactionalEmailText,
  type EmailContextField,
} from "./transactional-layout";

export type { EmailContextField };

export type NotificationEmailTemplateInput = {
  title: string;
  body: string;
  /** Absolute https URL when a public base URL is configured; otherwise omit CTA. */
  actionUrlAbsolute: string | null;
  actionLabel?: string;
  organizationName?: string | null;
  contextFields?: EmailContextField[];
  items?: string[];
  itemsHeading?: string;
};

export function renderNotificationEmailHtml(input: NotificationEmailTemplateInput): string {
  return renderTransactionalEmailHtml({
    eyebrow: notificationEyebrow(input.organizationName),
    title: input.title,
    body: input.body,
    contextFields: input.contextFields,
    items: input.items,
    itemsHeading: input.itemsHeading,
    actionUrlAbsolute: input.actionUrlAbsolute,
    actionLabel: input.actionLabel,
  });
}

export function renderNotificationEmailText(input: NotificationEmailTemplateInput): string {
  return renderTransactionalEmailText({
    eyebrow: notificationEyebrow(input.organizationName),
    title: input.title,
    body: input.body,
    contextFields: input.contextFields,
    items: input.items,
    itemsHeading: input.itemsHeading,
    actionUrlAbsolute: input.actionUrlAbsolute,
    actionLabel: input.actionLabel,
  });
}

export { APP_NAME };
