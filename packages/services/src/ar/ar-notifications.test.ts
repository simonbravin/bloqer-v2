import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirror of AR_COLLECTION_NOTIFY_ROLES in ar-notifications.service.ts (D-072). */
const AR_COLLECTION_NOTIFY_ROLES = new Set(["OWNER", "ADMIN", "FINANCE", "TREASURER"]);

function isArCollectionNotifyAudience(roles: string[]): boolean {
  return roles.some((r) => AR_COLLECTION_NOTIFY_ROLES.has(r));
}

describe("D-072 AR collection notify audience", () => {
  it("includes company finance actors", () => {
    assert.equal(isArCollectionNotifyAudience(["FINANCE"]), true);
    assert.equal(isArCollectionNotifyAudience(["TREASURER"]), true);
    assert.equal(isArCollectionNotifyAudience(["OWNER"]), true);
    assert.equal(isArCollectionNotifyAudience(["ADMIN", "VIEWER"]), true);
  });

  it("excludes project-only and viewer-only", () => {
    assert.equal(isArCollectionNotifyAudience(["PROJECT_FINANCE"]), false);
    assert.equal(isArCollectionNotifyAudience(["PROJECT_MANAGER"]), false);
    assert.equal(isArCollectionNotifyAudience(["VIEWER"]), false);
    assert.equal(isArCollectionNotifyAudience(["PROCUREMENT"]), false);
  });
});
