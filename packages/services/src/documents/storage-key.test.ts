import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertTenantScopedStorageKey, buildStorageKey } from "@bloqer/storage";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("storageKey tenant safety", () => {
  it("prefixes tenantId and does not collide across tenants for the same idempotency key", () => {
    const a = buildStorageKey(TENANT_A, "proj-1", KEY, "foto.jpg");
    const b = buildStorageKey(TENANT_B, "proj-1", KEY, "foto.jpg");
    assert.ok(a.startsWith(`${TENANT_A}/`));
    assert.ok(b.startsWith(`${TENANT_B}/`));
    assert.notEqual(a, b);
    assertTenantScopedStorageKey(TENANT_A, a);
    assert.throws(() => assertTenantScopedStorageKey(TENANT_A, b));
  });

  it("strips path traversal from the filename segment", () => {
    const key = buildStorageKey(TENANT_A, "proj-1", KEY, "../../secret.bin");
    assert.equal(key.includes("/../"), false);
    assert.equal(key.includes("\\"), false);
    assert.ok(key.startsWith(`${TENANT_A}/proj-1/${KEY}/`));
    assert.match(key, /secret\.bin$/);
  });

  it("retry of the same logical upload reuses the same object path", () => {
    const first = buildStorageKey(TENANT_A, "proj-1", KEY, "parte.png");
    const retry = buildStorageKey(TENANT_A, "proj-1", KEY, "parte.png");
    assert.equal(first, retry);
  });
});
