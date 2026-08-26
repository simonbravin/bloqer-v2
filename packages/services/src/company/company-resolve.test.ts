import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preferCompanyIdCandidate, pickSoleCompanyId, pickResolvedCompanyId } from "./company.service";

describe("preferCompanyIdCandidate", () => {
  it("prefers explicit preferred over membership", () => {
    assert.equal(
      preferCompanyIdCandidate("project-co", "membership-co"),
      "project-co",
    );
  });

  it("falls back to membership when preferred is null/empty", () => {
    assert.equal(preferCompanyIdCandidate(null, "membership-co"), "membership-co");
    assert.equal(preferCompanyIdCandidate("", "membership-co"), "membership-co");
    assert.equal(preferCompanyIdCandidate("   ", "membership-co"), "membership-co");
  });

  it("returns null when both unset", () => {
    assert.equal(preferCompanyIdCandidate(null, null), null);
    assert.equal(preferCompanyIdCandidate("", ""), null);
  });
});

describe("pickSoleCompanyId", () => {
  it("returns the only id", () => {
    assert.equal(pickSoleCompanyId(["co-1"]), "co-1");
  });

  it("returns null when empty or more than one", () => {
    assert.equal(pickSoleCompanyId([]), null);
    assert.equal(pickSoleCompanyId(["co-1", "co-2"]), null);
  });
});

describe("pickResolvedCompanyId", () => {
  it("keeps a valid candidate and does not substitute another company", () => {
    assert.equal(pickResolvedCompanyId("co-a", true, "co-sole"), "co-a");
  });

  it("does not swap to sole when the candidate is invalid", () => {
    assert.equal(pickResolvedCompanyId("co-dead", false, "co-sole"), null);
  });

  it("uses sole only when there is no candidate", () => {
    assert.equal(pickResolvedCompanyId(null, false, "co-sole"), "co-sole");
    assert.equal(pickResolvedCompanyId(null, false, null), null);
  });
});
