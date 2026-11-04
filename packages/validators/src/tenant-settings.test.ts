import assert from "node:assert/strict";
import { test } from "node:test";
import { updateTenantDisplaySettingsInputSchema } from "./tenant-settings";

const required = { name: "Organización de prueba", timezone: "America/Argentina/Buenos_Aires", baseCurrency: "ARS" };

test("clearing website or IVA sends an explicit null through the service validator", () => {
  for (const value of [null, "", "  "]) {
    const data = updateTenantDisplaySettingsInputSchema.parse({ ...required, website: value, ivaCondition: value });
    assert.equal(data.website, null);
    assert.equal(data.ivaCondition, null);
  }
});

test("omitted nullable settings remain unchanged; populated values are validated", () => {
  const omitted = updateTenantDisplaySettingsInputSchema.parse(required);
  assert.equal(omitted.website, undefined);
  assert.equal(omitted.ivaCondition, undefined);
  const populated = updateTenantDisplaySettingsInputSchema.parse({ ...required, website: "https://example.test", ivaCondition: "RESPONSIBLE_INSCRIPTO" });
  assert.equal(populated.website, "https://example.test");
  assert.equal(populated.ivaCondition, "RESPONSIBLE_INSCRIPTO");
  assert.equal(updateTenantDisplaySettingsInputSchema.safeParse({ ...required, website: "broken" }).success, false);
});
