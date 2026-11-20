import { defineConfig } from "@playwright/test";
import publicSmoke from "./playwright-smoke.config";

// Only the disposable CI database is accepted; no external base URL or DB override.
if (process.env.CI !== "true") throw new Error("Authenticated fixture smoke runs only in isolated CI.");
if (!process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD || !process.env.CI_PILOT_POSTGRES_PASSWORD) {
  throw new Error("The CI fixture credentials must be supplied explicitly.");
}
const server = publicSmoke.webServer;
if (!server || Array.isArray(server)) throw new Error("Expected the isolated public smoke server.");
const baseURL = "http://127.0.0.1:3101";
const databaseURL = new URL("postgresql://bloqer_ci@127.0.0.1:5432/bloqer_ci_pilot");
databaseURL.password = process.env.CI_PILOT_POSTGRES_PASSWORD;

export default defineConfig({
  ...publicSmoke,
  testDir: "./e2e/authenticated-smoke",
  outputDir: "test-results/authenticated-smoke",
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-authenticated" }]],
  use: { ...publicSmoke.use, baseURL },
  webServer: {
    ...server,
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3101",
    url: `${baseURL}/login`,
    env: {
      ...server.env,
      AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      APP_URL: baseURL,
      DATABASE_URL: databaseURL.toString(),
      DIRECT_URL: databaseURL.toString(),
    },
  },
});
