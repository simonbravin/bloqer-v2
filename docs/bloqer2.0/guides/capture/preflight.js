#!/usr/bin/env node
/**
 * Preflight checks before running Playwright captures.
 */
const base = (
  process.env.DOCS_BASE_URL ||
  process.env.E2E_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

async function main() {
  const errors = [];

  if (!process.env.AUTH_SECRET?.trim()) {
    errors.push("AUTH_SECRET no está definido. Levantá la app con `dotenv -e .env -- pnpm --filter @bloqer/web dev`.");
  }

  try {
    const res = await fetch(`${base}/api/auth/providers`, { redirect: "manual" });
    if (res.status >= 500) {
      errors.push(`/api/auth/providers respondió ${res.status}. Revisá AUTH_SECRET y logs del dev server.`);
    }
  } catch (e) {
    errors.push(`No se pudo contactar ${base}: ${e.message}`);
  }

  if (errors.length) {
    console.error("Preflight FAILED:\n- " + errors.join("\n- "));
    process.exit(1);
  }

  console.log(`Preflight OK (${base})`);
}

main();
