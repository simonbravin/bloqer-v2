import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
