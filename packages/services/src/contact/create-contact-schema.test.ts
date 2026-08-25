import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createContactSchema, updateContactSchema } from "@bloqer/validators";

describe("createContactSchema initialRole", () => {
  it("rejects a create payload without an explicit role", () => {
    const parsed = createContactSchema.safeParse({ legalName: "Ferretería La Tachuela" });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues.some((issue) => issue.path[0] === "initialRole"), true);
    }
  });

  it("does not coerce a missing role to CLIENT", () => {
    const parsed = createContactSchema.safeParse({ legalName: "Ferretería La Tachuela" });
    assert.equal(parsed.success, false);
  });

  it("keeps SUPPLIER when the caller selects it", () => {
    const parsed = createContactSchema.safeParse({
      legalName: "Ferretería La Tachuela",
      initialRole: "SUPPLIER",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.initialRole, "SUPPLIER");
  });
});

describe("contact optional blanks", () => {
  it("stores empty taxId as null so it does not occupy the unique CUIT slot", () => {
    const parsed = createContactSchema.safeParse({
      legalName: "Consumidor Final",
      initialRole: "CLIENT",
      taxId: "   ",
      email: "",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.taxId, null);
      assert.equal(parsed.data.email, null);
    }
  });

  it("trims CUIT on create", () => {
    const parsed = createContactSchema.safeParse({
      legalName: "ACME",
      initialRole: "SUPPLIER",
      taxId: " 30708673435 ",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.taxId, "30708673435");
  });

  it("clears taxId on update when the field is blank", () => {
    const parsed = updateContactSchema.safeParse({ legalName: "ACME", taxId: "" });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.taxId, null);
  });
});
