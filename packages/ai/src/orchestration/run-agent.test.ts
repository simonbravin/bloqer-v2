import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "./run-agent";
import { createFakeAiProvider } from "../providers/fake/fake-provider";
import { AiProviderRegistry } from "../provider-registry";

describe("runAgent + FakeAiProvider", () => {
  it("completes text-only without tools", async () => {
    const provider = createFakeAiProvider({
      turns: [{ kind: "text", text: "Hola desde fake" }],
    });
    const events = [];
    for await (const ev of runAgent({
      provider,
      model: "fake-model",
      system: "test",
      messages: [{ role: "user", content: "hola" }],
      tools: [],
      executeTool: async () => ({ content: "{}" }),
      stream: false,
    })) {
      events.push(ev);
    }
    assert.ok(events.some((e) => e.type === "text_delta" && e.text.includes("fake")));
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("executes tool then answers", async () => {
    const provider = createFakeAiProvider({
      turns: [
        {
          kind: "tool_calls",
          toolCalls: [{ id: "c1", name: "get_current_context", argumentsJson: "{}" }],
        },
        { kind: "text", text: "Contexto listo" },
      ],
    });
    let executed = 0;
    const events = [];
    for await (const ev of runAgent({
      provider,
      model: "fake-model",
      system: "test",
      messages: [{ role: "user", content: "contexto" }],
      tools: [
        {
          name: "get_current_context",
          description: "ctx",
          parameters: { type: "object", properties: {} },
        },
      ],
      executeTool: async () => {
        executed += 1;
        return { content: JSON.stringify({ ok: true }), statusLabel: "Consultando…" };
      },
      stream: false,
    })) {
      events.push(ev);
    }
    assert.equal(executed, 1);
    assert.ok(events.some((e) => e.type === "tool_start"));
    assert.ok(events.some((e) => e.type === "tool_end" && e.ok));
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("stops infinite tool loops at maxToolCalls", async () => {
    const provider = createFakeAiProvider({ infiniteTools: true });
    let executed = 0;
    const events = [];
    for await (const ev of runAgent({
      provider,
      model: "fake-model",
      system: "test",
      messages: [{ role: "user", content: "loop" }],
      tools: [
        {
          name: "get_current_context",
          description: "ctx",
          parameters: { type: "object", properties: {} },
        },
      ],
      maxToolCalls: 3,
      maxTurns: 20,
      executeTool: async () => {
        executed += 1;
        return { content: "{}" };
      },
      stream: false,
    })) {
      events.push(ev);
    }
    assert.ok(executed <= 3);
    assert.ok(events.some((e) => e.type === "error" || e.type === "done"));
  });

  it("registry can swap to a second fake provider without tool changes", () => {
    const reg = new AiProviderRegistry();
    reg.register("fake", () => createFakeAiProvider({ id: "fake" }));
    reg.register("fake_secondary", () =>
      createFakeAiProvider({ id: "fake_secondary", turns: [{ kind: "text", text: "B" }] }),
    );
    assert.equal(reg.create("fake").id, "fake");
    assert.equal(reg.create("fake_secondary").id, "fake_secondary");
  });
});
