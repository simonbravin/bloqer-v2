import assert from "node:assert/strict";
import { it } from "node:test";
import { clientConfirmDocumentUpload, clientUploadDocument } from "./client-upload-document";

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

for (const storageConfigured of [false, undefined]) {
  it(`does not discard a selected file after metadata-only success (${storageConfigured})`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({ documentId: "legacy-doc", storageConfigured, status: "ACTIVE" }));
    assert.ok("error" in await clientUploadDocument(input));
  });
}

it("accepts an already confirmed R2 replay without uploading a second object", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ documentId: "stored-doc", storageConfigured: true, status: "ACTIVE" }));
  assert.deepEqual(await clientUploadDocument(input), { documentId: "stored-doc", storageConfigured: true });
  assert.equal(fetch.mock.callCount(), 1);
});

it("retains the predecessor identity when initiating a revision", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ documentId: "stored-doc", storageConfigured: true, status: "ACTIVE" }));
  await clientUploadDocument({ ...input, replacesAttachmentId: "previous-document" });
  const init = fetch.mock.calls[0]!.arguments[1] as RequestInit;
  assert.equal(JSON.parse(init.body as string).replacesAttachmentId, "previous-document");
});

it("keeps the file pending when confirmation fails", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) return Response.json({ documentId: "test-doc", uploadUrl: "https://storage.example.test/test-doc", storageConfigured: true, status: "UPLOADING" });
    if (calls === 2) return new Response(null, { status: 200 });
    return Response.json({ error: "No se confirmó" }, { status: 409 });
  });
  assert.deepEqual(await clientUploadDocument(input), { error: "No se confirmó" });
});

it("recovers a lost confirmation response by confirming the same document without another upload", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (path: string) => {
    calls.push(path);
    if (calls.length === 1) throw new TypeError("Connection interrupted");
    return Response.json({ ok: true });
  });
  assert.ok("error" in await clientConfirmDocumentUpload("pending-doc"));
  assert.deepEqual(await clientConfirmDocumentUpload("pending-doc"), { documentId: "pending-doc", storageConfigured: true });
  assert.deepEqual(calls, ["/api/documents/pending-doc/confirm", "/api/documents/pending-doc/confirm"]);
});

for (const status of [401, 403, 404, 409, 500]) {
  it(`does not report confirmation success for HTTP ${status}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({ error: "No se confirmó" }, { status }));
    assert.deepEqual(await clientConfirmDocumentUpload("pending-doc"), { error: "No se confirmó" });
  });
}

for (const body of ["not JSON", "null", "{}", '{"ok":false}']) {
  it(`does not discard a file after an invalid confirmation response: ${body}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(body, { status: 200 }));
    assert.ok("error" in await clientConfirmDocumentUpload("pending-doc"));
  });
}
