import { defineConfig, devices } from "@playwright/test";

/**
 * Minimal Phase 5 E2E. Skips locally/CI unless E2E_BASE_URL + credentials are set.
 * See apps/web/e2e/README.md
 */
const baseURL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
  },
});
