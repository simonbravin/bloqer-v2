import { escapeHtml } from "../escape-html";

export const APP_NAME = "Bloqer";
export const TRANSACTIONAL_FOOTER = "Este es un aviso automático de Bloqer.";

export type EmailContextField = {
  label: string;
  value: string;
};

export type TransactionalEmailLayoutInput = {
  eyebrow: string;
  title: string;
  body: string;
  badgeHtml?: string;
  contextFields?: EmailContextField[];
  items?: string[];
  itemsHeading?: string;
  actionUrlAbsolute: string | null;
  actionLabel?: string;
  footer?: string;
  /** Auth/invitation: show a copy-paste URL under the CTA. */
  showFallbackLink?: boolean;
};

function renderContextTableHtml(fields: EmailContextField[]): string {
  if (fields.length === 0) return "";
  const rows = fields
    .map(
      (f) =>
        `<tr>
    <td style="padding:6px 12px 6px 0;color:#6b7280;width:148px;vertical-align:top;font-size:13px;">${escapeHtml(f.label)}</td>
    <td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(f.value).replace(/\r\n/g, "\n").replace(/\n/g, "<br/>")}</td>
  </tr>`,
    )
    .join("");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">${rows}</table>`;
}

function renderItemsHtml(items: string[], heading: string): string {
  if (items.length === 0) return "";
  const lis = items.map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`).join("");
  return `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111827;">${escapeHtml(heading)}</p>
<ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#111827;">${lis}</ul>`;
}

export function renderTransactionalEmailHtml(input: TransactionalEmailLayoutInput): string {
  const t = escapeHtml(input.title);
  const b = escapeHtml(input.body).replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
  const footer = escapeHtml(input.footer ?? TRANSACTIONAL_FOOTER);
  const actionLabel = escapeHtml(input.actionLabel ?? `Abrir en ${APP_NAME}`);
  const cta =
    input.actionUrlAbsolute !== null
      ? `<p><a href="${escapeHtml(input.actionUrlAbsolute)}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">${actionLabel}</a></p>`
      : "";
  const badge = input.badgeHtml ? `<p style="margin:0 0 12px;">${input.badgeHtml}</p>` : "";
  const fields = renderContextTableHtml(input.contextFields ?? []);
  const items = renderItemsHtml(input.items ?? [], input.itemsHeading ?? "Ítems");
  const fallback =
    input.showFallbackLink && input.actionUrlAbsolute
      ? `<p style="font-size:12px;color:#6b7280;margin-top:24px;">Si el botón no funciona, copiá este enlace:<br/><span style="word-break:break-all;">${escapeHtml(input.actionUrlAbsolute)}</span></p>`
      : "";
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">${escapeHtml(input.eyebrow)}</p>
  ${badge}
  <h1 style="font-size:20px;margin:0 0 16px;">${t}</h1>
  <div style="font-size:15px;margin-bottom:24px;">${b}</div>
  ${fields}
  ${items}
  ${cta}
  ${fallback}
  <p style="font-size:12px;color:#6b7280;margin-top:32px;">${footer}</p>
</body>
</html>`;
}

export function renderTransactionalEmailText(input: TransactionalEmailLayoutInput): string {
  const lines = [input.eyebrow, "", input.title, "", input.body, ""];
  const fields = (input.contextFields ?? []).filter((f) => f.value.trim() !== "");
  if (fields.length > 0) {
    for (const f of fields) {
      lines.push(`${f.label}: ${f.value}`);
    }
    lines.push("");
  }
  const items = input.items ?? [];
  if (items.length > 0) {
    lines.push(input.itemsHeading ?? "Ítems");
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  if (input.actionUrlAbsolute) {
    const label = input.actionLabel ?? `Abrir en ${APP_NAME}`;
    lines.push(`${label}: ${input.actionUrlAbsolute}`, "");
  }
  lines.push(input.footer ?? TRANSACTIONAL_FOOTER);
  return lines.join("\n");
}

export function notificationEyebrow(organizationName: string | null | undefined): string {
  const org = organizationName?.trim();
  return org ? `${APP_NAME} · ${org}` : APP_NAME;
}
