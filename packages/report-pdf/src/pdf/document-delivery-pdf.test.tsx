import assert from "node:assert/strict";
import { test } from "node:test";
import type { DocumentDeliveryRow } from "@bloqer/services";
import { DocumentDeliveryPdfDocument } from "./document-delivery-pdf";
import { renderReportPdfToBuffer } from "./pdf-renderer.service";

test("delivery PDF renders the complete multi-page index including long file names and archived originals", async () => {
  const rows: DocumentDeliveryRow[] = Array.from({ length: 26 }, (_, i) => ({
    id: `file-${i}`, companyId: "company", fileName: `Plano final ${i} — ${"Detalle constructivo ".repeat(12)}.pdf`,
    category: "PLAN", categoryLabel: "Plano", status: i % 2 ? "ACTIVE" : "ARCHIVED", uploadedBy: "author", uploadedByName: "Responsable de obra",
    createdAt: "2026-11-27T12:00:00.000Z", originalRegistered: true, sizeBytes: 18,
    linkedEntityType: "PROJECT", linkedEntityId: "project", previous: null, next: null,
    href: `/proyectos/project/documentos/file-${i}`,
  }));
  const element = DocumentDeliveryPdfDocument({ branding: {
    tenantName: "Empresa de prueba", companyDisplayName: "Constructora", projectLabel: "OBR-1 · Obra",
    generatedByLabel: "Responsable", generatedAtIso: "2026-11-27T14:00:00.000Z", logoDataUri: null,
  }, filterLine: "Activos y archivados", rows });
  assert.equal(element.props.children.length, 3, "All 26 rows span three page groups without truncation");
  const buffer = await renderReportPdfToBuffer(element);
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(buffer.length > 3000);
});
