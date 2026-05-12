import { escapeHtml } from "../escape-html";

const APP_NAME = "Bloqer";
const FOOTER = "Este es un aviso automático de Bloqer.";

export type NotificationEmailTemplateInput = {
  title: string;
  body: string;
  /** Absolute https URL when a public base URL is configured; otherwise omit CTA. */
  actionUrlAbsolute: string | null;
};

export function renderNotificationEmailHtml(input: NotificationEmailTemplateInput): string {
  const t = escapeHtml(input.title);
  const b = escapeHtml(input.body).replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
  const cta =
    input.actionUrlAbsolute !== null
      ? `<p><a href="${escapeHtml(input.actionUrlAbsolute)}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">Abrir en ${escapeHtml(APP_NAME)}</a></p>`
      : "";
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">${escapeHtml(APP_NAME)}</p>
  <h1 style="font-size:20px;margin:0 0 16px;">${t}</h1>
  <div style="font-size:15px;margin-bottom:24px;">${b}</div>
  ${cta}
  <p style="font-size:12px;color:#6b7280;margin-top:32px;">${escapeHtml(FOOTER)}</p>
</body>
</html>`;
}

export function renderNotificationEmailText(input: NotificationEmailTemplateInput): string {
  const lines = [APP_NAME, "", input.title, "", input.body, ""];
  if (input.actionUrlAbsolute) {
    lines.push(`Enlace: ${input.actionUrlAbsolute}`, "");
  }
  lines.push(FOOTER);
  return lines.join("\n");
}
