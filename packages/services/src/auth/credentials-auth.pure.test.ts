import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_TOKEN_PURPOSE,
  authTokenIdentifier,
  hashAuthToken,
  generateRawAuthToken,
} from "./credentials-token";

describe("credentials-token helpers", () => {
  it("namespaces identifiers by purpose", () => {
    assert.equal(
      authTokenIdentifier(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY, "a@b.com"),
      "email-verify:a@b.com",
    );
    assert.equal(
      authTokenIdentifier(AUTH_TOKEN_PURPOSE.PASSWORD_RESET, "a@b.com"),
      "password-reset:a@b.com",
    );
  });

  it("hashes tokens deterministically and generates unique raw tokens", () => {
    const a = generateRawAuthToken();
    const b = generateRawAuthToken();
    assert.notEqual(a, b);
    assert.equal(hashAuthToken(a).length, 64);
    assert.equal(hashAuthToken(a), hashAuthToken(a));
    assert.notEqual(hashAuthToken(a), hashAuthToken(b));
  });
});
