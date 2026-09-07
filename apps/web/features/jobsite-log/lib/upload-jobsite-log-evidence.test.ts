import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPartialEntityUploadMessage } from "../../documents/lib/pending-entity-evidence-messages";

function formatJobsiteLogPartialUploadMessage(
  result: Parameters<typeof formatPartialEntityUploadMessage>[0]["result"],
): string | null {
  return formatPartialEntityUploadMessage({
    createdLabel: "Parte creado correctamente",
    itemNounSingular: "foto",
    itemNounPlural: "fotos",
    result,
  });
}

test("formatJobsiteLogPartialUploadMessage for one failure", () => {
  assert.match(
    formatJobsiteLogPartialUploadMessage({
      uploaded: 1,
      failures: [{ index: 1, fileName: "bad.jpg", error: "storage timeout" }],
    }) ?? "",
    /Parte creado correctamente\. 1 foto no pudo subirse\./,
  );
});

test("formatJobsiteLogPartialUploadMessage null when no failures", () => {
  assert.equal(
    formatJobsiteLogPartialUploadMessage({ uploaded: 1, failures: [] }),
    null,
  );
});
