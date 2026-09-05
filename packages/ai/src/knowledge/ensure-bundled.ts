import docsIndex from "../../knowledge/generated/docs-index.json";
import { getLoadedKnowledgeIndex, loadKnowledgeIndex, type KnowledgeIndex } from "./search";

/**
 * Load the generated BM25 docs index via a static JSON import so bundlers
 * (Next/Vercel NFT) include the file. Prefer this over runtime fs paths.
 */
export function ensureBundledKnowledgeLoaded(): boolean {
  if (getLoadedKnowledgeIndex()) return true;
  try {
    loadKnowledgeIndex(docsIndex as KnowledgeIndex);
    return getLoadedKnowledgeIndex() != null;
  } catch {
    return false;
  }
}
