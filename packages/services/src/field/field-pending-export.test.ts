import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as XLSX from "xlsx";
import type { FieldPendingItem } from "./field-pending.service";
import * as access from "./field-pending-access";
import * as labels from "./field-pending-labels";
import * as mapping from "./field-pending-export-pure";
import * as csv from "../report-exports/csv-export.service";
import * as xlsx from "../report-exports/xlsx-export.service";
import * as filenames from "../report-exports/filename.service";
import { ServiceError, type ServiceContext } from "../types";

const ctx: ServiceContext = { tenantId: "tenant-a", companyId: "company-a", actorUserId: "user-a", roles: ["WAREHOUSE"] };
const projectId = "00000000-0000-4000-8000-000000000010";
function fixture(count: number): FieldPendingItem[] {
  return Array.from({ length: count }, (_, i) => ({
    entityType: "PURCHASE_ORDER_RECEIPT", entityId: `id-${i}`, projectId, projectCode: "PR-1",
    projectName: "Obra de prueba", group: "compras", typeLabel: "Orden de compra", title: `OC-${i}`,
    description: i === 100 ? "=HYPERLINK(\"https://example.com\")" : "Corralón Álvarez",
    statusLabel: "Recepción parcial", actionLabel: "Recibir", amount: i === 0 ? null : "1234567890.12",
    currency: i % 2 ? "USD" : "ARS", requestedByName: "Simón", occurredAt: new Date(2026, 0, i + 1),
    href: `/proyectos/${projectId}/ordenes-compra/id-${i}/recepciones/nueva`, priority: "stale", overdueDays: i % 2,
  }));
}

function loadExporter(items = fixture(123), denied = false) {
  const calls: unknown[] = [];
  const dependencies: Record<string, unknown> = {
    "./field-pending.service": { getMyFieldPendingItems: async (context: ServiceContext, filters: unknown) => {
      assert.equal(context, ctx); calls.push(filters);
      if (denied) throw new ServiceError("FORBIDDEN", "Sin acceso a la obra");
      return { items };
    } },
    "./field-pending-access": access, "./field-pending-labels": labels, "./field-pending-export-pure": mapping,
    "../report-exports/csv-export.service": csv, "../report-exports/xlsx-export.service": xlsx,
    "../report-exports/filename.service": filenames, "../types": { ServiceError },
  };
  const code = ts.transpileModule(readFileSync(new URL("./field-pending-export.service.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require(name: string) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { calls, api: exports as typeof import("./field-pending-export.service") };
}

test("CSV and Excel include all 123 actions beyond the old cap, preserve money and escape formulas", async () => {
  const loaded = loadExporter();
  const result = await loaded.api.exportFieldPendingData("csv", { proyecto: projectId, grupo: "compras" }, ctx);
  const parsed = csv.parseBuiltCsv(result.content!);
  assert.equal(parsed.rows.length, 123);
  assert.equal(parsed.rows.at(-1)![0], "OC-122");
  assert.equal(parsed.rows[0]![12], "");
  assert.equal(parsed.rows[1]![12], "1234567890.12");
  assert.match(parsed.rows[100]![5]!, /^'=HYPERLINK/);
  assert.equal(JSON.stringify(loaded.calls[0]), JSON.stringify({ projectId, group: "compras", complete: true }));
  const excel = await loaded.api.exportFieldPendingData("xlsx", {}, ctx);
  const workbook = XLSX.read(excel.buffer, { type: "buffer" });
  const data = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Pendientes!, { header: 1 });
  assert.equal(data.filter((row) => /^OC-/.test(row[0] ?? "")).length, 123);
  assert.ok(data.some((row) => row[0] === "OC-122"));
});

test("search, overdue and age sorting are identical for the view and exports", async () => {
  const rows = fixture(123);
  const loaded = loadExporter(rows);
  const filters = { search: "  corralon alvarez ", overdue: "1", sort: "newest" };
  const expected = labels.filterPendingView(rows, filters);
  const table = await loaded.api.buildFieldPendingExport(filters, ctx);
  assert.equal(table.rows.length, 61);
  assert.deepEqual(table.rows.map((r) => r.document), expected.map((r) => r.title));
  assert.equal(rows[0]!.title, "OC-0", "sorting must not mutate the source");
  assert.equal(labels.filterPendingView(rows, { search: "simON" }).length, 123);
});

test("bad filters reject before reads, and denied project access propagates", async () => {
  const loaded = loadExporter();
  for (const filters of [{ proyecto: "invalid" }, { grupo: "invalid" }, { overdue: "false" }, { sort: "amount" }]) {
    await assert.rejects(loaded.api.buildFieldPendingExport(filters, ctx), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
  }
  assert.equal(loaded.calls.length, 0);
  await assert.rejects(loadExporter([], true).api.exportFieldPendingData("csv", { proyecto: projectId }, ctx), /Sin acceso/);
});

test("empty exports retain column headers and never invent zero amounts", async () => {
  const result = await loadExporter([]).api.exportFieldPendingData("csv", {}, ctx);
  const parsed = csv.parseBuiltCsv(result.content!);
  assert.equal(parsed.headers.length, 14);
  assert.equal(parsed.rows.length, 0);
});
