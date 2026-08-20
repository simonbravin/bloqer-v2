import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { ServiceError } from "../types";
import { sha256Hex } from "../idempotency/idempotency";
import {
  UPLOAD_CONTENT_MISMATCH_MESSAGE,
  assertUploadContentMatchesDeclaredMime,
  declaredMimeMatchesSniffed,
  isByteSniffSkippedMime,
  sniffAllowedUploadMime,
} from "./sniff-upload-content";

const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 "),
  Buffer.from([0x0e, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00]),
]);

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

const HEIC_FTYP = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftyp"),
  Buffer.from("heic"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("mif1"),
  Buffer.from("heic"),
]);

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);

function expectMismatch(err: unknown): boolean {
  return (
    err instanceof ServiceError &&
    err.code === "VALIDATION" &&
    err.message === UPLOAD_CONTENT_MISMATCH_MESSAGE
  );
}

describe("sniff-upload-content", () => {
  it("accepts JPEG / PNG / WebP / PDF bytes with matching declared MIME", async () => {
    await assertUploadContentMatchesDeclaredMime(JPEG, "image/jpeg");
    await assertUploadContentMatchesDeclaredMime(PNG, "image/png");
    await assertUploadContentMatchesDeclaredMime(WEBP, "image/webp");
    await assertUploadContentMatchesDeclaredMime(PDF, "application/pdf");
  });

  it("accepts HEIC ftyp brands as image/heic or image/heif", async () => {
    const sniffed = await sniffAllowedUploadMime(HEIC_FTYP);
    assert.ok(sniffed === "image/heic" || sniffed === "image/heif", sniffed);
    await assertUploadContentMatchesDeclaredMime(HEIC_FTYP, "image/heic");
    await assertUploadContentMatchesDeclaredMime(HEIC_FTYP, "image/heif");
  });

  it("rejects declared JPEG whose bytes are PDF", async () => {
    await assert.rejects(() => assertUploadContentMatchesDeclaredMime(PDF, "image/jpeg"), expectMismatch);
  });

  it("rejects .jpg-shaped declared JPEG whose bytes are zip/unknown", async () => {
    await assert.rejects(() => assertUploadContentMatchesDeclaredMime(ZIP, "image/jpeg"), expectMismatch);
  });

  it("rejects empty files", async () => {
    await assert.rejects(
      () => assertUploadContentMatchesDeclaredMime(Buffer.alloc(0), "image/jpeg"),
      (err: unknown) =>
        err instanceof ServiceError && err.code === "VALIDATION" && err.message === "El archivo está vacío",
    );
  });

  it("does not sniff Office / CSV / TXT (zip-based or text)", () => {
    assert.equal(isByteSniffSkippedMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true);
    assert.equal(isByteSniffSkippedMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), true);
    assert.equal(isByteSniffSkippedMime("text/csv"), true);
    assert.equal(isByteSniffSkippedMime("text/plain"), true);
    assert.equal(isByteSniffSkippedMime("image/jpeg"), false);
  });

  it("treats HEIC/HEIF as the same family", () => {
    assert.equal(declaredMimeMatchesSniffed("image/heic", "image/heif"), true);
    assert.equal(declaredMimeMatchesSniffed("image/jpeg", "image/png"), false);
  });

  it("contentSha256 is of real bytes and is not a global deduper", () => {
    const a = sha256Hex(PNG);
    const b = sha256Hex(PNG);
    const c = sha256Hex(JPEG);
    assert.equal(a, b);
    assert.equal(a.length, 64);
    assert.notEqual(a, c);
    assert.equal(createHash("sha256").update(PNG).digest("hex"), a);
  });

  it("smoke: sniff + hash of ~2MB JPEG-like and ~10MB PDF-like stays well under 1s", async () => {
    const jpeg2mb = Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024 - JPEG.length, 0x00)]);
    const pdf10mb = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 - PDF.length, 0x20)]);
    const t0 = performance.now();
    await assertUploadContentMatchesDeclaredMime(jpeg2mb.subarray(0, JPEG.length + 4096), "image/jpeg");
    sha256Hex(jpeg2mb);
    const jpegMs = performance.now() - t0;
    const t1 = performance.now();
    await assertUploadContentMatchesDeclaredMime(pdf10mb.subarray(0, PDF.length + 4096), "application/pdf");
    sha256Hex(pdf10mb);
    const pdfMs = performance.now() - t1;
    assert.ok(jpegMs < 1000, `2MB JPEG hash/sniff took ${jpegMs.toFixed(0)}ms`);
    assert.ok(pdfMs < 2000, `10MB PDF hash/sniff took ${pdfMs.toFixed(0)}ms`);
  });
});
