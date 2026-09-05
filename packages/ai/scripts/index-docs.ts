/**
 * Reproducible docs → knowledge index (no OpenAI, no Neon).
 * Run: pnpm ai:index-docs
 */
import fs from "node:fs";
import path from "node:path";
import {
  DOCS_INDEX_PATH,
  DOCS_ROOT,
  KNOWLEDGE_DOC_INCLUDE,
  REPO_ROOT,
  computeKnowledgeSourceManifest,
} from "./knowledge-sources";

type Chunk = {
  id: string;
  sourceType: "bloqer_docs";
  title: string;
  path: string;
  section?: string;
  text: string;
};

function chunkMarkdown(relPath: string, content: string): Chunk[] {
  const lines = content.split(/\r?\n/);
  const title = (lines.find((l) => l.startsWith("# ")) ?? relPath).replace(/^#\s+/, "").trim();
  const chunks: Chunk[] = [];
  let section = "";
  let buf: string[] = [];
  let part = 0;

  const flush = () => {
    const text = buf.join("\n").trim();
    if (text.length < 40) {
      buf = [];
      return;
    }
    const max = 1200;
    for (let i = 0; i < text.length; i += max) {
      const slice = text.slice(i, i + max);
      part += 1;
      chunks.push({
        id: `${relPath}#${part}`,
        sourceType: "bloqer_docs",
        title,
        path: `docs/bloqer2.0/${relPath}`,
        section: section || undefined,
        text: slice,
      });
    }
    buf = [];
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush();
      section = line.replace(/^##\s+/, "").trim();
      buf.push(line);
      continue;
    }
    buf.push(line);
    if (buf.join("\n").length > 1400) flush();
  }
  flush();
  return chunks;
}

function main() {
  const { sourceHash, sources } = computeKnowledgeSourceManifest();
  const chunks: Chunk[] = [];
  for (const rel of KNOWLEDGE_DOC_INCLUDE) {
    const abs = path.join(DOCS_ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.warn(`[ai:index-docs] skip missing ${rel}`);
      continue;
    }
    chunks.push(...chunkMarkdown(rel, fs.readFileSync(abs, "utf8")));
  }

  fs.mkdirSync(path.dirname(DOCS_INDEX_PATH), { recursive: true });
  const payload = {
    version: "2",
    generatedAt: new Date().toISOString(),
    sourceHash,
    sources,
    chunks,
  };
  fs.writeFileSync(DOCS_INDEX_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    `[ai:index-docs] wrote ${chunks.length} chunks (sourceHash=${sourceHash.slice(0, 12)}…) → ${path.relative(REPO_ROOT, DOCS_INDEX_PATH)}`,
  );
}

main();
