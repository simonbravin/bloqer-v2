import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlatformAuditSearchParams } from "./platform-audit-filters";

test("platform audit URL filters preserve a valid tenant/action and default empty values", () => {
  const targetTenantId = "11111111-1111-4111-8111-111111111111";
  const parsed = parsePlatformAuditSearchParams({ tenantId: ` ${targetTenantId} `, action: " platform.tenant.created ", limit: "200" });
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data, { targetTenantId, action: "platform.tenant.created", limit: 200 });
  assert.deepEqual(parsePlatformAuditSearchParams({ tenantId: "", action: " ", limit: "" }), parsePlatformAuditSearchParams({}));
});

test("malformed URL filters produce validation feedback instead of throwing or widening the query", () => {
  for (const input of [
    { tenantId: "invalid" }, { limit: "1.5" }, { limit: "201" }, { limit: "0" },
    { limit: "NaN" }, { limit: "Infinity" }, { tenantId: ["one", "two"] },
    { action: "a".repeat(129) }, { action: ["one", "two"] },
  ]) {
    assert.equal(parsePlatformAuditSearchParams(input).success, false);
  }
});
