import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCertificationSchema,
  updateCertificationSchema,
  addCertificationLineSchema,
  updateCertificationLineSchema,
} from "./certification";
const id = "b1a00000-0000-4000-8000-000000000050";
test("certification periods are real calendar dates in ISO day format", () => {
  for (const date of ["2026-02-30", "2026-13-01", "2026-01-01T00:00:00Z", ""]) {
    assert.equal(
      createCertificationSchema.safeParse({
        projectId: id,
        budgetId: id,
        periodStart: date,
        periodEnd: "2026-12-31",
      }).success,
      false,
    );
    assert.equal(updateCertificationSchema.safeParse({ periodEnd: date }).success, false);
  }
  assert.equal(
    createCertificationSchema.safeParse({
      projectId: id,
      budgetId: id,
      periodStart: "2028-02-29",
      periodEnd: "2028-03-01",
    }).success,
    true,
  );
});
test("certification rejects negative and nonfinite quantities and physical percentages", () => {
  for (const currentQty of [-1, NaN, Infinity, -Infinity]) {
    assert.equal(
      addCertificationLineSchema.safeParse({
        certificationId: id,
        wbsNodeId: id,
        physicalPct: 0,
        currentQty,
      }).success,
      false,
    );
    assert.equal(updateCertificationLineSchema.safeParse({ currentQty }).success, false);
  }
  for (const physicalPct of [-1, 100.0001, NaN, Infinity])
    assert.equal(updateCertificationLineSchema.safeParse({ physicalPct }).success, false);
});
test("nullable certification notes can explicitly clear stored values", () => {
  assert.deepEqual(updateCertificationSchema.parse({ notes: null, internalNotes: "" }), {
    notes: null,
    internalNotes: "",
  });
  assert.deepEqual(updateCertificationLineSchema.parse({ notes: null }), { notes: null });
});
