const PORTAL_HOST = "ep-cold-mouse-appkpn84.c-7.us-east-1.aws.neon.tech";
const PORTAL_DATABASE = "/neondb";

function parseDatabaseUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error(`${name} must identify a PostgreSQL host and database`);
  }
  const schemas = url.searchParams.getAll("schema");
  if (schemas.length > 1 || schemas[0] === "" ||
      [...url.searchParams.keys()].some((key) => ["host", "port", "dbname", "database"].includes(key.toLowerCase()))) {
    throw new Error(`${name} must declare an unambiguous PostgreSQL destination`);
  }
  const host = url.hostname.toLowerCase();
  const pooled = host.endsWith(".neon.tech") && /-pooler\./.test(host);
  return {
    host: pooled ? host.replace(/-pooler(?=\.)/, "") : host,
    pooled,
    port: url.port || "5432",
    database: url.pathname,
    schema: schemas[0] ?? "public",
  };
}

export function resolveVercelMigrationTarget(env) {
  if (env.VERCEL !== "1") return null;

  const environment = env.VERCEL_ENV;
  if (environment !== "production" && environment !== "preview" && environment !== "development") {
    throw new Error("VERCEL_ENV must identify production, preview or development");
  }

  const runtime = parseDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");
  const direct = parseDatabaseUrl(env.DIRECT_URL, "DIRECT_URL");
  if (direct.pooled) throw new Error("DIRECT_URL must use the direct PostgreSQL endpoint");
  if (runtime.host !== direct.host || runtime.port !== direct.port || runtime.database !== direct.database ||
      runtime.schema !== direct.schema) {
    throw new Error("DATABASE_URL and DIRECT_URL must point to the same database and schema");
  }
  if (environment === "production") {
    if (direct.host !== PORTAL_HOST || direct.database !== PORTAL_DATABASE || direct.schema !== "public" ||
        direct.port !== "5432") {
      throw new Error("Vercel production must target the Bloqer portal database");
    }
  } else if (direct.host === PORTAL_HOST) {
    throw new Error("Non-production Vercel deployments must use a database outside the portal compute");
  }

  return environment;
}
