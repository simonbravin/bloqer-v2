import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPartialEntityUploadMessage } from "./pending-entity-evidence-messages";

test("formatPartialEntityUploadMessage for one failure", () => {
  const msg = formatPartialEntityUploadMessage({
    createdLabel: "Solicitud creada correctamente",
    itemNounSingular: "archivo",
    itemNounPlural: "archivos",
    result: {
      uploaded: 1,
      failures: [{ index: 1, fileName: "bad.jpg", error: "storage timeout" }],
    },
  });
  assert.match(msg ?? "", /Solicitud creada correctamente\. 1 archivo no pudo subirse\./);
});

test("formatPartialEntityUploadMessage null when no failures", () => {
  assert.equal(
    formatPartialEntityUploadMessage({
      createdLabel: "Parte creado correctamente",
      itemNounSingular: "foto",
      itemNounPlural: "fotos",
      result: { uploaded: 1, failures: [] },
    }),
    null,
  );
});
