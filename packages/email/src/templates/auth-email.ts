import { escapeHtml } from "../escape-html";

const APP_NAME = "Bloqer";
const FOOTER = "Si no pediste este correo, podés ignorarlo.";

export type AuthEmailTemplateInput = {
  title: string;
  body: string;
  actionLabel: string;
  actionUrlAbsolute: string;
};

export function renderAuthEmailHtml(input: AuthEmailTemplateInput): string {
  const t = escapeHtml(input.title);
  const b = escapeHtml(input.body).replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
  const label = escapeHtml(input.actionLabel);
  const href = escapeHtml(input.actionUrlAbsolute);
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">${escapeHtml(APP_NAME)}</p>
  <h1 style="font-size:20px;margin:0 0 16px;">${t}</h1>
  <div style="font-size:15px;margin-bottom:24px;">${b}</div>
  <p><a href="${href}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">${label}</a></p>
  <p style="font-size:12px;color:#6b7280;margin-top:24px;">Si el botón no funciona, copiá este enlace:<br/><span style="word-break:break-all;">${href}</span></p>
  <p style="font-size:12px;color:#6b7280;margin-top:32px;">${escapeHtml(FOOTER)}</p>
</body>
</html>`;
}

export function renderAuthEmailText(input: AuthEmailTemplateInput): string {
  return [
    APP_NAME,
    "",
    input.title,
    "",
    input.body,
    "",
    `${input.actionLabel}: ${input.actionUrlAbsolute}`,
    "",
    FOOTER,
  ].join("\n");
}
