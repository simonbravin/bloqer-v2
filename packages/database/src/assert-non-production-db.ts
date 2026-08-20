/**
 * Tooling-only guard. Do not import from the Next.js app runtime.
 * Refuses seed / migrate-dev / db-push against the known production compute.
 */
const PRODUCTION_HOST_MARKERS = [
  // Neon project bloqer-v2, branch `production` (primary/default).
  "ep-cold-mouse-appkpn84",
];

const OVERRIDE_ENV = "BLOQER_ALLOW_PRODUCTION_DB";
const OVERRIDE_VALUE = "I_UNDERSTAND_THIS_IS_PRODUCTION";

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.replace(/^postgres(ql)?:/i, "https:")).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isProductionHost(host: string | null): boolean {
  if (!host) return false;
  return PRODUCTION_HOST_MARKERS.some((marker) => host.includes(marker));
}

export function assertNonProductionDatabase(): void {
  const hits = (["DATABASE_URL", "DIRECT_URL"] as const)
    .map((key) => ({ key, host: hostOf(process.env[key]) }))
    .filter((row) => isProductionHost(row.host));

  if (hits.length === 0) return;

  if (process.env[OVERRIDE_ENV] === OVERRIDE_VALUE) {
    console.warn(
      `[db-guard] ${OVERRIDE_ENV}=${OVERRIDE_VALUE} set; allowing a production DB command.`,
    );
    return;
  }

  console.error("Refusing to run this development command against production.");
  console.error(`Detected production Neon compute in: ${hits.map((h) => h.key).join(", ")}`);
  console.error("Marker: ep-cold-mouse-appkpn84 (bloqer-v2 branch `production`).");
  console.error("Point DATABASE_URL/DIRECT_URL at Neon branch `dev`.");
  console.error(
    `For an explicit production operation, set ${OVERRIDE_ENV}=${OVERRIDE_VALUE}.`,
  );
  process.exit(1);
}
