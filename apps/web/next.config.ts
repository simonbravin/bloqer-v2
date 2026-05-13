import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root so Vercel output tracing includes hoisted pnpm .prisma client engines. */
const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  serverExternalPackages: ["@prisma/client", "@prisma/engines", "prisma"],
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
    "@bloqer/database",
    "@bloqer/ui",
    "@bloqer/email",
    "@bloqer/storage",
    "@bloqer/auth",
    "@bloqer/utils",
  ],
};

export default nextConfig;
