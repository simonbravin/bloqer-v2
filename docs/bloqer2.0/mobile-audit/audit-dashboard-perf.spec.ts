import { test, expect, type Page } from "@playwright/test";
import { getEnv } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage } from "../guides/capture/lib/auth";

const env = getEnv();

async function dismissDevOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  });
}

test.describe("Audit dashboard viewport split", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("sm cookie does not render desktop dashboard HTML", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const origin = new URL(page.url()).origin;
    await page.context().addCookies([
      {
        name: "bloqer-viewport",
        value: "sm",
        url: origin,
      },
    ]);
    const started = Date.now();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await dismissDevOverlays(page);
    await expect(page.getByTestId("field-home")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("desktop-dashboard")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Panel de control" })).toHaveCount(0);
    await assertNotOnErrorPage(page);
    console.log(`[audit] /dashboard 390 sm cookie loadMs=${Date.now() - started}`);
  });

  test("md cookie does not render field home HTML", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, env);
    const origin = new URL(page.url()).origin;
    await page.context().addCookies([
      {
        name: "bloqer-viewport",
        value: "md",
        url: origin,
      },
    ]);
    const started = Date.now();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await dismissDevOverlays(page);
    await expect(page.getByTestId("desktop-dashboard")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("field-home")).toHaveCount(0);
    await assertNotOnErrorPage(page);
    console.log(`[audit] /dashboard 1440 md cookie loadMs=${Date.now() - started}`);
  });

  test("pendientes 390 loads", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const started = Date.now();
    await page.goto("/pendientes", { waitUntil: "domcontentloaded" });
    await dismissDevOverlays(page);
    await expect(page.getByRole("heading", { name: "Pendientes" })).toBeVisible({ timeout: 40_000 });
    await assertNotOnErrorPage(page);
    console.log(`[audit] /pendientes 390 loadMs=${Date.now() - started}`);
  });
});
