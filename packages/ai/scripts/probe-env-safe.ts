import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../../../.env"),
];
let text = "";
for (const p of candidates) {
  try {
    text = readFileSync(p, "utf8");
    console.log(`envFile=${p}`);
    break;
  } catch {
    /* next */
  }
}
if (!text) {
  console.error("No .env found");
  process.exit(1);
}
const interesting = [
  "OPENAI_API_KEY",
  "BLOQER_AI_ENABLED",
  "BLOQER_AI_PROVIDER",
  "BLOQER_AI_MODEL",
  "BLOQER_AI_ALLOW_PRODUCTION",
  "SEED_USER_EMAIL",
  "SEED_USER_PASSWORD",
  "DOCS_USER_EMAIL",
  "DOCS_USER_PASSWORD",
  "E2E_USER_EMAIL",
  "E2E_USER_PASSWORD",
  "E2E_BASE_URL",
  "APP_ENV",
];
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) continue;
  if (!interesting.includes(m[1]!)) continue;
  const n = m[1]!;
  let v = m[2]!;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (/KEY|PASSWORD|SECRET/.test(n)) {
    console.log(`${n}=${v.length > 0 ? `SET(len=${v.length})` : "EMPTY"}`);
  } else {
    console.log(`${n}=${v || "EMPTY"}`);
  }
}
