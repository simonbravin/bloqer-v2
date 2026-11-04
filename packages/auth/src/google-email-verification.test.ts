import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasVerifiedGoogleEmail } from "./google-email-verification";

describe("Google ownership proof before account linking", () => {
  it("accepts explicit verified email claims", () => {
    assert.equal(hasVerifiedGoogleEmail({ email_verified: true }), true);
  });

  it("rejects unverified email claims", () => {
    assert.equal(hasVerifiedGoogleEmail({ email_verified: false }), false);
  });

  it("rejects missing profiles and missing claims", () => {
    assert.equal(hasVerifiedGoogleEmail(undefined), false);
    assert.equal(hasVerifiedGoogleEmail(null), false);
    assert.equal(hasVerifiedGoogleEmail({}), false);
  });

  it("does not coerce untrusted truthy values into ownership proof", () => {
    assert.equal(hasVerifiedGoogleEmail({ email_verified: "true" }), false);
    assert.equal(hasVerifiedGoogleEmail({ email_verified: 1 }), false);
  });
});
