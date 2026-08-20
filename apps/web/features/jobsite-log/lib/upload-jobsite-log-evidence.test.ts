import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatJobsiteLogPartialUploadMessage,
  uploadJobsiteLogEvidence,
} from "./upload-jobsite-log-evidence";

function fakeFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

test("uploads all files and links JOBSITE_LOG + JOBSITE_EVIDENCE", async () => {
  const calls: FormData[] = [];
  const result = await uploadJobsiteLogEvidence({
    projectId: "proj-1",
    logId: "log-1",
    files: [fakeFile("a.jpg"), fakeFile("b.jpg")],
    upload: async (fd) => {
      calls.push(fd);
      return { documentId: `doc-${calls.length}` };
    },
  });

  assert.equal(result.uploaded, 2);
  assert.equal(result.failures.length, 0);
  assert.equal(calls[0]?.get("linkedEntityType"), "JOBSITE_LOG");
  assert.equal(calls[0]?.get("linkedEntityId"), "log-1");
  assert.equal(calls[0]?.get("category"), "JOBSITE_EVIDENCE");
  assert.equal(calls[1]?.get("linkedEntityId"), "log-1");
});

test("keeps successful uploads when a later file fails", async () => {
  const result = await uploadJobsiteLogEvidence({
    projectId: "proj-1",
    logId: "log-1",
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
    formatJobsiteLogPartialUploadMessage(result) ?? "",
    /Parte creado correctamente\. 1 foto no pudo subirse\./,
  );
});

test("retry uploads only the failed files", async () => {
  let attempts = 0;
  const retry = await uploadJobsiteLogEvidence({
    projectId: "proj-1",
    logId: "log-1",
    files: [fakeFile("bad.jpg")],
    upload: async () => {
      attempts += 1;
      return { documentId: "doc-retry" };
    },
  });
  assert.equal(attempts, 1);
  assert.equal(retry.uploaded, 1);
  assert.equal(retry.failures.length, 0);
  assert.equal(formatJobsiteLogPartialUploadMessage(retry), null);
});
