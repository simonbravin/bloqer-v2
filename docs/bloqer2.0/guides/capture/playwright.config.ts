import { defineConfig, devices } from "@playwright/test";

const baseURL = (
  process.env.DOCS_BASE_URL ||
  process.env.E2E_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    trace: "off",
    screenshot: "off",
  },
});
