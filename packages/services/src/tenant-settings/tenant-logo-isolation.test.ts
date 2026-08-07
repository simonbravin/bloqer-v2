import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertTenantLogoStorageKey,
  assertTenantScopedStorageKey,
  buildTenantLogoStorageKey,
  isTenantLogoStorageKey,
  isTenantScopedStorageKey,
} from "@bloqer/storage";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

test("buildTenantLogoStorageKey is always under tenantId/branding/logo/", () => {
  const key = buildTenantLogoStorageKey(TENANT_A, "png");
  assert.ok(key.startsWith(`${TENANT_A}/branding/logo/`));
  assert.ok(key.endsWith(".png"));
  assert.equal(isTenantScopedStorageKey(TENANT_A, key), true);
  assert.equal(isTenantLogoStorageKey(TENANT_A, key), true);
  assert.equal(isTenantScopedStorageKey(TENANT_B, key), false);
  assert.equal(isTenantLogoStorageKey(TENANT_B, key), false);
});

test("assertTenantLogoStorageKey rejects non-branding keys under same tenant", () => {
  assert.throws(
    () => assertTenantLogoStorageKey(TENANT_A, `${TENANT_A}/global/doc/file.png`),
    /branding logo/,
  );
});

test("assertTenantScopedStorageKey accepts matching tenant prefix", () => {
  assert.doesNotThrow(() =>
    assertTenantScopedStorageKey(TENANT_A, `${TENANT_A}/branding/logo/abc.png`),
  );
});

test("assertTenantScopedStorageKey rejects foreign tenant key (no cross-tenant logo leak)", () => {
  assert.throws(
    () => assertTenantScopedStorageKey(TENANT_B, `${TENANT_A}/branding/logo/abc.png`),
    /not scoped/,
  );
  assert.throws(
    () => assertTenantLogoStorageKey(TENANT_B, `${TENANT_A}/branding/logo/abc.png`),
    /branding logo/,
  );
});

test("assertTenantScopedStorageKey rejects empty or unscoped keys", () => {
  assert.throws(() => assertTenantScopedStorageKey(TENANT_A, ""), /not scoped/);
  assert.throws(() => assertTenantScopedStorageKey(TENANT_A, "branding/logo/x.png"), /not scoped/);
});
