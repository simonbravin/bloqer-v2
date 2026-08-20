import { defineConfig, devices } from "@playwright/test";

const baseURL = (
  process.env.DOCS_BASE_URL ||
  process.env.E2E_BASE_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

/**
 * Mobile UX audit captures.
 * Reuses credentials / demo-tenant guards from `docs/bloqer2.0/guides/capture/lib`.
 * Intentionally separate from the guide screenshot pipeline (does not write to assets/screenshots).
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 720_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    trace: "off",
    screenshot: "off",
  },
});
