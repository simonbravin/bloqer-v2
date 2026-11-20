import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSupplierInvoiceDraftCreation } from "./supplier-invoice-draft-creation";
import { submitSupplierInvoiceDraft } from "./supplier-invoice-draft-submission";

test("a confirmed draft survives failed cache invalidation and still receives its original", async (context) => {
  const warnings: unknown[][] = [];
  context.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  let creations = 0;
  let remembered: string | null = null;
  const result = await submitSupplierInvoiceDraft({
    knownInvoiceId: null,
    create: () => resolveSupplierInvoiceDraftCreation({
      create: async () => { creations += 1; return { id: "confirmed-draft" }; },
      revalidate: (id) => { assert.equal(id, "confirmed-draft"); throw new Error("sensitive payload"); },
      rejectionMessage: () => assert.fail("already confirmed"),
    }),
    onCreated: (id) => { remembered = id; },
    upload: async (id) => { assert.equal(id, remembered); return { documentId: "original", storageConfigured: true }; },
  });
  assert.deepEqual(result, { kind: "saved", invoiceId: "confirmed-draft" });
  assert.equal(creations, 1);
  assert.deepEqual(warnings, [["[supplier-invoice-draft] Cache revalidation failed after confirmed creation."]]);
});

test("an unknown creation outcome never invalidates paths and marks the form uncertain", async () => {
  let creations = 0;
  const result = await submitSupplierInvoiceDraft({
    knownInvoiceId: null,
    create: () => resolveSupplierInvoiceDraftCreation({
      create: async () => { creations += 1; throw new Error("lost commit acknowledgement"); },
      revalidate: () => assert.fail("no confirmed id"),
      rejectionMessage: () => null,
    }),
    onCreated: () => assert.fail("no confirmed id"),
    upload: async () => assert.fail("no confirmed id"),
  });
  assert.equal(result.kind, "uncertain");
  assert.equal(creations, 1);
  assert.equal(result.error.includes("lost commit acknowledgement"), false);
});

test("a known rejection remains recoverable without invalidating paths", async () => {
  const failure = new Error("Obra cerrada");
  const result = await resolveSupplierInvoiceDraftCreation({
    create: async () => { throw failure; },
    revalidate: () => assert.fail("rejected"),
    rejectionMessage: (error) => error === failure ? failure.message : null,
  });
  assert.deepEqual(result, { error: "Obra cerrada" });
});
