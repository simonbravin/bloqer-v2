import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContentDispositionHeader } from "@bloqer/storage";

describe("buildContentDispositionHeader", () => {
  it("builds attachment with ASCII filename and RFC 5987 filename*", () => {
    const header = buildContentDispositionHeader("attachment", "factura.pdf");
    assert.equal(
      header,
      `attachment; filename="factura.pdf"; filename*=UTF-8''factura.pdf`,
    );
  });

  it("builds inline disposition for preview", () => {
    const header = buildContentDispositionHeader("inline", "plano.png");
    assert.match(header, /^inline;/);
    assert.match(header, /filename="plano\.png"/);
  });

  it("keeps extension and encodes UTF-8 names with accents", () => {
    const header = buildContentDispositionHeader("attachment", "Comprobante_ñandú.pdf");
    assert.match(header, /^attachment;/);
    assert.match(header, /filename="Comprobante_nandu\.pdf"/);
    assert.match(header, /filename\*=UTF-8''Comprobante_%C3%B1and%C3%BA\.pdf/);
  });

  it("strips path separators from the display name", () => {
    const header = buildContentDispositionHeader("attachment", "../../secret/doc.pdf");
    assert.match(header, /filename="doc\.pdf"/);
    assert.equal(header.includes("../"), false);
    assert.equal(header.includes("\\"), false);
  });

  it("neutralizes quotes and collapses separators in the ASCII filename", () => {
    const header = buildContentDispositionHeader("attachment", `informe "final".pdf`);
    assert.equal(header.includes('"final"'), false);
    assert.match(header, /filename="informe_final_\.pdf"/);
    assert.match(header, /filename\*=UTF-8''/);
  });

  it("strips semicolons that could inject Content-Disposition parameters", () => {
    const header = buildContentDispositionHeader(
      "attachment",
      'evil.pdf"; filename="hacked.pdf',
    );
    assert.equal(header.includes('filename="hacked'), false);
    assert.match(header, /^attachment; filename="/);
    assert.equal(header.includes("; filename=\"hacked"), false);
  });

  it("falls back when the name is empty after sanitization", () => {
    const header = buildContentDispositionHeader("attachment", "   ");
    assert.match(header, /filename="file"/);
  });
});
