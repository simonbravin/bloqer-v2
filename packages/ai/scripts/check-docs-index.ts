/**
 * Fail if knowledge index is missing or stale vs source docs.
 * Run: pnpm ai:check-docs-index
 */
import fs from "node:fs";
import { computeKnowledgeSourceManifest, DOCS_INDEX_PATH } from "./knowledge-sources";

function main() {
  if (!fs.existsSync(DOCS_INDEX_PATH)) {
    console.error("[ai:check-docs-index] Knowledge index missing. Run: pnpm ai:index-docs");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(DOCS_INDEX_PATH, "utf8")) as {
    sourceHash?: string;
    chunks?: unknown[];
  };
  const { sourceHash } = computeKnowledgeSourceManifest();
  if (!raw.sourceHash) {
    console.error(
      "[ai:check-docs-index] Knowledge index is stale (missing sourceHash). Run: pnpm ai:index-docs",
    );
    process.exit(1);
  }
  if (raw.sourceHash !== sourceHash) {
    console.error(
      `[ai:check-docs-index] Knowledge index is stale.\n  index:  ${raw.sourceHash}\n  sources:${sourceHash}\nRun: pnpm ai:index-docs`,
    );
    process.exit(1);
  }
  console.log(
    `[ai:check-docs-index] OK — ${Array.isArray(raw.chunks) ? raw.chunks.length : 0} chunks, sourceHash=${sourceHash.slice(0, 12)}…`,
  );
}

main();
