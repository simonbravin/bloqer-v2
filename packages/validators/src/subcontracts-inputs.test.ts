import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSubcontractSchema,
  updateSubcontractSchema,
  updateSubcontractMetaSchema,
  createSubcontractCertificationSchema,
  updateSubcontractCertificationSchema,
  cancelSubcontractSchema,
} from "./subcontracts";

const id = "11111111-1111-4111-8111-111111111111";
const contract = () => ({
  companyId: id,
  projectId: id,
  subcontractorContactId: id,
  title: "Synthetic subcontract",
  contractDate: "2026-11-05",
  lines: [{ description: "Synthetic work", quantity: "1.23456", unitPrice: "1.255", unit: "kg" }],
});
const certificate = () => ({
  subcontractId: id,
  periodStart: "2026-11-01",
  periodEnd: "2026-11-05",
  certificationDate: "2026-11-05",
  lines: [{ subcontractLineId: id, currentQty: "1.23456" }],
});

describe("AG08 subcontract input contracts", () => {
  it("preserves canonical decimal prices and normalizes quantities and prices to four decimals", () => {
    const saved = createSubcontractSchema.parse(contract());
    assert.equal(saved.lines[0]!.quantity, "1.2346");
    assert.equal(saved.lines[0]!.unitPrice, "1.2550");
    assert.equal(
      createSubcontractSchema.parse({
        ...contract(),
        lines: [{ ...contract().lines[0]!, unitPrice: "0" }],
      }).lines[0]!.unitPrice,
      "0.0000",
    );
    assert.equal(
      createSubcontractCertificationSchema.parse(certificate()).lines[0]!.currentQty,
      "1.2346",
    );
  });
  it("rejects zero rounded quantity, nonfinite values, negatives and numeric storage overflow", () => {
    for (const quantity of ["0", "0.00001", "-1", "NaN", "Infinity", "1e6", "100000000000000"])
      assert.equal(
        createSubcontractSchema.safeParse({
          ...contract(),
          lines: [{ ...contract().lines[0]!, quantity }],
        }).success,
        false,
        quantity,
      );
    for (const unitPrice of ["-1", "NaN", "Infinity", "100000000000000"])
      assert.equal(
        createSubcontractSchema.safeParse({
          ...contract(),
          lines: [{ ...contract().lines[0]!, unitPrice }],
        }).success,
        false,
        unitPrice,
      );
  });
  it("validates real calendar dates and ordered ranges without changing optional clear semantics", () => {
    assert.equal(
      createSubcontractSchema.safeParse({ ...contract(), contractDate: "2026-02-30" }).success,
      false,
    );
    assert.equal(
      createSubcontractSchema.safeParse({
        ...contract(),
        startDate: "2026-11-06",
        expectedEndDate: "2026-11-05",
      }).success,
      false,
    );
    assert.equal(
      createSubcontractCertificationSchema.safeParse({ ...certificate(), periodEnd: "2026-10-31" })
        .success,
      false,
    );
    assert.equal(
      updateSubcontractCertificationSchema.safeParse({ certificationDate: "2026-02-30" }).success,
      false,
    );
    assert.deepEqual(
      updateSubcontractMetaSchema.parse({ startDate: "", expectedEndDate: null, notes: null }),
      { startDate: null, expectedEndDate: null, notes: null },
    );
    assert.deepEqual(updateSubcontractMetaSchema.parse({ notes: "Only this field" }), {
      notes: "Only this field",
    });
  });
  it("accepts explicit ISO currency codes without inventing a restricted ARS/USD catalogue", () => {
    assert.equal(
      createSubcontractSchema.parse({ ...contract(), currency: " EUR " }).currency,
      "EUR",
    );
    assert.equal(
      createSubcontractSchema.safeParse({ ...contract(), currency: "US" }).success,
      false,
    );
    assert.equal(
      createSubcontractSchema.safeParse({ ...contract(), currency: "pesos" }).success,
      false,
    );
  });
  it("rejects duplicate certification line identities before effects or snapshots can be duplicated", () => {
    const lines = [...certificate().lines, { subcontractLineId: id, currentQty: "2" }];
    assert.equal(
      createSubcontractCertificationSchema.safeParse({ ...certificate(), lines }).success,
      false,
    );
    assert.equal(updateSubcontractCertificationSchema.safeParse({ lines }).success, false);
  });
  it("rejects empty content replacements and blank titles or descriptions", () => {
    assert.equal(updateSubcontractSchema.safeParse({ lines: [] }).success, false);
    assert.equal(updateSubcontractCertificationSchema.safeParse({ lines: [] }).success, false);
    assert.equal(createSubcontractSchema.safeParse({ ...contract(), title: "   " }).success, false);
    assert.equal(
      createSubcontractSchema.safeParse({
        ...contract(),
        lines: [{ ...contract().lines[0]!, description: " " }],
      }).success,
      false,
    );
  });
  it("normalizes optional cancellation reasons while the service decides requiredness from state", () => {
    assert.deepEqual(cancelSubcontractSchema.parse({}), {});
    assert.equal(
      cancelSubcontractSchema.parse({ reason: "  Synthetic correction  " }).reason,
      "Synthetic correction",
    );
    assert.equal(cancelSubcontractSchema.safeParse({ reason: "x".repeat(2001) }).success, false);
  });
});
