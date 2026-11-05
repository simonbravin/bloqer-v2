import assert from "node:assert/strict";
import { it } from "node:test";
import { clientUploadDocument } from "./client-upload-document";

const input = {
  file: new File(["%PDF-1.7"], "prueba.pdf", { type: "application/pdf" }),
  projectId: "test-project",
  category: "OTHER",
  idempotencyKey: "test-idempotency-key",
};

it("uses a conditional PUT and confirms an existing upload after 412", async (t) => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (calls.length === 1) return Response.json({ documentId: "test-doc", uploadUrl: "https://storage.example.test/test-doc", storageConfigured: true, status: "UPLOADING" });
    if (calls.length === 2) return new Response(null, { status: 412 });
    return Response.json({ ok: true });
  });
  assert.deepEqual(await clientUploadDocument(input), { documentId: "test-doc", storageConfigured: true });
  assert.equal(new Headers(calls[1]?.init?.headers).get("If-None-Match"), "*");
  assert.deepEqual(calls[2], { path: "/api/documents/test-doc/confirm", init: { method: "POST" } });
});

it("does not report success for a pending attempt without a usable upload URL", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ documentId: "test-doc", storageConfigured: false, status: "UPLOADING" }));
  assert.ok("error" in await clientUploadDocument(input));
});
