import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPartialEntityUploadMessage,
  uploadPendingEntityEvidence,
} from "./upload-pending-entity-evidence";

function fakeFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

test("uploads all files and links the given entity type", async () => {
  const calls: FormData[] = [];
  const result = await uploadPendingEntityEvidence({
    projectId: "proj-1",
    entityId: "pr-1",
    linkedEntityType: "PURCHASE_REQUEST",
    category: "OTHER",
    afterUploadPath: "/proyectos/proj-1/solicitudes-compra/pr-1",
    files: [fakeFile("a.jpg"), fakeFile("b.jpg")],
    upload: async (fd) => {
      calls.push(fd);
      return { documentId: `doc-${calls.length}` };
    },
  });

  assert.equal(result.uploaded, 2);
  assert.equal(result.failures.length, 0);
  assert.equal(calls[0]?.get("linkedEntityType"), "PURCHASE_REQUEST");
  assert.equal(calls[0]?.get("linkedEntityId"), "pr-1");
  assert.equal(calls[0]?.get("category"), "OTHER");
  assert.match(String(calls[0]?.get("idempotencyKey")), /^[0-9a-f-]{36}$/i);
  assert.notEqual(calls[0]?.get("idempotencyKey"), calls[1]?.get("idempotencyKey"));
  assert.equal(calls[1]?.get("linkedEntityId"), "pr-1");
});

test("appends clientId as idempotencyKey when provided", async () => {
  const calls: FormData[] = [];
  const clientId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await uploadPendingEntityEvidence({
    projectId: "proj-1",
    entityId: "log-1",
    linkedEntityType: "JOBSITE_LOG",
    category: "JOBSITE_EVIDENCE",
    afterUploadPath: "/l",
    files: [{ file: fakeFile("a.jpg"), clientId }],
    upload: async (fd) => {
      calls.push(fd);
      return { documentId: "doc-1" };
    },
  });
  assert.equal(calls[0]?.get("idempotencyKey"), clientId);
});

test("keeps successful uploads when a later file fails", async () => {
  const result = await uploadPendingEntityEvidence({
    projectId: "proj-1",
    entityId: "rcpt-1",
    linkedEntityType: "PURCHASE_RECEIPT",
    category: "RECEIPT",
    afterUploadPath: "/r",
    files: [fakeFile("ok.jpg"), fakeFile("bad.jpg"), fakeFile("later.jpg")],
    upload: async (fd) => {
      const file = fd.get("file");
      const name = file instanceof File ? file.name : "";
      if (name === "bad.jpg") return { error: "storage timeout" };
      return { documentId: name };
    },
  });

  assert.equal(result.uploaded, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.fileName, "bad.jpg");
  assert.equal(result.failures[0]?.index, 1);
  assert.match(
    formatPartialEntityUploadMessage({
      createdLabel: "Solicitud creada correctamente",
      itemNounSingular: "archivo",
      itemNounPlural: "archivos",
      result,
    }) ?? "",
    /Solicitud creada correctamente\. 1 archivo no pudo subirse\./,
  );
});

test("retry uploads only the failed files", async () => {
  let attempts = 0;
  const retry = await uploadPendingEntityEvidence({
    projectId: "proj-1",
    entityId: "log-1",
    linkedEntityType: "JOBSITE_LOG",
    category: "JOBSITE_EVIDENCE",
    afterUploadPath: "/l",
    files: [fakeFile("bad.jpg")],
    upload: async () => {
      attempts += 1;
      return { documentId: "doc-retry" };
    },
  });
  assert.equal(attempts, 1);
  assert.equal(retry.uploaded, 1);
  assert.equal(retry.failures.length, 0);
  assert.equal(
    formatPartialEntityUploadMessage({
      createdLabel: "Parte creado correctamente",
      itemNounSingular: "foto",
      itemNounPlural: "fotos",
      result: retry,
    }),
    null,
  );
});
