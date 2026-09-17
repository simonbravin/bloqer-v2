import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessDocumentFile,
  canInlineImagePreview,
  canPreviewInBrowser,
  isImageLikeDocument,
  toDocumentGalleryItems,
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

  it("isImageLikeDocument excludes CAD image/* IANA types", () => {
    assert.equal(isImageLikeDocument("image/vnd.dwg", "plano.dwg"), false);
    assert.equal(isImageLikeDocument("image/vnd.dxf", "corte.dxf"), false);
    assert.equal(isImageLikeDocument("image/svg+xml", "a.svg"), false);
    assert.equal(canPreviewInBrowser("image/vnd.dwg", "plano.dwg"), false);
    assert.equal(canInlineImagePreview("image/vnd.dwg", "plano.dwg"), false);
  });

  it("canAccessDocumentFile only for R2 ACTIVE/ARCHIVED", () => {
    assert.equal(canAccessDocumentFile({ storageProvider: "R2", status: "ACTIVE" }), true);
    assert.equal(canAccessDocumentFile({ storageProvider: "R2", status: "ARCHIVED" }), true);
    assert.equal(canAccessDocumentFile({ storageProvider: "PLACEHOLDER", status: "ACTIVE" }), false);
    assert.equal(canAccessDocumentFile({ storageProvider: "R2", status: "UPLOADING" }), false);
  });

  it("toDocumentGalleryItems keeps jpeg/png/webp R2 files and drops PDF/HEIC/CAD/PLACEHOLDER", () => {
    const items = toDocumentGalleryItems([
      {
        id: "1",
        originalFileName: "a.jpg",
        mimeType: "image/jpeg",
        storageProvider: "R2",
        status: "ACTIVE",
      },
      {
        id: "2",
        originalFileName: "b.png",
        mimeType: "image/png",
        storageProvider: "R2",
        status: "ARCHIVED",
      },
      {
        id: "3",
        originalFileName: "c.webp",
        mimeType: "image/webp",
        storageProvider: "R2",
        status: "ACTIVE",
      },
      {
        id: "4",
        originalFileName: "d.pdf",
        mimeType: "application/pdf",
        storageProvider: "R2",
        status: "ACTIVE",
      },
      {
        id: "5",
        originalFileName: "e.heic",
        mimeType: "image/heic",
        storageProvider: "R2",
        status: "ACTIVE",
      },
      {
        id: "6",
        originalFileName: "f.dwg",
        mimeType: "image/vnd.dwg",
        storageProvider: "R2",
        status: "ACTIVE",
      },
      {
        id: "7",
        originalFileName: "g.jpg",
        mimeType: "image/jpeg",
        storageProvider: "PLACEHOLDER",
        status: "ACTIVE",
      },
      {
        id: "8",
        originalFileName: "h.jpg",
        mimeType: "image/jpeg",
        storageProvider: "R2",
        status: "UPLOADING",
      },
    ]);
    assert.deepEqual(items, [
      { id: "1", fileName: "a.jpg" },
      { id: "2", fileName: "b.png" },
      { id: "3", fileName: "c.webp" },
    ]);
  });
});
