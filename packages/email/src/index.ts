export { sendEmail } from "./send-email";
export type { EmailAttachment, EmailSendResult, SendEmailInput } from "./send-email";
export { escapeHtml } from "./escape-html";
export { renderNotificationEmailHtml, renderNotificationEmailText } from "./templates/notification-email";
export type { NotificationEmailTemplateInput } from "./templates/notification-email";
export {
  renderOperationalAlertEmailHtml,
  renderOperationalAlertEmailText,
} from "./templates/operational-alert-email";
export type {
  OperationalAlertEmailTemplateInput,
  OperationalAlertSeverityLabel,
} from "./templates/operational-alert-email";
