import {
  aiPresentationSchema,
  PRESENTATION_END,
  PRESENTATION_START,
  type AiPresentation,
  type AiPresentationLink,
} from "./schema";

export type ParsedAssistantPresentation = {
  /** Visible prose with presentation fence removed. */
  visibleText: string;
  presentation: AiPresentation | null;
  /** True when a fence/JSON was found but failed Zod. */
  invalidPresentation: boolean;
};

function isSafeInternalHref(href: string): boolean {
  const h = href.trim();
  if (!h.startsWith("/") || h.startsWith("//")) return false;
  if (h.includes("://")) return false;
  if (/^(javascript|data):/i.test(h)) return false;
  return true;
}

function sanitizeLinks(links: AiPresentationLink[] | undefined): AiPresentationLink[] {
  if (!links?.length) return [];
  const out: AiPresentationLink[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (!isSafeInternalHref(link.href)) continue;
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    out.push({ label: link.label.trim().slice(0, 80), href: link.href.trim() });
  }
  return out;
}

/** Drop unsafe hrefs after Zod (defense in depth). */
export function sanitizeAiPresentation(raw: AiPresentation): AiPresentation {
  return {
    ...raw,
    insights: raw.insights.slice(0, 5).map((insight) => ({
      ...insight,
      links: sanitizeLinks(insight.links),
    })),
    actions: raw.actions
      .slice(0, 5)
      .sort((a, b) => a.rank - b.rank)
      .map((action, idx) => ({
        ...action,
        rank: idx + 1,
        links: sanitizeLinks(action.links),
      })),
    followUps: raw.followUps.slice(0, 3),
    secondaryMetrics: raw.secondaryMetrics.slice(0, 12),
  };
}

function tryParseJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Attempt to trim trailing junk after last }
    const end = trimmed.lastIndexOf("}");
    if (end <= 0) return null;
    try {
      return JSON.parse(trimmed.slice(0, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

function extractFencedBlock(text: string): { before: string; json: string; after: string } | null {
  const start = text.indexOf(PRESENTATION_START);
  if (start < 0) return null;
  const afterStart = start + PRESENTATION_START.length;
  const end = text.indexOf(PRESENTATION_END, afterStart);
  if (end < 0) {
    // Incomplete fence while streaming — treat as not ready
    return null;
  }
  return {
    before: text.slice(0, start).trimEnd(),
    json: text.slice(afterStart, end).trim(),
    after: text.slice(end + PRESENTATION_END.length).trimStart(),
  };
}

/**
 * Extract + validate presentation from assistant text.
 * Provider-agnostic: works with any model that emits the fence + JSON.
 */
export function parseAiPresentationFromAssistantText(
  text: string,
): ParsedAssistantPresentation {
  const fenced = extractFencedBlock(text);
  if (!fenced) {
    // Optional: whole message is JSON presentation
    const asJson = tryParseJsonObject(text);
    if (asJson && typeof asJson === "object" && asJson !== null && "kind" in asJson && "headline" in asJson) {
      const parsed = aiPresentationSchema.safeParse(asJson);
      if (parsed.success) {
        return {
          visibleText: "",
          presentation: sanitizeAiPresentation(parsed.data),
          invalidPresentation: false,
        };
      }
      return { visibleText: text, presentation: null, invalidPresentation: true };
    }
    return { visibleText: text, presentation: null, invalidPresentation: false };
  }

  const payload = tryParseJsonObject(fenced.json);
  const visibleText = [fenced.before, fenced.after].filter(Boolean).join("\n\n").trim();
  if (!payload) {
    return { visibleText: visibleText || text, presentation: null, invalidPresentation: true };
  }
  const parsed = aiPresentationSchema.safeParse(payload);
  if (!parsed.success) {
    return { visibleText: visibleText || text, presentation: null, invalidPresentation: true };
  }
  return {
    visibleText,
    presentation: sanitizeAiPresentation(parsed.data),
    invalidPresentation: false,
  };
}

/** Heuristic: executive briefs should not be data dumps. */
export function scorePresentationQuality(presentation: AiPresentation | null, opts?: {
  expectKind?: AiPresentation["kind"];
  requireActions?: boolean;
}): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  if (!presentation) {
    notes.push("missing presentation");
    return { pass: false, notes };
  }
  if (opts?.expectKind && presentation.kind !== opts.expectKind) {
    notes.push(`kind=${presentation.kind} expected=${opts.expectKind}`);
  }
  if (presentation.kind === "executive") {
    if (presentation.insights.length === 0) notes.push("executive without insights");
    if (presentation.insights.length > 5) notes.push("too many insights");
    if (opts?.requireActions !== false && presentation.actions.length === 0) {
      notes.push("executive without actions");
    }
  }
  if (presentation.kind === "direct" && presentation.insights.length > 2) {
    notes.push("direct with too many insights");
  }
  return { pass: notes.length === 0, notes };
}
