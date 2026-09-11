export { sendEmail } from "./send-email";
export type { EmailAttachment, EmailSendResult, SendEmailInput } from "./send-email";
export { escapeHtml } from "./escape-html";
export { formatNotificationEmailSubject, sanitizeEmailSubject } from "./format-subject";
export { renderNotificationEmailHtml, renderNotificationEmailText } from "./templates/notification-email";
export type { EmailContextField, NotificationEmailTemplateInput } from "./templates/notification-email";
export {
  renderOperationalAlertEmailHtml,
  renderOperationalAlertEmailText,
} from "./templates/operational-alert-email";
export type {
  OperationalAlertEmailTemplateInput,
  OperationalAlertSeverityLabel,
} from "./templates/operational-alert-email";
export {
  renderNotificationDigestEmailHtml,
  renderNotificationDigestEmailText,
} from "./templates/notification-digest-email";
export type { NotificationDigestEmailInput } from "./templates/notification-digest-email";
export { renderAuthEmailHtml, renderAuthEmailText } from "./templates/auth-email";
export type { AuthEmailTemplateInput } from "./templates/auth-email";
