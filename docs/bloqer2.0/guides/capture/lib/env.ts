import fs from "fs";
import path from "path";

const GUIDES_DIR = path.resolve(__dirname, "../..");
export const SCREENSHOTS_DIR = path.join(GUIDES_DIR, "assets", "screenshots");
export const VIEWPORT = { width: 1440, height: 1000 };

export interface DocsEnv {
  baseUrl: string;
  email: string;
  password: string;
  configured: boolean;
  projectId?: string;
  poId?: string;
  budgetId?: string;
  accountId?: string;
  reconciliationId?: string;
  reconciliationCloseReadyId?: string;
  certificationId?: string;
  salesInvoiceId?: string;
  jobsiteLogId?: string;
  subcontractId?: string;
  subcontractCertificationId?: string;
  wbsExpandItemNodeId?: string;
}

export function loadDocsIds(): Record<string, string> | null {
  try {
    const p = path.join(GUIDES_DIR, "docs-demo-ids.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, string>;
  } catch {
    return null;
  }
}

function pick(ids: Record<string, string> | null, key: string, envKey: string): string | undefined {
  return process.env[envKey]?.trim() || ids?.[key] || undefined;
}

export function getEnv(): DocsEnv {
  const ids = loadDocsIds();
  const baseUrl = (
    process.env.DOCS_BASE_URL ||
    process.env.E2E_BASE_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
  const email = (
    ids?.docsUserEmail ||
    process.env.DOCS_USER_EMAIL ||
    process.env.E2E_USER_EMAIL ||
    process.env.SEED_USER_EMAIL ||
    ""
  ).trim();
  const password = (
    process.env.DOCS_USER_PASSWORD ||
    process.env.E2E_USER_PASSWORD ||
    process.env.SEED_USER_PASSWORD ||
    ""
  ).trim();

  return {
    baseUrl,
    email,
    password,
    configured: Boolean(baseUrl && email && password),
    projectId: pick(ids, "projectId", "DOCS_PROJECT_ID"),
    poId: pick(ids, "confirmedPoId", "DOCS_PO_ID"),
    budgetId: pick(ids, "budgetId", "DOCS_BUDGET_ID"),
    accountId: pick(ids, "treasuryAccountId", "DOCS_ACCOUNT_ID") || pick(ids, "accountId", "DOCS_ACCOUNT_ID"),
    reconciliationId: pick(ids, "reconciliationId", "DOCS_RECONCILIATION_ID"),
    reconciliationCloseReadyId: pick(ids, "reconciliationCloseReadyId", "DOCS_RECONCILIATION_CLOSE_ID"),
    certificationId: pick(ids, "certificationId", "DOCS_CERTIFICATION_ID"),
    salesInvoiceId: pick(ids, "salesInvoiceId", "DOCS_SALES_INVOICE_ID"),
    jobsiteLogId: pick(ids, "jobsiteLogId", "DOCS_JOBSITE_LOG_ID"),
    subcontractId: pick(ids, "subcontractId", "DOCS_SUBCONTRACT_ID"),
    subcontractCertificationId: pick(ids, "subcontractCertificationId", "DOCS_SUBCONTRACT_CERT_ID"),
    wbsExpandItemNodeId: pick(ids, "wbsExpandItemNodeId", "DOCS_WBS_EXPAND_NODE_ID"),
  };
}

export function screenshotPath(filename: string): string {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  return path.join(SCREENSHOTS_DIR, filename);
}

export function loadManifest(): {
  captures: Array<{
    id: string;
    filename: string;
    title: string;
    slug?: string;
    pilot?: boolean;
    applied?: boolean;
    internalOnly?: boolean;
    routeTemplate?: string | null;
    route?: string | null;
  }>;
} {
  const manifestPath = path.join(GUIDES_DIR, "screenshots-manifest.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}
