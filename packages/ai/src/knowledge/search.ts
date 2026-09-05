import { buildBm25Index, searchBm25, type Bm25Index } from "./bm25";

export type KnowledgeChunk = {
  id: string;
  sourceType: "bloqer_docs" | "bloqer_help";
  title: string;
  path: string;
  section?: string;
  text: string;
  href?: string;
};

export type KnowledgeIndex = {
  version: string;
  generatedAt: string;
  sourceHash?: string;
  sources?: Array<{ path: string; sha256: string; bytes: number }>;
  chunks: KnowledgeChunk[];
};

let cached: { index: KnowledgeIndex; bm25: Bm25Index } | null = null;

export function loadKnowledgeIndex(raw: KnowledgeIndex): void {
  const bm25 = buildBm25Index(
    raw.chunks.map((c) => ({
      id: c.id,
      text: `${c.title}\n${c.section ?? ""}\n${c.text}`,
    })),
  );
  cached = { index: raw, bm25 };
}

export function getLoadedKnowledgeIndex(): KnowledgeIndex | null {
  return cached?.index ?? null;
}

export type KnowledgeHit = KnowledgeChunk & { score: number };

export function searchKnowledge(
  query: string,
  opts?: { k?: number; sourceType?: KnowledgeChunk["sourceType"] },
): KnowledgeHit[] {
  if (!cached) return [];
  const ranked = searchBm25(cached.bm25, query, { k: (opts?.k ?? 8) * 3 });
  const byId = new Map(cached.index.chunks.map((c) => [c.id, c]));
  const out: KnowledgeHit[] = [];
  for (const r of ranked) {
    const chunk = byId.get(r.id);
    if (!chunk) continue;
    if (opts?.sourceType && chunk.sourceType !== opts.sourceType) continue;
    out.push({ ...chunk, score: r.score });
    if (out.length >= (opts?.k ?? 8)) break;
  }
  return out;
}
