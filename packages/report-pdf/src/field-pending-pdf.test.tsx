import assert from "node:assert/strict";
import { test } from "node:test";
import { FieldPendingPdfDocument } from "./pdf/field-pending-pdf";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";

test("pending PDF paginates all 123 actions without the generic 90-row truncation", async () => {
  const rows = Array.from({ length: 123 }, (_, i) => ({
    document: `OC-${i}`, type: "Orden de compra", projectCode: "PR-1", projectName: "Obra de prueba",
    stage: "Recibir", status: "Recepción parcial", description: "Proveedor de materiales",
    requestedBy: "Simón", date: "2026-11-27T14:00:00.000Z", overdueDays: "12", currency: "ARS",
    amount: "1234567.89", action: "Recibir",
  }));
  const props = { rows, filterLine: "Compras · Todas las obras autorizadas", branding: {
    tenantName: "Empresa de prueba", companyDisplayName: null, projectLabel: null, generatedByLabel: "Usuario de prueba",
    generatedAtIso: "2026-11-27T14:00:00.000Z", logoDataUri: null,
  } };
  const document = FieldPendingPdfDocument(props);
  assert.equal(document.props.children.length, 7);
  const buffer = await renderReportPdfToBuffer(<FieldPendingPdfDocument {...props} />);
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok((buffer.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0) >= 7);
});
