import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import type { DocumentProps } from "@react-pdf/renderer";
import ts from "typescript";
import type { OperationalListExportTable, ServiceContext } from "@bloqer/services";
import type { PdfReportBranding } from "./branding/pdf-branding.types";
import { safeReportFilename } from "./filename.service";
import { MAX_PROJECT_REPORT_PDF_ROWS, type ReportPdfPayload } from "./pdf/pdf-export.types";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";
import { ProjectSimpleTablePdfDocument } from "./pdf/project-simple-table-pdf";

const ctx: ServiceContext = { tenantId: "tenant-test", companyId: "company-test", actorUserId: "actor-test", roles: ["OWNER"] };
const branding: PdfReportBranding = {
  tenantName: "Constructora de prueba", companyDisplayName: "Empresa de prueba S.A.",
  projectLabel: "PR-001 · Casa de prueba", generatedByLabel: "Administración de prueba",
  generatedAtIso: "2026-11-11T15:00:00.000Z", logoDataUri: null,
};

function tableFixture(count: number): OperationalListExportTable {
  return {
    title: "Facturas proveedor", filenameBase: "facturas_proveedor_PR-001",
    projectLabel: branding.projectLabel!, filterLine: "Estado: Activas · Tipo: Nota de crédito",
    columns: [
      { key: "code", label: "Código", flex: .7 }, { key: "kind", label: "Tipo", flex: .9 },
      { key: "letter", label: "Letra", flex: .4 },
      { key: "party", label: "Proveedor", flex: 1.2 }, { key: "class", label: "Clase", flex: 1.1 },
      { key: "issue", label: "Emisión", flex: .7 }, { key: "due", label: "Vencimiento", flex: .7 },
      { key: "status", label: "Estado", flex: .7 }, { key: "currency", label: "Moneda", flex: .45 },
      { key: "total", label: "Total", flex: .8 }, { key: "paymentStatus", label: "Estado de pago", flex: .8 },
    ],
    rows: Array.from({ length: count }, (_, index) => ({
      code: `NC-${String(index + 1).padStart(3, "0")}`, kind: "Nota de crédito", letter: "A",
      party: "Proveedor sintético de materiales", class: "Compra de obra",
      issue: "2026-11-01", due: "2026-11-30", status: "Emitida", currency: index % 2 ? "USD" : "ARS",
      total: "1234567.89", paymentStatus: "Parcialmente pagada",
    })),
  };
}

function loadExporter(table: OperationalListExportTable, denyRead = false) {
  const calls: string[] = [];
  const params = { kind: "CREDIT_NOTE", search: "materiales", status: "ISSUED" };
  let document: ReactElement<Record<string, unknown>> | undefined;
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "@bloqer/services": { buildProjectOperationalListExport: async (id: string, kind: string, filters: unknown, scope: unknown) => {
      calls.push("read");
      assert.equal(id, "project-test"); assert.equal(kind, "supplier-invoices");
      assert.equal(filters, params); assert.equal(scope, ctx);
      if (denyRead) throw new Error("Sin permiso para consultar esta obra");
      return table;
    } },
    "./branding/pdf-branding.service": { resolvePdfReportBranding: async (scope: unknown, options: { projectId: string }) => {
      calls.push("branding"); assert.equal(scope, ctx); assert.equal(options.projectId, "project-test"); return branding;
    } },
    "./pdf/project-simple-table-pdf": { ProjectSimpleTablePdfDocument },
    "./pdf/pdf-export.types": { MAX_PROJECT_REPORT_PDF_ROWS },
    "./filename.service": { safeReportFilename },
    "./pdf/pdf-renderer.service": { renderReportPdfToBuffer: async (element: ReactElement<Record<string, unknown>>) => {
      calls.push("render"); document = element;
      return renderReportPdfToBuffer(element as ReactElement<DocumentProps>);
    } },
  };
  const code = ts.transpileModule(readFileSync(new URL("./operational-list-pdf-export.service.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require(name: string) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected PDF dependency ${name}`); return dependencies[name]; } });
  const exporter = (exports as { exportProjectOperationalListPdf: (id: string, kind: string, params: unknown, ctx: ServiceContext) => Promise<ReportPdfPayload> }).exportProjectOperationalListPdf;
  return { calls, export: () => exporter("project-test", "supplier-invoices", params, ctx), document: () => { assert.ok(document); return document; } };
}

for (const count of [8, MAX_PROJECT_REPORT_PDF_ROWS + 4]) {
  test(`operational PDF renders ${count} records with project branding, filters and explicit overflow notice`, async () => {
    const table = tableFixture(count), loaded = loadExporter(table);
    const { buffer, filename } = await loaded.export();
    assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(buffer.length > 2000);
    assert.equal(filename, "facturas_proveedor_PR-001.pdf");
    assert.deepEqual(loaded.calls, ["read", "branding", "render"]);
    const props = loaded.document().props;
    assert.equal(props.branding, branding);
    assert.equal(props.filterLine, table.filterLine);
    assert.equal(props.rows, table.rows);
    assert.equal(props.subtitle, `${count} registros encontrados`);
    const pageCount = buffer.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;
    if (count > MAX_PROJECT_REPORT_PDF_ROWS) {
      assert.match(String(props.footerNote), /4 filas omitidas \(límite 90\).*Exportá Excel/);
      assert.equal((props.warnings as string[])[0], props.footerNote);
      assert.ok(pageCount > 1, "Long details must paginate rather than overflow a page");
    } else {
      assert.equal(props.footerNote, undefined);
      assert.equal(props.warnings, undefined);
      assert.equal(pageCount, 1);
    }
    if (process.env.BLOQER_OPERATIONAL_PDF_REVIEW_DIR) {
      await mkdir(process.env.BLOQER_OPERATIONAL_PDF_REVIEW_DIR, { recursive: true });
      await writeFile(join(process.env.BLOQER_OPERATIONAL_PDF_REVIEW_DIR, `operational-list-${count}.pdf`), buffer);
    }
  });
}

test("a denied operational read never resolves branding or renders a PDF", async () => {
  const loaded = loadExporter(tableFixture(1), true);
  await assert.rejects(loaded.export(), /Sin permiso para consultar esta obra/);
  assert.deepEqual(loaded.calls, ["read"]);
});
