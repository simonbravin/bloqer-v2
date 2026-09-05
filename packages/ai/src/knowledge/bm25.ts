/** Minimal BM25 for local doc/help retrieval (provider-independent). */

export type Bm25Document = {
  id: string;
  text: string;
  /** Pre-tokenized optional; otherwise tokenized from text. */
  tokens?: string[];
};

function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export type Bm25Index = {
  docs: Array<Bm25Document & { tokens: string[] }>;
  avgDl: number;
  df: Map<string, number>;
  N: number;
};

export function buildBm25Index(docs: Bm25Document[]): Bm25Index {
  const prepared = docs.map((d) => ({
    ...d,
    tokens: d.tokens ?? tokenize(d.text),
  }));
  const df = new Map<string, number>();
  let totalLen = 0;
  for (const d of prepared) {
    totalLen += d.tokens.length;
    const uniq = new Set(d.tokens);
    for (const t of uniq) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return {
    docs: prepared,
    avgDl: prepared.length ? totalLen / prepared.length : 0,
    df,
    N: prepared.length,
  };
}

export function searchBm25(
  index: Bm25Index,
  query: string,
  opts?: { k?: number; k1?: number; b?: number },
): Array<{ id: string; score: number }> {
  const k = opts?.k ?? 8;
  const k1 = opts?.k1 ?? 1.2;
  const b = opts?.b ?? 0.75;
  const qTokens = tokenize(query);
  if (!qTokens.length || !index.N) return [];

  const scores = new Map<string, number>();
  for (const d of index.docs) {
    const tfMap = new Map<string, number>();
    for (const t of d.tokens) tfMap.set(t, (tfMap.get(t) ?? 0) + 1);
    let score = 0;
    for (const qt of qTokens) {
      const tf = tfMap.get(qt) ?? 0;
      if (!tf) continue;
      const df = index.df.get(qt) ?? 0;
      const idf = Math.log(1 + (index.N - df + 0.5) / (df + 0.5));
      const denom = tf + k1 * (1 - b + b * (d.tokens.length / (index.avgDl || 1)));
      score += idf * ((tf * (k1 + 1)) / denom);
    }
    if (score > 0) scores.set(d.id, score);
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export { tokenize as tokenizeForBm25 };
