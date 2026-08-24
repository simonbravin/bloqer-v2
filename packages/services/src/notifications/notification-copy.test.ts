import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  documentCategoryLabelEs,
  documentUploadConfirmedCopy,
  formatCertificationCode,
  formatJobsiteLogDate,
  formatJobsiteLogLabel,
  formatNotificationTitle,
  formatPurchaseOrderCode,
  formatPurchaseRequestCode,
  formatSalesInvoiceCode,
  formatSubcontractCertificationCode,
  formatSubcontractCode,
  formatSupplierInvoiceCode,
  linkedEntityKindLabelEs,
  staleDocumentUploadCopy,
} from "./notification-copy";

describe("formatNotificationTitle", () => {
  it("joins event and identifier with a middle dot", () => {
    assert.equal(formatNotificationTitle("Documento listo", "Factura FP-00005"), "Documento listo · Factura FP-00005");
    assert.equal(formatNotificationTitle("Listo para pagar", "FP-00005"), "Listo para pagar · FP-00005");
  });

  it("keeps the event when there is no identifier", () => {
    assert.equal(formatNotificationTitle("Documento listo", null), "Documento listo");
    assert.equal(formatNotificationTitle("Documento listo", "  "), "Documento listo");
  });

  it("truncates long titles", () => {
    const out = formatNotificationTitle("Documento listo", "a".repeat(120));
    assert.equal(out.endsWith("…"), true);
    assert.ok(out.length <= 80);
    assert.ok(out.startsWith("Documento listo · "));
  });
});

describe("canonical notification codes", () => {
  it("pads invoice, cert, OC and SC codes like the rest of the product", () => {
    assert.equal(formatSupplierInvoiceCode(5), "FP-00005");
    assert.equal(formatSalesInvoiceCode(45), "FAC-00045");
    assert.equal(formatCertificationCode(7), "CERT-007");
    assert.equal(formatPurchaseOrderCode(12), "OC-012");
    assert.equal(formatPurchaseRequestCode(3), "SC-003");
    assert.equal(formatSubcontractCode(3), "Subcontrato SC-003");
    assert.equal(formatSubcontractCertificationCode(7), "CERT-SC-007");
  });

  it("labels a jobsite log by UTC calendar date", () => {
    const d = new Date("2026-08-24T00:00:00.000Z");
    assert.equal(formatJobsiteLogDate(d), "24/08/2026");
    assert.equal(formatJobsiteLogLabel(d), "Parte 24/08/2026");
  });

  it("maps linked entity kinds and document categories to Spanish nouns", () => {
    assert.equal(linkedEntityKindLabelEs("SUPPLIER_INVOICE"), "Factura");
    assert.equal(linkedEntityKindLabelEs("JOBSITE_LOG"), "Parte");
    assert.equal(linkedEntityKindLabelEs("CERTIFICATION"), "Certificación");
    assert.equal(linkedEntityKindLabelEs(null), null);
    assert.equal(documentCategoryLabelEs("INVOICE"), "Factura");
    assert.equal(documentCategoryLabelEs("OTHER"), null);
  });
});

describe("document notification copy", () => {
  it("names the linked invoice in title and body", () => {
    const copy = documentUploadConfirmedCopy({
      fileName: "ESCUDERO FERNANDO GABRIL Fact 0005-1563.pdf",
      entityLabel: "Factura FP-00005",
    });
    assert.equal(copy.title, "Documento listo · Factura FP-00005");
    assert.match(copy.body, /ESCUDERO FERNANDO GABRIL Fact 0005-1563\.pdf/);
    assert.match(copy.body, /Vinculado a Factura FP-00005/);
  });

  it("falls back to the file name when there is no entity", () => {
    const copy = documentUploadConfirmedCopy({
      fileName: "plano.pdf",
      entityLabel: null,
    });
    assert.equal(copy.title, "Documento listo · plano.pdf");
    assert.equal(copy.body, "El archivo «plano.pdf» se subió correctamente.");
    assert.doesNotMatch(copy.body, /Vinculado a/);
  });

  it("falls back to the document category when there is no linked entity", () => {
    const copy = documentUploadConfirmedCopy({
      fileName: "scan.pdf",
      entityLabel: null,
      category: "INVOICE",
    });
    assert.equal(copy.title, "Documento listo · Factura");
    assert.doesNotMatch(copy.body, /Vinculado a/);
  });

  it("names the entity on stale uploads", () => {
    const copy = staleDocumentUploadCopy({
      fileName: "parte.jpg",
      entityLabel: "Parte 24/08/2026",
    });
    assert.equal(copy.title, "Carga de documento pendiente · Parte 24/08/2026");
    assert.match(copy.body, /Vinculado a Parte 24\/08\/2026/);
  });
});
