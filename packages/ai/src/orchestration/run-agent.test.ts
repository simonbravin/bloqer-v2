import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runAgent, type AgentStreamEvent } from "./run-agent";
import { createFakeAiProvider } from "../providers/fake/fake-provider";
import { AiProviderRegistry } from "../provider-registry";
import { AiProviderError, userFacingAiProviderErrorMessage } from "../errors";
import { PRESENTATION_END, PRESENTATION_START } from "../presentation";

const contextTool = { name: "get_current_context", description: "context", parameters: { type: "object" } };

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

  it("never emits raw provider errors in the error or terminal text", async () => {
    const fixture = createFakeAiProvider();
    const provider = { ...fixture, async generateResponse() {
      throw new AiProviderError("AUTH", "SENSITIVE_PROVIDER_PAYLOAD");
    } };
    const events: AgentStreamEvent[] = [];
    for await (const event of runAgent({
      provider, model: "fake", system: "test", messages: [{ role: "user", content: "hola" }],
      tools: [], executeTool: async () => ({ content: "{}" }), stream: false,
    })) events.push(event);
    assert.doesNotMatch(JSON.stringify(events), /SENSITIVE_PROVIDER_PAYLOAD/);
    assert.deepEqual(events.find((e) => e.type === "error"), {
      type: "error", code: "AUTH", message: userFacingAiProviderErrorMessage("AUTH"),
    });
    assert.deepEqual(events.at(-1), { type: "done", assistantText: userFacingAiProviderErrorMessage("AUTH") });
  });

  it("allows presentation navigation only from successful tools and keeps their labels", async () => {
    const toolLink = { href: "/ayuda/consulta", label: "Ver ayuda" };
    const text = `${PRESENTATION_START}${JSON.stringify({
      kind: "direct", headline: "Ayuda", insights: [{
        title: "Consulta", explanation: "Información de ayuda", links: [
          { ...toolLink, label: "Etiqueta inventada" }, { href: "/configuracion", label: "Ruta inventada" },
        ],
      }],
    })}${PRESENTATION_END}`;
    const provider = createFakeAiProvider({ turns: [
      { kind: "tool_calls", toolCalls: [{ id: "tool-1", name: contextTool.name, argumentsJson: "{}" }] },
      { kind: "text", text },
    ] });
    const events: AgentStreamEvent[] = [];
    for await (const event of runAgent({
      provider, model: "fake", system: "test", messages: [{ role: "user", content: "ayuda" }],
      tools: [contextTool], executeTool: async () => ({ content: "{}", links: [toolLink] }), stream: false,
    })) events.push(event);
    const presentation = events.find((event) => event.type === "presentation");
    assert.deepEqual(presentation?.presentation.insights[0]?.links, [toolLink]);
  });

  it("includes only executed calls in a nonparallel provider's conversation history", async () => {
    const first = { id: "tool-1", name: contextTool.name, argumentsJson: "{}" };
    const second = { ...first, id: "tool-2" };
    const fixture = createFakeAiProvider({ turns: [
      { kind: "tool_calls", toolCalls: [first, second] }, { kind: "text", text: "Consulta completada" },
    ] });
    const provider = {
      ...fixture,
      capabilities: { ...fixture.capabilities, supportsParallelTools: false },
      async generateResponse(request: Parameters<typeof fixture.generateResponse>[0]) {
        const toolMessages = request.messages.filter((message) => message.role === "tool");
        if (toolMessages.length) {
          const assistant = request.messages.find((message) => message.role === "assistant");
          assert.deepEqual(assistant?.toolCalls, [first]);
          assert.equal(toolMessages[0]?.toolCallId, first.id);
        }
        return fixture.generateResponse(request);
      },
    };
    const events: AgentStreamEvent[] = [];
    for await (const event of runAgent({
      provider, model: "fake", system: "test", messages: [{ role: "user", content: "contexto" }],
      tools: [contextTool], executeTool: async () => ({ content: "{}" }), stream: false,
    })) events.push(event);
    assert.deepEqual(events.at(-1), { type: "done", assistantText: "Consulta completada" });
    assert.equal(events.filter((e) => e.type === "tool_end").length, 1);
  });

  it("finishes with a timeout before an unfinished tool resolves and stops subsequent calls", async () => {
    const controller = new AbortController();
    const provider = createFakeAiProvider({ infiniteTools: true });
    let executed = 0;
    const events: AgentStreamEvent[] = [];
    for await (const event of runAgent({
      provider, model: "fake", system: "test", messages: [{ role: "user", content: "contexto" }],
      tools: [contextTool], signal: controller.signal, stream: false,
      executeTool: async () => {
        executed += 1;
        controller.abort(new DOMException("test timeout", "TimeoutError"));
        return new Promise<never>(() => {});
      },
    })) events.push(event);
    assert.equal(executed, 1);
    assert.equal(events.find((e) => e.type === "error")?.code, "TIMEOUT");
    assert.deepEqual(events.at(-1), { type: "done", assistantText: userFacingAiProviderErrorMessage("TIMEOUT") });
  });
});
