import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preferCompanyIdCandidate } from "./company.service";

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
