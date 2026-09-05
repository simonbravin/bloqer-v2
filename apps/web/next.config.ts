import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root so Vercel output tracing includes hoisted pnpm .prisma client engines. */
const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  // Belt-and-suspenders: include AI docs index if any code path still reads it from disk.
  outputFileTracingIncludes: {
    "/api/ai/chat": [
      "../../packages/ai/knowledge/generated/docs-index.json",
    ],
  },
  async redirects() {
    return [
      // Abandoned i18n locale prefix — UI is es-AR only, no `/es` routes.
      { source: "/es", destination: "/", permanent: true },
      { source: "/es/:path*", destination: "/:path*", permanent: true },
      { source: "/tesoreria/reportes", destination: "/tesoreria", permanent: true },
      {
        source: "/tesoreria/reportes/posicion-caja",
        destination: "/tesoreria",
        permanent: true,
      },
      {
        source: "/tesoreria/posicion-caja",
        destination: "/tesoreria",
        permanent: true,
      },
      {
        source: "/tesoreria/reportes/movimientos",
        destination: "/tesoreria/cuentas",
        permanent: true,
      },
      {
        source: "/tesoreria/reportes/flujo-caja",
        destination: "/tesoreria/flujo-caja",
        permanent: true,
      },
      {
        source: "/configuracion/compras",
        destination: "/configuracion/politicas",
        permanent: true,
      },
      {
        source: "/configuracion/presupuestos",
        destination: "/configuracion/politicas",
        permanent: true,
      },
      // D-098: Presupuesto vs real absorbed into EDT y costos
      {
        source: "/proyectos/:id/reportes/presupuesto-vs-real",
        destination: "/proyectos/:id/control-costos",
        permanent: true,
      },
    ];
  },
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/engines",
    "prisma",
    "@react-pdf/renderer",
    "@react-pdf/pdfkit",
    "fontkit",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...(config.plugins ?? []), new PrismaPlugin()];
    }
    return config;
  },
  transpilePackages: [
    "@bloqer/ai",
    "@bloqer/config",
    "@bloqer/domain",
    "@bloqer/validators",
    "@bloqer/services",
    "@bloqer/report-pdf",
    "@bloqer/database",
    "@bloqer/ui",
    "@bloqer/email",
    "@bloqer/storage",
    "@bloqer/auth",
    "@bloqer/utils",
  ],
};

export default nextConfig;
