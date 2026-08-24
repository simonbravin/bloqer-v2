import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionLabelForLinkedEntity,
  actionLabelForNotification,
  buildBaseContextFields,
  formatLineItem,
  formatNotificationIdentityBody,
  formatProjectLabel,
  formatQtyDisplay,
  formatUserLabel,
  notificationLeadBody,
  truncatePlainText,
} from "./notification-email-context";

describe("notification email context formatters", () => {
  it("joins project code and name", () => {
    assert.equal(formatProjectLabel("OBR-01", "Casa Palermo"), "OBR-01 · Casa Palermo");
    assert.equal(formatProjectLabel("OBR-01", ""), "OBR-01");
  });

  it("shows name and email when they differ", () => {
    assert.equal(formatUserLabel("Juan Pérez", "juan@indari.com"), "Juan Pérez (juan@indari.com)");
    assert.equal(formatUserLabel(null, "juan@indari.com"), "juan@indari.com");
    assert.equal(formatUserLabel("juan@indari.com", "juan@indari.com"), "juan@indari.com");
    assert.equal(formatUserLabel("  ", "  "), null);
  });

  it("trims trailing zeros on quantities", () => {
    assert.equal(formatQtyDisplay("12.0000", "kg"), "12 kg");
    assert.equal(formatQtyDisplay("12.5000", "m"), "12.5 m");
    assert.equal(formatLineItem("10.0000", "u", "Cemento"), "10 u — Cemento");
  });

  it("omits company when it matches the organization", () => {
    const fields = buildBaseContextFields({
      organizationName: "Indari",
      companyName: "Indari",
      projectLabel: "OBR-01 · Casa Palermo",
    });
    assert.deepEqual(
      fields.map((f) => f.label),
      ["Organización", "Proyecto"],
    );
  });

  it("keeps company when it differs from the tenant", () => {
    const fields = buildBaseContextFields({
      organizationName: "Indari",
      companyName: "Indari Sur",
      projectLabel: null,
    });
    assert.deepEqual(
      fields.map((f) => f.value),
      ["Indari", "Indari Sur"],
    );
  });

  it("truncates long notes", () => {
    const out = truncatePlainText("a".repeat(300), 20);
    assert.equal(out.endsWith("…"), true);
    assert.equal(out.length, 20);
  });

  it("picks CTA labels by entity and notification type", () => {
    assert.equal(actionLabelForLinkedEntity("PURCHASE_REQUEST"), "Ver solicitud");
    assert.equal(actionLabelForLinkedEntity("PURCHASE_ORDER"), "Ver orden");
    assert.equal(actionLabelForLinkedEntity("JOBSITE_LOG"), "Ver parte de obra");
    assert.equal(actionLabelForLinkedEntity(null), "Abrir en Bloqer");
    assert.equal(actionLabelForNotification("PAYABLE_READY_TO_PAY", "SUPPLIER_INVOICE"), "Registrar pago");
    assert.equal(actionLabelForNotification("RECEIVABLE_READY_TO_COLLECT", "SALES_INVOICE"), "Registrar cobranza");
    assert.equal(actionLabelForNotification("ACCOUNTING_DRAFTS_PENDING", "OTHER"), "Ver asientos");
    assert.equal(actionLabelForNotification("DOCUMENT_UPLOAD_CONFIRMED", "SUPPLIER_INVOICE"), "Ver documento");
    assert.equal(
      actionLabelForNotification(
        "DOCUMENT_UPLOAD_CONFIRMED",
        "SUPPLIER_INVOICE",
        "/proyectos/p1/documentos/d1",
      ),
      "Ver documento",
    );
    assert.equal(
      actionLabelForNotification(
        "DOCUMENT_UPLOAD_CONFIRMED",
        "SUPPLIER_INVOICE",
        "/finanzas/facturas-proveedor/inv1",
      ),
      "Ver factura",
    );
    assert.equal(
      actionLabelForNotification("DOCUMENT_UPLOAD_CONFIRMED", "JOBSITE_LOG", "/proyectos/p1/documentos/d1"),
      "Ver documento",
    );
    assert.equal(actionLabelForNotification("DOCUMENT_UPLOAD_CONFIRMED", "PROJECT"), "Ver documento");
    assert.equal(actionLabelForNotification("JOBSITE_LOG_RETURNED", "JOBSITE_LOG"), "Corregir parte");
    assert.equal(actionLabelForNotification("STALE_DOCUMENT_UPLOAD", null), "Ver documento");
  });
});

describe("formatNotificationIdentityBody", () => {
  it("keeps a lone lead sentence", () => {
    assert.equal(
      formatNotificationIdentityBody("La solicitud SC-010 fue enviada y espera cotizaciones.", {
        organizationName: null,
        companyName: null,
        projectLabel: null,
        requestedByName: null,
        actorName: null,
      }),
      "La solicitud SC-010 fue enviada y espera cotizaciones.",
    );
  });

  it("appends organization, project and requester", () => {
    const body = formatNotificationIdentityBody(
      "La solicitud SC-010 fue enviada y espera cotizaciones.",
      {
        organizationName: "Indari",
        companyName: "Indari",
        projectLabel: "OBR-01 · Casa Palermo",
        requestedByName: "Juan Pérez (juan@indari.com)",
        actorName: "Juan Pérez (juan@indari.com)",
      },
    );
    assert.equal(
      body,
      [
        "La solicitud SC-010 fue enviada y espera cotizaciones.",
        "",
        "Organización: Indari",
        "Proyecto: OBR-01 · Casa Palermo",
        "Solicitante: Juan Pérez (juan@indari.com)",
      ].join("\n"),
    );
  });

  it("shows company and sender when they differ", () => {
    const body = formatNotificationIdentityBody("La orden OC-003 requiere aprobación.", {
      organizationName: "Indari",
      companyName: "Indari Sur",
      projectLabel: null,
      requestedByName: "Juan Pérez",
      actorName: "Ana López",
    });
    assert.match(body, /Empresa: Indari Sur/);
    assert.match(body, /Enviada por: Ana López/);
  });

  it("strips the identity appendix for email/bell preview", () => {
    const stored = formatNotificationIdentityBody("La solicitud SC-010 fue enviada y espera cotizaciones.", {
      organizationName: "Indari",
      companyName: "Indari",
      projectLabel: "OBR-01 · Casa Palermo",
      requestedByName: "Juan Pérez",
      actorName: "Juan Pérez",
    });
    assert.equal(notificationLeadBody(stored), "La solicitud SC-010 fue enviada y espera cotizaciones.");
    assert.equal(notificationLeadBody("Sin bloque de identidad"), "Sin bloque de identidad");
    assert.equal(
      notificationLeadBody("Cuerpo con\n\nnota interna que no es identidad"),
      "Cuerpo con\n\nnota interna que no es identidad",
    );
  });
});
