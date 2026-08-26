import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyProgressWbsSelection,
  fillProgressQuantity,
  isBlankProgressLine,
  isValidProgressLine,
  prepareMaterialLinesForSubmit,
  prepareProgressLinesForSubmit,
  progressLinesSubmitError,
  suggestedQuantityFromPct,
  type JobsiteLogProgressDraft,
} from "./jobsite-log-form-lines";

const blank: JobsiteLogProgressDraft = {
  wbsNodeId: "__none__",
  description: "",
  quantityCompleted: "",
  physicalPct: "",
  notes: "",
};

test("blank draft rows are dropped; partida + % without qty is not valid", () => {
  assert.equal(isBlankProgressLine(blank), true);
  assert.equal(isValidProgressLine(blank), false);

  const started: JobsiteLogProgressDraft = {
    ...blank,
    wbsNodeId: "11111111-1111-4111-8111-111111111111",
    physicalPct: "100.00",
  };
  assert.equal(isBlankProgressLine(started), false);
  assert.equal(isValidProgressLine(started), false);
  assert.ok(progressLinesSubmitError([started])?.includes("cantidad"));
});

test("suggested qty from budget × % fills a saveable line", () => {
  assert.equal(suggestedQuantityFromPct("1.0000", "100.00"), "1.0000");
  assert.equal(suggestedQuantityFromPct("50", "10"), "5.0000");

  const filled = fillProgressQuantity(
    {
      ...blank,
      wbsNodeId: "11111111-1111-4111-8111-111111111111",
      physicalPct: "100.00",
    },
    "1.0000",
  );
  assert.equal(filled.quantityCompleted, "1.0000");
  assert.equal(isValidProgressLine(filled), true);
  assert.equal(progressLinesSubmitError([filled]), null);
});

test("does not overwrite a quantity the user already typed", () => {
  const kept = fillProgressQuantity(
    {
      ...blank,
      wbsNodeId: "11111111-1111-4111-8111-111111111111",
      quantityCompleted: "0.25",
      physicalPct: "100.00",
    },
    "1.0000",
  );
  assert.equal(kept.quantityCompleted, "0.25");
});

test("prepareProgressLinesForSubmit: selecting a gl partida with 100% yields a persistable payload", () => {
  const wbsId = "68cfe714-d11e-4bd1-b86f-6fff4923ad3c";
  const prepared = prepareProgressLinesForSubmit(
    [
      blank,
      {
        ...blank,
        wbsNodeId: wbsId,
        description: "1.1 — Replanteo de Obra",
        physicalPct: "100.00",
      },
    ],
    [{ id: wbsId, budgetQty: "1.0000" }],
  );
  assert.equal("payload" in prepared, true);
  if (!("payload" in prepared)) return;
  assert.equal(prepared.payload.length, 1);
  assert.equal(prepared.payload[0]?.wbsNodeId, wbsId);
  assert.equal(prepared.payload[0]?.quantityCompleted, "1.0000");
  assert.equal(prepared.payload[0]?.physicalPct, "100.00");
  assert.equal(prepared.payload[0]?.sortOrder, 0);
});

test("prepareProgressLinesForSubmit: partida without qty or budget is an error, not a silent drop", () => {
  const prepared = prepareProgressLinesForSubmit(
    [
      {
        ...blank,
        wbsNodeId: "11111111-1111-4111-8111-111111111111",
        physicalPct: "10.00",
      },
    ],
    [],
  );
  assert.equal("error" in prepared, true);
});

test("applyProgressWbsSelection replaces qty when the partida changes", () => {
  const next = applyProgressWbsSelection(
    {
      ...blank,
      wbsNodeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      quantityCompleted: "1.0000",
      physicalPct: "100.00",
      description: "vieja",
    },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", code: "2.1", name: "Muros", budgetQty: "50" },
    "10.00",
  );
  assert.equal(next.wbsNodeId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  assert.equal(next.physicalPct, "10.00");
  assert.equal(next.quantityCompleted, "5.0000");
  assert.equal(next.description, "vieja");
});

test("prepareMaterialLinesForSubmit does not silently drop a started row", () => {
  const incomplete = prepareMaterialLinesForSubmit([
    {
      productId: "__none__",
      warehouseId: "__none__",
      description: "Cal",
      quantity: "",
      notes: "",
    },
  ]);
  assert.equal("error" in incomplete, true);

  const ok = prepareMaterialLinesForSubmit([
    {
      productId: "__none__",
      warehouseId: "__none__",
      description: "",
      quantity: "",
      notes: "",
    },
    {
      productId: "11111111-1111-4111-8111-111111111111",
      warehouseId: "__none__",
      description: "Cal hidratada",
      quantity: "2.50",
      notes: "",
    },
  ]);
  assert.equal("payload" in ok, true);
  if (!("payload" in ok)) return;
  assert.equal(ok.payload.length, 1);
  assert.equal(ok.payload[0]?.quantity, "2.50");
  assert.equal(ok.payload[0]?.productId, "11111111-1111-4111-8111-111111111111");
});
