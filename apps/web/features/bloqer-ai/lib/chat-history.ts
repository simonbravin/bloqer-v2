export const AI_CHAT_MAX_MESSAGES = 40;
export const AI_CHAT_MAX_MESSAGE_CHARS = 8_000;

type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

/** Keep the most recent context without requiring the chat to discard visible messages. */
export function buildAiChatHistory(messages: ReadonlyArray<ChatHistoryMessage>): ChatHistoryMessage[] {
  const recent = messages
    .filter(({ content }) => content.trim().length > 0)
    .slice(-AI_CHAT_MAX_MESSAGES);
  const firstUser = recent.findIndex(({ role }) => role === "user");
  if (firstUser < 0) return [];
  return recent.slice(firstUser).map(({ role, content }) => ({
    role,
    content: content.trim().slice(0, AI_CHAT_MAX_MESSAGE_CHARS),
  }));
}
