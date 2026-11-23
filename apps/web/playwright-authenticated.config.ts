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
      // Chat navigation is tested with intercepted responses and no provider credentials.
      BLOQER_AI_ENABLED: "true",
      BLOQER_AI_ALLOW_PRODUCTION: "true",
      BLOQER_AI_PURCHASE_REQUEST_AUDIO_ENABLED: "false",
      AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      APP_URL: baseURL,
      DATABASE_URL: databaseURL.toString(),
      DIRECT_URL: databaseURL.toString(),
      // Synthetic signing only. Upload recovery tests intercept PUT/confirm in the
      // browser; they never send files to R2 or use production credentials.
      R2_ACCOUNT_ID: "00000000000000000000000000000000",
      R2_ACCESS_KEY_ID: "isolated-browser-fixture",
      R2_SECRET_ACCESS_KEY: "isolated-browser-fixture-not-a-real-secret",
      R2_BUCKET_NAME: "isolated-browser-fixture",
    },
  },
});
