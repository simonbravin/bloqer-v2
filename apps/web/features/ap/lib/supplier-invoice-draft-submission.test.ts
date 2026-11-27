import assert from "node:assert/strict";
import { test } from "node:test";
import { submitSupplierInvoiceDraft } from "./supplier-invoice-draft-submission";

test("an attachment retry keeps the confirmed draft and does not create another invoice", async () => {
  let creates = 0;
  let knownId: string | null = null;
  const ids: string[] = [];
  const create = async () => { creates += 1; return { id: "draft-1" }; };
  const first = await submitSupplierInvoiceDraft({
    knownInvoiceId: knownId, create, onCreated: (id) => { knownId = id; },
    upload: async (id) => { ids.push(id); assert.equal(knownId, id); return { error: "R2 offline" }; },
  });
  assert.equal(first.kind, "attachment_failed");
  const retry = await submitSupplierInvoiceDraft({
    knownInvoiceId: knownId, create, onCreated: () => assert.fail("already created"),
    upload: async (id) => { ids.push(id); return { documentId: "doc-1" }; },
  });
  assert.deepEqual(retry, { kind: "saved", invoiceId: "draft-1" });
  assert.equal(creates, 1);
  assert.deepEqual(ids, ["draft-1", "draft-1"]);
});

test("a lost creation response is uncertain and never tries an attachment or another creation", async () => {
  let calls = 0;
  const result = await submitSupplierInvoiceDraft({
    knownInvoiceId: null,
    create: async () => { calls += 1; throw new Error("response lost"); },
    onCreated: () => assert.fail("no confirmed id"),
    upload: async () => assert.fail("no confirmed id"),
  });
  assert.equal(result.kind, "uncertain");
  assert.equal(calls, 1);
});

test("a service rejection does not upload or report a saved draft", async () => {
  const result = await submitSupplierInvoiceDraft({
    knownInvoiceId: null,
    create: async () => ({ error: "Obra cerrada" }),
    onCreated: () => assert.fail("rejected"), upload: async () => assert.fail("rejected"),
  });
  assert.deepEqual(result, { kind: "rejected", error: "Obra cerrada" });
});

test("a thrown upload preserves the successful invoice id for recovery", async () => {
  let remembered: string | null = null;
  const result = await submitSupplierInvoiceDraft({
    knownInvoiceId: null, create: async () => ({ id: "draft-2" }),
    onCreated: (id) => { remembered = id; },
    upload: async () => { throw new Error("timeout"); },
  });
  assert.equal(result.kind, "attachment_failed");
  assert.equal(remembered, "draft-2");
});

test("a document metadata row without configured storage is not a preserved original", async () => {
  const result = await submitSupplierInvoiceDraft({
    knownInvoiceId: "draft-3", create: async () => assert.fail("already created"),
    onCreated: () => assert.fail("already created"),
    upload: async () => ({ documentId: "metadata-only", storageConfigured: false }),
  });
  assert.equal(result.kind, "attachment_failed");
  assert.equal("invoiceId" in result && result.invoiceId, "draft-3");
});
