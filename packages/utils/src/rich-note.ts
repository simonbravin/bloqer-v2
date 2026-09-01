/**
 * Restricted rich notes for narrative fields (jobsite log general notes, [D-101]).
 * Allowed: paragraphs, line breaks, bold, unordered/ordered lists.
 * Never render stored markup with unchecked HTML — parse to this AST first.
 */

export type RichNoteInline =
  | { type: "text"; text: string }
  | { type: "strong"; children: RichNoteInline[] }
  | { type: "br" };

export type RichNoteBlock =
  | { type: "p"; children: RichNoteInline[] }
  | { type: "ul"; items: RichNoteInline[][] }
  | { type: "ol"; items: RichNoteInline[][] };

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "div", "span"]);
const VOID_TAGS = new Set(["br"]);
const DROP_BLOCKS = new Set(["script", "style", "noscript", "iframe", "object", "embed"]);
const RICH_NOTE_MAX_CHARS = 8000;
/** Cap before parse so pasted Word/HTML cannot hang the sanitizer. */
const RICH_NOTE_RAW_MAX = 32_000;

type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; name: string; boldSpan?: boolean }
  | { kind: "close"; name: string }
  | { kind: "void"; name: string };

/** Real editor/HTML tags — not words like `<bruto>` in legacy plain notes. */
const MARKUP_TAG_RE =
  /<\/?(?:p|br|strong|b|em|i|ul|ol|li|div|span|script|style|noscript|iframe|object|embed|h[1-6]|table|thead|tbody|tr|td|th|a|img|html|body|meta|font)\b/i;

function hasBoldStyle(rawTag: string): boolean {
  return /font-weight\s*:\s*(bold|[5-9]00)/i.test(rawTag);
}

function safeFromCodePoint(code: number): string {
  if (!Number.isInteger(code) || code < 1 || code > 0x10ffff) return "";
  if (code >= 0xd800 && code <= 0xdfff) return "";
  return String.fromCodePoint(code);
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      safeFromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      safeFromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function looksLikeHtml(input: string): boolean {
  return MARKUP_TAG_RE.test(input);
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const chunk = next === -1 ? html.slice(i) : html.slice(i, next);
      if (chunk) tokens.push({ kind: "text", value: decodeEntities(chunk) });
      i = next === -1 ? html.length : next;
      continue;
    }

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<![", i) || html.startsWith("<!", i)) {
      const end = html.indexOf(">", i + 2);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const close = html.indexOf(">", i);
    if (close === -1) {
      tokens.push({ kind: "text", value: decodeEntities(html.slice(i)) });
      break;
    }

    const raw = html.slice(i + 1, close).trim();
    i = close + 1;
    if (!raw) continue;

    const isClose = raw.startsWith("/");
    const body = (isClose ? raw.slice(1) : raw).trim();
    const name = (body.split(/[\s/]/)[0] ?? "").toLowerCase();
    if (!name) continue;

    if (DROP_BLOCKS.has(name)) {
      if (!isClose) {
        const needle = `</${name}`;
        const endTag = html.toLowerCase().indexOf(needle, i);
        if (endTag === -1) {
          i = html.length;
        } else {
          const endClose = html.indexOf(">", endTag);
          i = endClose === -1 ? html.length : endClose + 1;
        }
      }
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) continue;

    const selfClosing = raw.endsWith("/") || VOID_TAGS.has(name);
    if (isClose) tokens.push({ kind: "close", name });
    else if (selfClosing && VOID_TAGS.has(name)) tokens.push({ kind: "void", name });
    else if (!selfClosing) {
      tokens.push({
        kind: "open",
        name,
        boldSpan: name === "span" && hasBoldStyle(raw),
      });
    }
  }
  return tokens;
}

function inlinesHaveText(inlines: RichNoteInline[]): boolean {
  for (const node of inlines) {
    if (node.type === "text" && node.text.trim()) return true;
    if (node.type === "strong" && inlinesHaveText(node.children)) return true;
  }
  return false;
}

function compactInlines(inlines: RichNoteInline[]): RichNoteInline[] {
  const out: RichNoteInline[] = [];
  for (const node of inlines) {
    if (node.type === "text") {
      if (!node.text) continue;
      const prev = out[out.length - 1];
      if (prev?.type === "text") {
        prev.text += node.text;
      } else {
        out.push({ type: "text", text: node.text });
      }
      continue;
    }
    if (node.type === "strong") {
      const children = compactInlines(node.children);
      if (!inlinesHaveText(children)) continue;
      out.push({ type: "strong", children });
      continue;
    }
    out.push(node);
  }
  while (out[out.length - 1]?.type === "br") out.pop();
  return out;
}

function appendText(target: RichNoteInline[], text: string, bold: number): void {
  if (!text) return;
  if (bold > 0) {
    const last = target[target.length - 1];
    if (last?.type === "strong") {
      last.children.push({ type: "text", text });
      return;
    }
    target.push({ type: "strong", children: [{ type: "text", text }] });
    return;
  }
  target.push({ type: "text", text });
}

function parsePlainText(input: string): RichNoteBlock[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: RichNoteBlock[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    blocks.push({ type: "p", children: [{ type: "text", text: line }] });
  }
  return blocks;
}

function parseHtml(html: string): RichNoteBlock[] {
  const tokens = tokenize(html);
  const blocks: RichNoteBlock[] = [];
  let flow: RichNoteInline[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: RichNoteInline[][] = [];
  let li: RichNoteInline[] | null = null;
  let bold = 0;
  const boldSpanStack: boolean[] = [];

  const ensureLi = () => {
    if (listType && li == null) li = [];
  };

  const current = (): RichNoteInline[] => {
    ensureLi();
    return li ?? flow;
  };

  const flushFlow = () => {
    const compact = compactInlines(flow);
    if (inlinesHaveText(compact)) blocks.push({ type: "p", children: compact });
    flow = [];
  };

  const flushLi = () => {
    if (li == null) return;
    const compact = compactInlines(li);
    if (inlinesHaveText(compact)) listItems.push(compact);
    li = null;
  };

  const flushList = () => {
    flushLi();
    if (listType && listItems.length > 0) {
      blocks.push({ type: listType, items: listItems });
    }
    listType = null;
    listItems = [];
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      appendText(current(), token.value, bold);
      continue;
    }
    if (token.kind === "void" && token.name === "br") {
      current().push({ type: "br" });
      continue;
    }
    if (token.kind === "open") {
      if (token.name === "ul" || token.name === "ol") {
        if (listType) {
          flushList();
        } else {
          flushFlow();
        }
        listType = token.name;
        continue;
      }
      if (token.name === "li") {
        if (!listType) {
          flushFlow();
          listType = "ul";
        }
        flushLi();
        li = [];
        continue;
      }
      if (token.name === "p" || token.name === "div") {
        // Chrome wraps each list item in <div> / <p>. Those are not new lists.
        if (li != null) {
          if (inlinesHaveText(li)) li.push({ type: "br" });
          continue;
        }
        if (listType) continue;
        flushFlow();
        continue;
      }
      if (token.name === "strong" || token.name === "b") {
        bold += 1;
        continue;
      }
      if (token.name === "span") {
        const asBold = Boolean(token.boldSpan);
        boldSpanStack.push(asBold);
        if (asBold) bold += 1;
      }
      continue;
    }
    if (token.kind === "close") {
      if (token.name === "ul" || token.name === "ol") {
        flushList();
        continue;
      }
      if (token.name === "li") {
        flushLi();
        continue;
      }
      if (token.name === "p" || token.name === "div") {
        if (!listType) flushFlow();
        continue;
      }
      if (token.name === "strong" || token.name === "b") {
        bold = Math.max(0, bold - 1);
      }
      if (token.name === "span" && boldSpanStack.pop()) {
        bold = Math.max(0, bold - 1);
      }
    }
  }

  flushList();
  flushFlow();
  return blocks;
}

export function parseRichNote(input: string | null | undefined): RichNoteBlock[] {
  if (input == null) return [];
  const trimmed = (input.length > RICH_NOTE_RAW_MAX ? input.slice(0, RICH_NOTE_RAW_MAX) : input).trim();
  if (!trimmed) return [];
  return looksLikeHtml(trimmed) ? parseHtml(trimmed) : parsePlainText(trimmed);
}

function serializeInlines(inlines: RichNoteInline[]): string {
  return inlines
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.text);
      if (node.type === "br") return "<br>";
      return `<strong>${serializeInlines(node.children)}</strong>`;
    })
    .join("");
}

export function serializeRichNote(blocks: RichNoteBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "p") return `<p>${serializeInlines(block.children)}</p>`;
      const items = block.items.map((item) => `<li>${serializeInlines(item)}</li>`).join("");
      return `<${block.type}>${items}</${block.type}>`;
    })
    .join("");
}

export function normalizeRichNote(input: string | null | undefined): string | null {
  const serialized = serializeRichNote(parseRichNote(input));
  return serialized.length > 0 ? serialized : null;
}

export function isRichNoteEmpty(input: string | null | undefined): boolean {
  return normalizeRichNote(input) == null;
}

/**
 * Resolve rich-note value on form submit when the contenteditable DOM may not be
 * hydrated yet (edit mode) but the hidden field already holds the last serialized value.
 */
export function resolveRichNoteSubmitValue(
  domHtml: string,
  fallbackSerialized: string,
): string {
  if (isRichNoteEmpty(domHtml) && !isRichNoteEmpty(fallbackSerialized)) {
    return normalizeRichNote(fallbackSerialized) ?? "";
  }
  return normalizeRichNote(domHtml) ?? "";
}

function inlinesToPlain(inlines: RichNoteInline[]): string {
  return inlines
    .map((node) => {
      if (node.type === "text") return node.text;
      if (node.type === "br") return "\n";
      return inlinesToPlain(node.children);
    })
    .join("");
}

export function richNoteToPlainText(input: string | null | undefined): string {
  const parts: string[] = [];
  for (const block of parseRichNote(input)) {
    if (block.type === "p") {
      const text = inlinesToPlain(block.children).trim();
      if (text) parts.push(text);
      continue;
    }
    block.items.forEach((item, index) => {
      const text = inlinesToPlain(item).trim();
      if (!text) return;
      const mark = block.type === "ul" ? "•" : `${index + 1}.`;
      parts.push(`${mark} ${text}`);
    });
  }
  return parts.join("\n");
}

export { RICH_NOTE_MAX_CHARS, RICH_NOTE_RAW_MAX };
