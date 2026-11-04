import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  argentineTaxIdSchema, assignContactRoleSchema, updateClientProfileSchema,
  updateSubcontractorProfileSchema, updateSupplierProfileSchema,
} from "@bloqer/validators";

describe("AG-03 fiscal and profile input contracts", () => {
  it("canonicalizes formatted CUIT/CUIL and validates format without requiring a check digit", () => {
    for (const value of ["30708673435", "30-70867343-5", "30.70867343/5", "30 70867343 5"]) {
      assert.equal(argentineTaxIdSchema.parse(value), "30708673435");
    }
    assert.equal(argentineTaxIdSchema.parse("11111111111"), "11111111111");
    for (const value of ["123", "123456789012", "AB30708673435", "3070867343A"]) {
      assert.equal(argentineTaxIdSchema.safeParse(value).success, false);
    }
  });

  it("rounds nonnegative credit limits with half-up and accepts zero", () => {
    assert.equal(updateClientProfileSchema.parse({ creditLimit: "100.005" }).creditLimit, "100.01");
    assert.equal(assignContactRoleSchema.parse({ role: "CLIENT", creditLimit: "0" }).creditLimit, "0.00");
    assert.equal(updateClientProfileSchema.safeParse({ creditLimit: "-1" }).success, false);
    assert.equal(assignContactRoleSchema.safeParse({ role: "CLIENT", creditLimit: "-1" }).success, false);
  });

  it("clears optional client values and distinguishes omitted updates", () => {
    for (const value of [null, "", "   "]) {
      const data = updateClientProfileSchema.parse({ creditLimit: value, notes: value });
      assert.equal(data.creditLimit, null);
      assert.equal(data.notes, null);
    }
    assert.equal(updateClientProfileSchema.parse({}).creditLimit, undefined);
  });

  it("clears supplier and subcontractor values rather than retaining old strings", () => {
    const supplier = updateSupplierProfileSchema.parse({ bankAccount: "", notes: null });
    assert.equal(supplier.bankAccount, null);
    assert.equal(supplier.notes, null);
    const subcontractor = updateSubcontractorProfileSchema.parse({ specialty: " ", notes: "" });
    assert.equal(subcontractor.specialty, null);
    assert.equal(subcontractor.notes, null);
  });

  it("normalizes currency casing and enforces the existing three-letter format", () => {
    assert.equal(updateClientProfileSchema.parse({ defaultCurrency: " ars " }).defaultCurrency, "ARS");
    assert.equal(updateSupplierProfileSchema.parse({ defaultCurrency: "usd" }).defaultCurrency, "USD");
    assert.equal(updateClientProfileSchema.safeParse({ defaultCurrency: "12$" }).success, false);
  });
});
