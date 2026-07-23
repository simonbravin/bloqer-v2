import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root so Vercel output tracing includes hoisted pnpm .prisma client engines. */
const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  async redirects() {
    return [
      { source: "/tesoreria/reportes", destination: "/tesoreria", permanent: true },
      {
        source: "/tesoreria/reportes/posicion-caja",
        destination: "/tesoreria/posicion-caja",
        permanent: true,
      },
      {
        source: "/tesoreria/reportes/movimientos",
        destination: "/tesoreria/movimientos",
        permanent: true,
      },
      {
        source: "/tesoreria/reportes/flujo-caja",
        destination: "/tesoreria/flujo-caja",
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
