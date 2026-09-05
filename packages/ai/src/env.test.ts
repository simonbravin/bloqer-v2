import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveBloqerAiEnabled, assertFakeProviderAllowed, getBloqerAiEnv } from "./env";

describe("resolveBloqerAiEnabled", () => {
  it("is false when env missing", () => {
    assert.equal(resolveBloqerAiEnabled({}), false);
  });

  it("is false for explicit false/0/empty", () => {
    assert.equal(resolveBloqerAiEnabled({ BLOQER_AI_ENABLED: "false" }), false);
    assert.equal(resolveBloqerAiEnabled({ BLOQER_AI_ENABLED: "0" }), false);
    assert.equal(resolveBloqerAiEnabled({ BLOQER_AI_ENABLED: "" }), false);
  });

  it("is true in non-production when enabled", () => {
    assert.equal(
      resolveBloqerAiEnabled({
        BLOQER_AI_ENABLED: "true",
        NODE_ENV: "development",
        APP_ENV: "development",
      }),
      true,
    );
  });

  it("stays false in production without ALLOW_PRODUCTION", () => {
    assert.equal(
      resolveBloqerAiEnabled({
        BLOQER_AI_ENABLED: "true",
        VERCEL_ENV: "production",
      }),
      false,
    );
    assert.equal(
      resolveBloqerAiEnabled({
        BLOQER_AI_ENABLED: "true",
        APP_ENV: "production",
      }),
      false,
    );
  });

  it("allows production only with dual flags", () => {
    assert.equal(
      resolveBloqerAiEnabled({
        BLOQER_AI_ENABLED: "true",
        BLOQER_AI_ALLOW_PRODUCTION: "true",
        VERCEL_ENV: "production",
      }),
      true,
    );
  });
});

describe("assertFakeProviderAllowed", () => {
  it("allows fake in development", () => {
    assert.doesNotThrow(() =>
      assertFakeProviderAllowed("fake", {
        NODE_ENV: "development",
        APP_ENV: "development",
      }),
    );
  });

  it("blocks fake in production", () => {
    assert.throws(
      () =>
        assertFakeProviderAllowed("fake", {
          VERCEL_ENV: "production",
          BLOQER_AI_ENABLED: "true",
          BLOQER_AI_ALLOW_PRODUCTION: "true",
        }),
      /blocked in production/i,
    );
  });
});

describe("getBloqerAiEnv", () => {
  it("keeps OPENAI_API_KEY when BLOQER_AI_BASE_URL is invalid", () => {
    const env = getBloqerAiEnv({
      BLOQER_AI_ENABLED: "true",
      NODE_ENV: "development",
      BLOQER_AI_BASE_URL: "not-a-url",
      OPENAI_API_KEY: "sk-test-key",
      BLOQER_AI_MODEL: "gpt-5.6-luna",
    });
    assert.equal(env.openaiApiKey, "sk-test-key");
    assert.equal(env.baseUrl, undefined);
    assert.equal(env.model, "gpt-5.6-luna");
  });
});
