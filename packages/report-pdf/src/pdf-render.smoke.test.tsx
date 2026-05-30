import { Document, Page, Text } from "@react-pdf/renderer";
import test from "node:test";
import assert from "node:assert/strict";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";

test("renderReportPdfToBuffer produces a non-empty PDF buffer", async () => {
  const buffer = await renderReportPdfToBuffer(
    <Document>
      <Page size="A4">
        <Text>ok</Text>
      </Page>
    </Document>,
  );
  assert.ok(buffer.length > 100);
  assert.equal(buffer.subarray(0, 4).toString("utf8"), "%PDF");
});
