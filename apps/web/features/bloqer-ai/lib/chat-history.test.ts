import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_CHAT_MAX_MESSAGE_CHARS, AI_CHAT_MAX_MESSAGES, buildAiChatHistory } from "./chat-history";

test("a long conversation keeps the last valid window and the new question", () => {
  const messages = Array.from({ length: 22 }, (_, idx) => [
    { role: "user" as const, content: `Pregunta ${idx}` },
    { role: "assistant" as const, content: `Respuesta ${idx}` },
  ]).flat();
  messages.push({ role: "user", content: "Nueva pregunta" });
  const history = buildAiChatHistory(messages);
  assert.ok(history.length <= AI_CHAT_MAX_MESSAGES);
  assert.equal(history[0]?.role, "user");
  assert.notEqual(history[0]?.content, "Pregunta 0");
  assert.deepEqual(history.at(-1), { role: "user", content: "Nueva pregunta" });
  assert.equal(messages.length, 45);
});

test("history excludes empty stubs and bounds previous text", () => {
  const history = buildAiChatHistory([
    { role: "assistant", content: "orphan" },
    { role: "user", content: " Hola " },
    { role: "assistant", content: "x".repeat(AI_CHAT_MAX_MESSAGE_CHARS + 20) },
    { role: "assistant", content: "  " },
    { role: "user", content: "  Seguimiento " },
  ]);
  assert.equal(history.length, 3);
  assert.equal(history[0]?.content, "Hola");
  assert.equal(history[1]?.content.length, AI_CHAT_MAX_MESSAGE_CHARS);
  assert.equal(history[2]?.content, "Seguimiento");
});
