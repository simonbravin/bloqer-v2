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
import type { PurchaseOrderDocument, ServiceContext } from "@bloqer/services";
import type { PdfReportBranding } from "./branding/pdf-branding.types";
import { safeReportFilename } from "./filename.service";
import type { ReportPdfPayload } from "./pdf/pdf-export.types";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";
import { PurchaseOrderDocumentPdf } from "./pdf/purchase-order-document-pdf";

const ctx: ServiceContext = { tenantId: "tenant", companyId: null, actorUserId: "user", roles: ["OWNER"] };
const branding: PdfReportBranding = {
  tenantName: "Constructora de prueba", companyDisplayName: "Empresa principal incorrecta", projectLabel: "PR-20 · Obra sintética",
  generatedByLabel: "private-operator@example.test", generatedAtIso: "2026-11-19T14:00:00.000Z", logoDataUri: null,
};
function fixture(count: number): PurchaseOrderDocument {
  return {
    code: "OC-048", statusLabel: "Aprobada internamente", notice: "APROBADA INTERNAMENTE — Pendiente de confirmación.",
    issueDate: "19/11/2026", expectedDeliveryDate: "25/11/2026", currency: "ARS",
    company: { name: "Empresa emisora S.A.", fiscalId: "30-00000000-0", address: "Calle 10, Mendoza, AR" },
    supplier: { name: "Proveedor de prueba S.A.", fiscalId: "30-11111111-1", address: "Ruta 40, Mendoza, AR" },
    project: { label: "PR-20 · Obra sintética", address: "Acceso 20, Mendoza, AR" },
    lines: Array.from({ length: count }, (_, index) => ({
      description: `Ítem ${index + 1}: panel de prueba con espesor y dimensiones verificadas. ${index === 1 ? "Especificación técnica completa sin omitir información. ".repeat(36) : ""} FIN-${index + 1}`,
      quantity: "0,0001", unit: "m3", unitPrice: "200.000,1234", discountPct: "1,2345", taxRate: "21,00", lineTotal: "24,20",
    })),
    subtotal: "1.234.567,89", taxAmount: "259.259,26", iibbPerceptionRate: "3,00", iibbPerceptionAmount: "37.037,04", totalAmount: "1.530.864,19",
  };
}

function load(document: PurchaseOrderDocument, denied = false) {
  const calls: string[] = [];
  let rendered: ReactElement<{ document: PurchaseOrderDocument; branding: PdfReportBranding }> | null = null;
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "@bloqer/services": { buildPurchaseOrderDocument: async (poId: string, projectId: string, scope: ServiceContext) => {
      calls.push("read"); assert.equal(poId, "po"); assert.equal(projectId, "project"); assert.equal(scope, ctx);
      if (denied) throw new Error("Acceso denegado");
      return { companyId: "order-company", document };
    } },
    "./branding/pdf-branding.service": { resolvePdfReportBranding: async (scope: ServiceContext, options: { projectId: string }) => {
      calls.push("branding"); assert.equal(scope.companyId, "order-company"); assert.equal(scope.tenantId, "tenant"); assert.equal(options.projectId, "project");
      return branding;
    } },
    "./filename.service": { safeReportFilename },
    "./pdf/purchase-order-document-pdf": { PurchaseOrderDocumentPdf },
    "./pdf/pdf-renderer.service": { renderReportPdfToBuffer: async (element: typeof rendered) => {
      calls.push("render"); rendered = element;
      return renderReportPdfToBuffer(element as ReactElement<DocumentProps>);
    } },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("./purchase-order-pdf-export.service.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, require(name: string) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  const exporter = (exports as { exportPurchaseOrderPdf: (poId: string, projectId: string, scope: ServiceContext) => Promise<ReportPdfPayload> }).exportPurchaseOrderPdf;
  return { calls, export: () => exporter("po", "project", ctx), rendered: () => { assert.ok(rendered); return rendered; } };
}

function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join(" ");
  if (value && typeof value === "object" && "props" in value) return textContent((value as { props: { children?: unknown } }).props.children);
  return "";
}

for (const count of [2, 110]) {
  test(`PO PDF renders all ${count} lines including long descriptions and correct issuer`, async () => {
    const document = fixture(count), loaded = load(document);
    const { buffer, filename } = await loaded.export();
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
    assert.ok(buffer.length > 2000);
    assert.equal(filename, "OC-048_Empresa_emisora_S.A.pdf");
    assert.deepEqual(loaded.calls, ["read", "branding", "render"]);
    assert.equal(loaded.rendered().props.branding.companyDisplayName, document.company.name);
    assert.equal(loaded.rendered().props.branding.generatedByLabel, null);
    assert.equal(loaded.rendered().props.document.lines.length, count);
    const content = textContent(PurchaseOrderDocumentPdf({ document, branding }));
    assert.ok(content.includes(document.lines[1]!.description));
    assert.ok(content.includes(`FIN-${count}`));
    assert.ok(content.includes(document.notice!));
    assert.ok(content.includes("Domicilio de obra:"));
    assert.doesNotMatch(content, /private-operator|Empresa principal incorrecta|truncad/);
    const pages = buffer.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;
    assert.ok(pages > 1, "Long specifications must paginate without truncation");
    if (process.env.BLOQER_PO_PDF_REVIEW_DIR) {
      await mkdir(process.env.BLOQER_PO_PDF_REVIEW_DIR, { recursive: true });
      await writeFile(join(process.env.BLOQER_PO_PDF_REVIEW_DIR, `purchase-order-${count}.pdf`), buffer);
    }
  });
}

test("a denied order never triggers branding reads or PDF rendering", async () => {
  const loaded = load(fixture(1), true);
  await assert.rejects(loaded.export(), /Acceso denegado/);
  assert.deepEqual(loaded.calls, ["read"]);
});
