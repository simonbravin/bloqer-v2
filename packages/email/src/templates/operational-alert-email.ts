import { escapeHtml } from "../escape-html";
import {
  APP_NAME,
  renderTransactionalEmailHtml,
  renderTransactionalEmailText,
  type EmailContextField,
} from "./transactional-layout";

export type OperationalAlertSeverityLabel = "INFO" | "SUCCESS" | "WARNING" | "ERROR";

export type OperationalAlertEmailTemplateInput = {
  title: string;
  body: string;
  severityLabel: OperationalAlertSeverityLabel;
  actionUrlAbsolute: string | null;
  actionLabel?: string;
  organizationName?: string | null;
  contextFields?: EmailContextField[];
  items?: string[];
  itemsHeading?: string;
};

const severityColors: Record<OperationalAlertSeverityLabel, string> = {
  INFO: "#2563eb",
  SUCCESS: "#059669",
  WARNING: "#d97706",
  ERROR: "#dc2626",
};

function operationalEyebrow(organizationName: string | null | undefined): string {
  const org = organizationName?.trim();
  return org ? `${APP_NAME} · Alerta operativa · ${org}` : `${APP_NAME} · Alerta operativa`;
}

export function renderOperationalAlertEmailHtml(input: OperationalAlertEmailTemplateInput): string {
  const color = severityColors[input.severityLabel];
  const badge = `<span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${color};">${escapeHtml(input.severityLabel)}</span>`;
  return renderTransactionalEmailHtml({
    eyebrow: operationalEyebrow(input.organizationName),
    title: input.title,
    body: input.body,
    badgeHtml: badge,
    contextFields: input.contextFields,
    items: input.items,
    itemsHeading: input.itemsHeading,
    actionUrlAbsolute: input.actionUrlAbsolute,
    actionLabel: input.actionLabel,
  });
}

export function renderOperationalAlertEmailText(input: OperationalAlertEmailTemplateInput): string {
  return renderTransactionalEmailText({
    eyebrow: `${operationalEyebrow(input.organizationName)} [${input.severityLabel}]`,
    title: input.title,
    body: input.body,
    contextFields: input.contextFields,
    items: input.items,
    itemsHeading: input.itemsHeading,
    actionUrlAbsolute: input.actionUrlAbsolute,
    actionLabel: input.actionLabel,
  });
}
