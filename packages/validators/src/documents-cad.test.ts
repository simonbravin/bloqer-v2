import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOCUMENT_FILE_INPUT_ACCEPT,
  isInlineDocumentPreviewMime,
  resolveAllowedMimeType,
} from "./documents";

describe("resolveAllowedMimeType CAD", () => {
  it("maps .dwg / .dxf even when browser sends octet-stream or empty", () => {
    assert.equal(resolveAllowedMimeType("plano.dwg", "application/octet-stream"), "image/vnd.dwg");
    assert.equal(resolveAllowedMimeType("corte.DXF", ""), "image/vnd.dxf");
    assert.equal(resolveAllowedMimeType("detalle.dxf", null), "image/vnd.dxf");
  });

  it("prefers extension over a non-allowlisted browser MIME for CAD", () => {
    assert.equal(resolveAllowedMimeType("a.dwg", "application/acad"), "image/vnd.dwg");
  });

  it("rejects unknown CAD-like extensions", () => {
    assert.equal(resolveAllowedMimeType("modelo.rvt", "application/octet-stream"), null);
  });

  it("includes .dwg/.dxf in file input accept", () => {
    assert.match(DOCUMENT_FILE_INPUT_ACCEPT, /\.dwg/);
    assert.match(DOCUMENT_FILE_INPUT_ACCEPT, /\.dxf/);
    assert.match(DOCUMENT_FILE_INPUT_ACCEPT, /image\/vnd\.dwg/);
  });

  it("does not treat CAD as inline-previewable", () => {
    assert.equal(isInlineDocumentPreviewMime("image/vnd.dwg"), false);
    assert.equal(isInlineDocumentPreviewMime("image/vnd.dxf"), false);
    assert.equal(isInlineDocumentPreviewMime("application/pdf"), true);
    assert.equal(isInlineDocumentPreviewMime("image/jpeg"), true);
  });
});
