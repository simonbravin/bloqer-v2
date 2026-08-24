import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessDocumentFile,
  canInlineImagePreview,
  canPreviewInBrowser,
  isImageLikeDocument,
} from "./document-file-utils";

describe("document-file-utils", () => {
  it("canInlineImagePreview trusts MIME over a misleading extension", () => {
    assert.equal(canInlineImagePreview("application/pdf", "scan.png"), false);
    assert.equal(canInlineImagePreview("image/jpeg", "scan.pdf"), true);
    assert.equal(canInlineImagePreview("image/heic", "foto.heic"), false);
  });

  it("canPreviewInBrowser allows PDF and HEIC; rejects Office MIME", () => {
    assert.equal(canPreviewInBrowser("application/pdf", "a.pdf"), true);
    assert.equal(canPreviewInBrowser("image/heic", "a.heic"), true);
    assert.equal(
      canPreviewInBrowser(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "a.docx",
      ),
      false,
    );
  });

  it("isImageLikeDocument covers HEIC for thumbnails", () => {
    assert.equal(isImageLikeDocument("image/heic", "x.heic"), true);
    assert.equal(isImageLikeDocument("application/pdf", "x.pdf"), false);
  });

  it("canAccessDocumentFile only for R2 ACTIVE/ARCHIVED", () => {
    assert.equal(canAccessDocumentFile({ storageProvider: "R2", status: "ACTIVE" }), true);
    assert.equal(canAccessDocumentFile({ storageProvider: "R2", status: "ARCHIVED" }), true);
    assert.equal(canAccessDocumentFile({ storageProvider: "PLACEHOLDER", status: "ACTIVE" }), false);
    assert.equal(canAccessDocumentFile({ storageProvider: "R2", status: "UPLOADING" }), false);
  });
});
