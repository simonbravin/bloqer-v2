import { z } from "zod";
import { searchKnowledge, type KnowledgeHit } from "@bloqer/ai";
import { defineBloqerAiTool, nowIso } from "../types";
import type { AiToolExecuteResult } from "../types";

export type HelpKnowledgeHit = {
  slug: string;
  title: string;
  summary: string;
  href: string;
  score?: number;
};

export type KnowledgeToolDeps = {
  /** Injected from apps/web help catalog (provider-independent). */
  searchHelp?: (query: string) => HelpKnowledgeHit[];
};

function mapDocHit(h: KnowledgeHit) {
  return {
    sourceType: h.sourceType,
    title: h.title,
    path: h.path,
    section: h.section ?? null,
    excerpt: h.text.slice(0, 500),
    score: h.score,
  };
}

export function createSearchBloqerKnowledgeTool(deps: KnowledgeToolDeps = {}) {
  return defineBloqerAiTool({
    name: "search_bloqer_knowledge",
    description:
      "Busca en la ayuda in-app y en la documentación de Bloqer (cómo crear SC, significados, flujos). No son datos de una obra concreta.",
    risk: "READ",
    inputSchema: z.object({
      query: z.string().min(2).max(200),
      limit: z.number().int().min(1).max(10).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 2, maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    statusLabel: "Buscando en la guía…",
    async execute(_ctx, args): Promise<AiToolExecuteResult> {
      const limit = args.limit ?? 6;
      const help = (deps.searchHelp?.(args.query) ?? []).slice(0, limit);
      const docs = searchKnowledge(args.query, { k: limit }).map(mapDocHit);
      const links = help.map((h) => ({ label: h.title, href: h.href }));
      return {
        data: {
          helpArticles: help,
          docFragments: docs,
        },
        provenance: {
          sourceType: help.length ? "bloqer_help" : "bloqer_docs",
          route: help[0]?.href ?? "/ayuda",
          asOf: nowIso(),
        },
        ui: {
          summaryLabel: "Buscando en la guía…",
          links: links.length ? links : [{ label: "Centro de ayuda", href: "/ayuda" }],
        },
      };
    },
  });
}
