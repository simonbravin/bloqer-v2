/**
 * Shared source list + content hash for docs → knowledge index.
 * Used by index-docs and check-docs-index (reproducible + stale detection).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KNOWLEDGE_DOC_INCLUDE = [
  "GUIA_OPERATIVA_BLOQER_V2.md",
  "00-product/GLOSSARY.md",
  "00-product/PRODUCT_SCOPE.md",
  "01-domain/DOMAIN_OVERVIEW.md",
  "02-modules/PROCUREMENT.md",
  "02-modules/PURCHASE_REQUESTS.md",
  "02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md",
  "02-modules/INVENTORY.md",
  "02-modules/PROJECT_SCHEDULING.md",
  "02-modules/JOBSITE_LOG.md",
  "02-modules/CERTIFICATIONS.md",
  "02-modules/EXPENSES_AND_PAYMENTS.md",
  "02-modules/SALES_AND_COLLECTIONS.md",
  "02-modules/TREASURY.md",
  "03-finance/ACCOUNTS_PAYABLE.md",
  "03-finance/ACCOUNTS_RECEIVABLE.md",
  "03-finance/TREASURY_MODEL.md",
  "08-architecture/HELP_CENTER.md",
] as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const DOCS_ROOT = path.join(REPO_ROOT, "docs/bloqer2.0");
export const DOCS_INDEX_PATH = path.join(__dirname, "../knowledge/generated/docs-index.json");

export function hashFileContent(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export type SourceFileMeta = { path: string; sha256: string; bytes: number };

/** Stable hash over INCLUDE list + file contents (missing files counted as absent). */
export function computeKnowledgeSourceManifest(): {
  sourceHash: string;
  sources: SourceFileMeta[];
} {
  const sources: SourceFileMeta[] = [];
  const hash = crypto.createHash("sha256");
  for (const rel of KNOWLEDGE_DOC_INCLUDE) {
    hash.update(rel);
    hash.update("\0");
    const abs = path.join(DOCS_ROOT, rel);
    if (!fs.existsSync(abs)) {
      hash.update("MISSING");
      sources.push({ path: `docs/bloqer2.0/${rel}`, sha256: "MISSING", bytes: 0 });
      continue;
    }
    const content = fs.readFileSync(abs, "utf8");
    const sha = hashFileContent(content);
    hash.update(sha);
    sources.push({ path: `docs/bloqer2.0/${rel}`, sha256: sha, bytes: Buffer.byteLength(content, "utf8") });
  }
  return { sourceHash: hash.digest("hex"), sources };
}
