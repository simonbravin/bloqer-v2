import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatNotificationEmailSubject } from "../format-subject";
import { renderNotificationEmailHtml, renderNotificationEmailText } from "./notification-email";
import { renderOperationalAlertEmailHtml, renderOperationalAlertEmailText } from "./operational-alert-email";
import { renderAuthEmailHtml, renderAuthEmailText } from "./auth-email";

describe("formatNotificationEmailSubject", () => {
  it("prefixes the tenant name", () => {
    assert.equal(
      formatNotificationEmailSubject("Nueva solicitud de compra", "Indari"),
      "[Indari] Nueva solicitud de compra",
    );
  });

  it("keeps the title when there is no organization", () => {
    assert.equal(formatNotificationEmailSubject("Nueva solicitud de compra", null), "Nueva solicitud de compra");
  });

  it("strips header-injection characters from title and org", () => {
    assert.equal(
      formatNotificationEmailSubject("Hola\r\nBcc: x@y.com", "Indari\nX"),
      "[Indari X] Hola Bcc: x@y.com",
    );
  });
});

describe("notification email template", () => {
  const base = {
    title: "Nueva solicitud de compra",
    body: "La solicitud SC-010 fue enviada y espera cotizaciones.",
    actionUrlAbsolute: "https://app.bloqer.com/proyectos/p1/solicitudes-compra/pr1" as string | null,
    organizationName: "Indari",
    contextFields: [
      { label: "Organización", value: "Indari" },
      { label: "Proyecto", value: "OBR-01 · Casa Palermo" },
      { label: "Solicitante", value: "Juan Pérez (juan@indari.com)" },
    ],
    items: ["12 kg — Cemento portland"],
    actionLabel: "Ver solicitud",
  };

  it("renders organization, context, items and CTA in HTML", () => {
    const html = renderNotificationEmailHtml(base);
    assert.match(html, /Bloqer · Indari/);
    assert.match(html, /Casa Palermo/);
    assert.match(html, /Juan Pérez/);
    assert.match(html, /Cemento portland/);
    assert.match(html, /Ver solicitud/);
    assert.match(html, /proyectos\/p1\/solicitudes-compra\/pr1/);
    assert.equal(html.includes("<script"), false);
  });

  it("escapes HTML in context values", () => {
    const html = renderNotificationEmailHtml({
      ...base,
      title: "<script>alert(1)</script>",
      contextFields: [{ label: "Proyecto", value: "<b>Hack</b>" }],
      items: ["<img src=x>"],
    });
    assert.equal(html.includes("<script>alert(1)</script>"), false);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;b&gt;Hack&lt;\/b&gt;/);
    assert.match(html, /&lt;img src=x&gt;/);
  });

  it("renders a readable plaintext version", () => {
    const text = renderNotificationEmailText(base);
    assert.match(text, /Bloqer · Indari/);
    assert.match(text, /Organización: Indari/);
    assert.match(text, /Proyecto: OBR-01 · Casa Palermo/);
    assert.match(text, /- 12 kg — Cemento portland/);
    assert.match(text, /Ver solicitud: https:\/\//);
  });

  it("omits the context table and CTA when empty", () => {
    const html = renderNotificationEmailHtml({
      title: "Aviso",
      body: "Hola",
      actionUrlAbsolute: null,
    });
    assert.match(html, />Bloqer</);
    assert.equal(html.includes("<table"), false);
    assert.equal(html.includes("Abrir en Bloqer"), false);
  });

  it("omits blank context rows", () => {
    const html = renderNotificationEmailHtml({
      title: "Aviso",
      body: "Hola",
      actionUrlAbsolute: null,
      contextFields: [{ label: "Proyecto", value: "   " }],
    });
    assert.equal(html.includes("<table"), false);
  });
});

describe("operational alert email template", () => {
  it("includes organization in the eyebrow", () => {
    const html = renderOperationalAlertEmailHtml({
      title: "OC demorada en aprobación",
      body: "La orden OC-003 lleva más de 48h pendiente.",
      severityLabel: "WARNING",
      actionUrlAbsolute: null,
      organizationName: "Indari",
      contextFields: [{ label: "Proyecto", value: "OBR-01 · Casa Palermo" }],
    });
    assert.match(html, /Alerta operativa · Indari/);
    assert.match(html, /WARNING/);
    assert.match(html, /Casa Palermo/);
  });

  it("renders plaintext with severity", () => {
    const text = renderOperationalAlertEmailText({
      title: "OC demorada",
      body: "Pendiente.",
      severityLabel: "WARNING",
      actionUrlAbsolute: "https://app.example/oc",
      organizationName: "Tenant Test",
    });
    assert.match(text, /Alerta operativa · Tenant Test \[WARNING\]/);
    assert.match(text, /Enlace: https:\/\/app.example\/oc|Abrir en Bloqer: https:\/\/app.example\/oc/);
  });
});

describe("auth email template", () => {
  it("uses the shared layout, organization and fallback link", () => {
    const html = renderAuthEmailHtml({
      title: "Invitación a Bloqer",
      body: "Te invitaron a unirte al equipo de Indari.",
      actionLabel: "Aceptar invitación",
      actionUrlAbsolute: "https://app.bloqer.com/invitaciones/aceptar?token=abc",
      organizationName: "Indari",
      contextFields: [
        { label: "Organización", value: "Indari" },
        { label: "Invitó", value: "Ana López (ana@indari.com)" },
      ],
    });
    assert.match(html, /Bloqer · Indari/);
    assert.match(html, /Aceptar invitación/);
    assert.match(html, /Si el botón no funciona/);
    assert.match(html, /Ana López/);
    assert.match(html, /Si no pediste este correo/);
  });

  it("renders plaintext with the same facts", () => {
    const text = renderAuthEmailText({
      title: "Confirmá tu email",
      body: "Para activar tu cuenta, abrí el enlace.",
      actionLabel: "Abrir confirmación",
      actionUrlAbsolute: "https://app.bloqer.com/verificar-email?token=xyz",
    });
    assert.match(text, /^Bloqer/m);
    assert.match(text, /Abrir confirmación: https:\/\//);
    assert.match(text, /Si no pediste este correo/);
  });
});
