import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPurchaseRequestSchema,
  updatePurchaseRequestSchema,
} from "@bloqer/validators";

/**
 * [D-096] · [BR-PUR-017] — required on create, preserved when omitted on edit.
 */

const baseCreatePayload = {
  projectId: "11111111-1111-1111-1111-111111111111",
  notes: null,
  lines: [
    {
      wbsNodeId: "22222222-2222-2222-2222-222222222222",
      description: "Cemento",
      unit: "bolsa",
      quantity: "10.0000",
      lineType: "MATERIAL",
      sortOrder: 0,
    },
  ],
};

describe("createPurchaseRequestSchema neededByDate", () => {
  it("rejects a payload without neededByDate", () => {
    const parsed = createPurchaseRequestSchema.safeParse(baseCreatePayload);
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(
        parsed.error.issues.some((issue) => issue.path[0] === "neededByDate"),
        true,
      );
    }
  });

  it("rejects an empty string", () => {
    const parsed = createPurchaseRequestSchema.safeParse({
      ...baseCreatePayload,
      neededByDate: "",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a non ISO YYYY-MM-DD string", () => {
    const parsed = createPurchaseRequestSchema.safeParse({
      ...baseCreatePayload,
      neededByDate: "28/08/2026",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects null", () => {
    const parsed = createPurchaseRequestSchema.safeParse({
      ...baseCreatePayload,
      neededByDate: null,
    });
    assert.equal(parsed.success, false);
  });

  it("accepts a valid YYYY-MM-DD string", () => {
    const parsed = createPurchaseRequestSchema.safeParse({
      ...baseCreatePayload,
      neededByDate: "2026-09-15",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.neededByDate, "2026-09-15");
    }
  });

  it("rejects impossible calendar dates instead of rolling into another day", () => {
    for (const neededByDate of ["2026-02-29", "2026-04-31", "2026-13-01"]) {
      assert.equal(createPurchaseRequestSchema.safeParse({ ...baseCreatePayload, neededByDate }).success, false);
    }
    assert.equal(createPurchaseRequestSchema.safeParse({ ...baseCreatePayload, neededByDate: "2024-02-29" }).success, true);
  });
});

const baseUpdatePayload = {
  neededByDate: "2026-09-15",
  notes: "recordatorio",
  lines: baseCreatePayload.lines,
};

describe("updatePurchaseRequestSchema", () => {
  it("allows header-only changes and preserves the existing date under D-096/D-126", () => {
    assert.equal(updatePurchaseRequestSchema.safeParse({ notes: "x" }).success, true);
    assert.equal(updatePurchaseRequestSchema.safeParse({ lines: baseCreatePayload.lines }).success, true);
    assert.equal(
      updatePurchaseRequestSchema.safeParse({ neededByDate: "2026-09-15", lines: [] }).success,
      false,
    );
  });

  it("accepts a full draft update payload", () => {
    const parsed = updatePurchaseRequestSchema.safeParse(baseUpdatePayload);
    assert.equal(parsed.success, true);
  });

  it("rejects invalid neededByDate format", () => {
    const parsed = updatePurchaseRequestSchema.safeParse({
      ...baseUpdatePayload,
      neededByDate: "not-a-date",
    });
    assert.equal(parsed.success, false);
  });
});
