import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiProviderError } from "../../errors";
import {
  buildOpenAiChatCompletionsExtras,
  createOpenAiProvider,
  mapAndThrowOpenAiProviderError,
  userFacingOpenAiErrorMessage,
} from "./openai-provider";

describe("buildOpenAiChatCompletionsExtras", () => {
  it("sets reasoning_effort none for gpt-5.6-luna when tools are present", () => {
    assert.deepEqual(buildOpenAiChatCompletionsExtras("gpt-5.6-luna", true), {
      reasoning_effort: "none",
    });
    assert.deepEqual(buildOpenAiChatCompletionsExtras("GPT-5.6-Luna", true), {
      reasoning_effort: "none",
    });
    assert.deepEqual(buildOpenAiChatCompletionsExtras("gpt-5.6", true), {
      reasoning_effort: "none",
    });
  });

  it("does not force reasoning_effort for gpt-5.6-luna without tools", () => {
    assert.deepEqual(buildOpenAiChatCompletionsExtras("gpt-5.6-luna", false), {});
  });

  it("does not force reasoning_effort for non-5.6 models with tools", () => {
    assert.deepEqual(buildOpenAiChatCompletionsExtras("gpt-4.1-mini", true), {});
    assert.deepEqual(buildOpenAiChatCompletionsExtras("gpt-5.4", true), {});
  });
});

describe("userFacingOpenAiErrorMessage", () => {
  it("never echoes vendor English", () => {
    for (const code of [
      "BAD_REQUEST",
      "PROVIDER",
      "RATE_LIMIT",
      "AUTH",
      "TIMEOUT",
      "UNKNOWN",
    ] as const) {
      const msg = userFacingOpenAiErrorMessage(code);
      assert.equal(/reasoning_effort|chat\/completions|Function tools|sk-/i.test(msg), false);
    }
  });

  it("uses the generic retry copy for BAD_REQUEST / PROVIDER", () => {
    assert.equal(
      userFacingOpenAiErrorMessage("BAD_REQUEST"),
      "No pude completar la consulta en este momento. Intentá nuevamente.",
    );
    assert.equal(
      userFacingOpenAiErrorMessage("PROVIDER"),
      "No pude completar la consulta en este momento. Intentá nuevamente.",
    );
  });
});

describe("mapAndThrowOpenAiProviderError", () => {
  it("maps HTTP 400 vendor payload to safe BAD_REQUEST Spanish", () => {
    const raw =
      "400 Function tools with reasoning_effort are not supported for gpt-5.6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.";
    try {
      mapAndThrowOpenAiProviderError(Object.assign(new Error(raw), { status: 400 }));
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(e instanceof AiProviderError);
      assert.equal(e.code, "BAD_REQUEST");
      assert.equal(e.message, userFacingOpenAiErrorMessage("BAD_REQUEST"));
      assert.equal(/reasoning_effort|Function tools|chat\/completions/i.test(e.message), false);
    }
  });

  it("maps HTTP 429 to RATE_LIMIT Spanish", () => {
    try {
      mapAndThrowOpenAiProviderError(Object.assign(new Error("Rate limit exceeded"), { status: 429 }));
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(e instanceof AiProviderError);
      assert.equal(e.code, "RATE_LIMIT");
      assert.equal(e.message, userFacingOpenAiErrorMessage("RATE_LIMIT"));
      assert.equal(e.retryable, true);
    }
  });

  it("maps HTTP 500 to PROVIDER Spanish", () => {
    try {
      mapAndThrowOpenAiProviderError(Object.assign(new Error("Internal server error"), { status: 500 }));
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(e instanceof AiProviderError);
      assert.equal(e.code, "PROVIDER");
      assert.equal(e.message, userFacingOpenAiErrorMessage("PROVIDER"));
      assert.equal(e.retryable, true);
    }
  });

  it("createOpenAiProvider missing key uses safe NOT_CONFIGURED message", () => {
    assert.throws(
      () => createOpenAiProvider({ apiKey: "   " }),
      (e: unknown) =>
        e instanceof AiProviderError &&
        e.code === "NOT_CONFIGURED" &&
        !/OPENAI_API_KEY|sk-/i.test(e.message),
    );
  });
});
