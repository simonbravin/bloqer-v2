import assert from "node:assert/strict";
import { test } from "node:test";
import { readReportDownload, reportDownloadHref } from "./report-download";

test("the chosen export format replaces an incoming URL format and keeps filters", () => {
  const query = reportDownloadHref("/api/reports/demo.csv", { format: ["json", "pdf"], currency: "USD" }, "csv");
  const url = new URL(query, "https://example.test");
  assert.deepEqual(url.searchParams.getAll("format"), ["csv"]);
  assert.equal(url.searchParams.get("currency"), "USD");
});

test("downloads reject HTML and a successful response with the wrong format", async () => {
  const html = new Response("<html>Sign in</html>", { status: 503, headers: { "content-type": "text/html" } });
  await assert.rejects(readReportDownload(html, "csv"), /^Error: No se pudo generar la exportación\.$/);
  const wrongFormat = Response.json({ data: [] });
  await assert.rejects(readReportDownload(wrongFormat, "pdf"), /no contiene el archivo solicitado/);
});

test("downloads retain the filename and functional JSON error", async () => {
  const csv = new Response("moneda;total", { headers: {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="flujo.csv"',
  } });
  const download = await readReportDownload(csv, "csv");
  assert.equal(download.filename, "flujo.csv");
  assert.equal(await download.blob.text(), "moneda;total");
  await assert.rejects(readReportDownload(Response.json({ error: "Elegí un período válido" }, { status: 400 }), "csv"), /período válido/);
});
