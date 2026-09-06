"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { AiPresentation } from "@bloqer/ai";
import { aiPresentationSchema } from "@bloqer/ai";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sanitizeAssistantPlainText, filterSafeAiLinks } from "@/features/bloqer-ai/lib/safe-ai-content";
import { BloqerAiPresentationView } from "@/features/bloqer-ai/components/bloqer-ai-presentation";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string;
  /** Trusted internal actions from tool `ui.links` (server-filtered). */
  links?: { label: string; href: string }[];
  presentation?: AiPresentation | null;
};

type BloqerAiChatProps = {
  enabled: boolean;
  currentProjectId?: string | null;
};

function suggestionsFor(pathname: string, hasProject: boolean): string[] {
  if (hasProject || pathname.includes("/proyectos/")) {
    return [
      "¿Cómo viene esta obra?",
      "¿Qué tareas están atrasadas?",
      "¿Qué materiales faltan?",
      "¿Qué OC siguen pendientes?",
    ];
  }
  return [
    "¿Qué debería preocuparme hoy?",
    "¿Qué pagos vencen esta semana?",
    "¿Qué tengo pendiente de cobrar?",
    "¿Cómo creo una solicitud de compra?",
  ];
}

function projectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/proyectos\/([0-9a-f-]{36})(?:\/|$)/i);
  return m?.[1] ?? null;
}

/**
 * If a turn was aborted before any assistant text, drop the empty assistant
 * and its preceding user message. Leaving orphan user turns yields consecutive
 * `user` messages and OpenAI rejects the next request.
 */
function withoutAbortedEmptyTurn(messages: ChatMessage[], assistantId: string): ChatMessage[] {
  const idx = messages.findIndex((m) => m.id === assistantId);
  if (idx < 0) return messages;
  const assistant = messages[idx]!;
  if (assistant.content.trim()) return messages;
  if (idx > 0 && messages[idx - 1]?.role === "user") {
    return [...messages.slice(0, idx - 1), ...messages.slice(idx + 1)];
  }
  return messages.filter((m) => m.id !== assistantId);
}

/** When the sheet closes mid-flight with an empty trailing assistant, drop that whole turn. */
function withoutTrailingEmptyTurn(messages: ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || last.content.trim()) return messages;
  if (messages.length >= 2 && messages[messages.length - 2]?.role === "user") {
    return messages.slice(0, -2);
  }
  return messages.slice(0, -1);
}

export function BloqerAiChat({ enabled, currentProjectId }: BloqerAiChatProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resolvedProjectId = currentProjectId ?? projectIdFromPath(pathname);
  const suggestions = useMemo(
    () => suggestionsFor(pathname, Boolean(resolvedProjectId)),
    [pathname, resolvedProjectId],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolStatus, open]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setBusy(false);
      setToolStatus(null);
      setMessages((prev) => withoutTrailingEmptyTurn(prev));
    }
  }, [open]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!enabled) return null;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setToolStatus(null);
    setInput("");
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      // Never send empty assistant stubs (abort leftovers) — server also filters.
      const history = [...messages, userMsg]
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          messages: history,
          currentRoute: pathname,
          currentProjectId: resolvedProjectId ?? undefined,
          isFirstAssistantTurn: !messages.some((m) => m.role === "assistant"),
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "No se pudo consultar a Bloqer AI." }));
        const msg =
          res.status === 429
            ? (typeof err.error === "string" && err.error) ||
              "Alcanzaste temporalmente el límite de consultas de Bloqer AI. Intentá nuevamente en unos minutos."
            : (err.error ?? "Error al consultar el asistente.");
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: msg } : m)),
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";

      while (true) {
        if (ac.signal.aborted) {
          await reader.cancel().catch(() => undefined);
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (line === "") {
            eventName = "message";
            continue;
          }
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (eventName === "text_delta" && typeof data.text === "string") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + data.text } : m,
              ),
            );
          } else if (eventName === "tool_start") {
            setToolStatus(typeof data.label === "string" ? data.label : "Consultando…");
          } else if (eventName === "tool_end") {
            setToolStatus(null);
            const safe = filterSafeAiLinks(
              Array.isArray(data.links) ? (data.links as { label?: unknown; href?: unknown }[]) : null,
            );
            if (safe.length) {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const merged = filterSafeAiLinks([...(m.links ?? []), ...safe]);
                  return { ...m, links: merged };
                }),
              );
            }
          } else if (eventName === "presentation") {
            const parsed = aiPresentationSchema.safeParse(data.presentation);
            if (parsed.success) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, presentation: parsed.data } : m,
                ),
              );
            }
          } else if (eventName === "error") {
            const msg = typeof data.message === "string" ? data.message : "Error del asistente";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content || msg }
                  : m,
              ),
            );
          } else if (eventName === "done") {
            const finalText =
              typeof data.assistantText === "string" ? data.assistantText.trim() : "";
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                // Prefer finalized text (fence stripped). Keep streaming content if done is empty.
                if (finalText) return { ...m, content: finalText };
                if (m.content.trim() || m.presentation) return m;
                return {
                  ...m,
                  content: "El asistente no devolvió una respuesta. Probá de nuevo.",
                };
              }),
            );
          }
        }
      }

      if (ac.signal.aborted) {
        setMessages((prev) => withoutAbortedEmptyTurn(prev, assistantId));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => withoutAbortedEmptyTurn(prev, assistantId));
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || "No se pudo completar la consulta." }
            : m,
        ),
      );
    } finally {
      // Only the active request may clear busy — avoids races if a later send aborts this one.
      if (abortRef.current === ac) {
        abortRef.current = null;
        setBusy(false);
        setToolStatus(null);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-20 right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg",
          "hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:bottom-6",
        )}
        aria-label="Preguntale a Bloqer"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Preguntale a Bloqer</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md max-sm:w-full"
        >
          <SheetHeader className="border-b px-4 py-3 pr-12 text-left">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                Preguntale a Bloqer
              </SheetTitle>
              <SheetDescription className="text-xs">
                Ayuda del producto y datos autorizados (solo lectura). El historial vive
                solo en esta sesión del navegador.
              </SheetDescription>
            </div>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Sugerencias:</p>
                  <div className="flex flex-col gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => void send(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[95%] space-y-2 rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {m.role === "assistant" && m.presentation ? (
                    <BloqerAiPresentationView
                      presentation={m.presentation}
                      onNavigate={() => setOpen(false)}
                      onFollowUp={(q) => void send(q)}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap">
                      {sanitizeAssistantPlainText(
                        m.content || (busy && m.role === "assistant" ? "…" : ""),
                      )}
                    </div>
                  )}
                  {m.role === "assistant" && !m.presentation && m.links?.length ? (
                    <div
                      data-testid="bloqer-ai-links"
                      className="flex flex-wrap gap-1.5 pt-0.5"
                    >
                      {m.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center rounded-md border border-border/80 bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {toolStatus ? (
                <p data-testid="bloqer-ai-tool-status" className="text-xs text-muted-foreground">
                  {toolStatus}
                </p>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <div className="border-t p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                También podés abrir el{" "}
                <Link href="/ayuda" className="underline underline-offset-2">
                  centro de ayuda
                </Link>
                .
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <div className="flex gap-2">
                  <input
                    data-testid="bloqer-ai-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Preguntale algo a Bloqer…"
                    className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                  />
                  <Button type="submit" data-testid="bloqer-ai-send" disabled={busy || !input.trim()}>
                    Enviar
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
