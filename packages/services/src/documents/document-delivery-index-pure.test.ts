import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCsv, parseBuiltCsv } from "../report-exports/csv-export.service";
import { buildDocumentDeliveryRows, documentDeliveryTable, type DeliveryDocumentSource } from "./document-delivery-index-pure";

const document = (id: string, overrides: Partial<DeliveryDocumentSource> = {}): DeliveryDocumentSource => ({
  id, tenantId: "tenant", companyId: null, effectiveCompanyId: "company", projectId: "project",
  originalFileName: `${id}.pdf`, category: "PLAN", status: "ACTIVE", storageProvider: "R2", sizeBytes: 18,
  uploadedBy: "author", createdAt: new Date("2026-11-27T14:11:12.000Z"),
  linkedEntityType: "PROJECT", linkedEntityId: "project", replacesAttachmentId: null, ...overrides,
});
const names = new Map([["author", "Responsable de obra"]]);

test("delivery index shows adjacent originals without numbering revisions or claiming integrity", () => {
  const previous = document("previous", { status: "ARCHIVED" });
  const current = document("current", { replacesAttachmentId: previous.id });
  const [row] = buildDocumentDeliveryRows([current], [previous], names);
  assert.deepEqual(row?.previous, { id: "previous", fileName: "previous.pdf" });
  assert.equal(row?.next, null);
  assert.equal(row?.originalRegistered, true);
  assert.equal(row?.createdAt, "2026-11-27T14:11:12.000Z");
  assert.equal(row?.uploadedByName, "Responsable de obra");
  assert.ok(!("storageKey" in row!) && !("checksumVerified" in row!));
  const [old] = buildDocumentDeliveryRows([previous], [current], names);
  assert.equal(old?.next?.id, "current");
});

test("delivery revision links reject mismatched tenants, companies, projects and operational parents", () => {
  const previous = document("previous");
  for (const patch of [
    { tenantId: "foreign" }, { effectiveCompanyId: "foreign" }, { projectId: "foreign" },
    { linkedEntityType: "PURCHASE_ORDER" as const }, { linkedEntityId: "foreign" },
  ]) {
    const current = document("current", { replacesAttachmentId: previous.id, ...patch });
    assert.equal(buildDocumentDeliveryRows([current], [previous], names)[0]?.previous, null);
    assert.equal(buildDocumentDeliveryRows([previous], [current], names)[0]?.next, null);
  }
  assert.equal(buildDocumentDeliveryRows([previous], [document("next-a", { replacesAttachmentId: previous.id }), document("next-b", { replacesAttachmentId: previous.id })], names)[0]?.next, null);
});

test("metadata placeholders and unconfirmed uploads are never advertised as registered originals", () => {
  for (const patch of [{ storageProvider: "PLACEHOLDER" as const }, { status: "UPLOADING" as const }, { status: "DELETED" as const }]) {
    assert.equal(buildDocumentDeliveryRows([document("file", patch)], [], names)[0]?.originalRegistered, false);
  }
  assert.equal(buildDocumentDeliveryRows([document("old", { status: "ARCHIVED" })], [], new Map())[0]?.uploadedByName, "Usuario desconocido");
});

test("delivery export retains all rows, exact UTC timestamps, provenance and neutralized spreadsheet content", () => {
  const rows = buildDocumentDeliveryRows(Array.from({ length: 65 }, (_, i) => document(`file-${i}`, {
    originalFileName: i === 64 ? '=HYPERLINK("https://example.test");"cierre".pdf' : `Plano ${i}.pdf`,
  })), [], names);
  const table = documentDeliveryTable(rows, "project");
  const parsed = parseBuiltCsv(buildCsv(table.headers, table.rows));
  assert.equal(parsed.rows.length, 65);
  assert.equal(parsed.rows[64]?.[1], "'=HYPERLINK(\"https://example.test\");\"cierre\".pdf");
  assert.equal(parsed.rows[0]?.[6], "2026-11-27T14:11:12.000Z");
  assert.equal(parsed.rows[0]?.[11], "company");
  assert.equal(parsed.rows[0]?.[15], "/proyectos/project/documentos/file-0");
});
