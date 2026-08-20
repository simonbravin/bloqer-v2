import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};
const OUT_DIR = path.resolve(__dirname, "after-field-navigation");

function shotPath(filename: string): string {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, filename);
}

async function dismissDevOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  }).catch(() => undefined);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await dismissDevOverlays(page);
  await page.waitForTimeout(400);
}

async function gotoSafe(page: Page, route: string): Promise<void> {
  const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await settle(page);
  expect(res?.status() ?? 200).toBeLessThan(400);
}

async function capture(page: Page, filename: string, fullPage = true): Promise<void> {
  await settle(page);
  await page.screenshot({ path: shotPath(filename), fullPage, animations: "disabled" });
}

test.describe.configure({ mode: "serial" });

test.describe("Field Navigation after screenshots", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("390 field navigation screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    if (pid) await gotoSafe(page, `/proyectos/${pid}`);
    await gotoSafe(page, "/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);
    await expect(page.getByTestId("field-home")).toBeVisible({ timeout: 40_000 });
    await capture(page, "01-field-home-390.png");
    await capture(page, "02-field-home-pendientes-390.png");
    await capture(page, "03-bottom-nav-390.png", false);

    await page.getByTestId("field-plus-button").click();
    await expect(page.getByTestId("field-plus-sheet")).toBeVisible();
    await capture(page, "04-plus-sheet-390.png", false);
    await page.keyboard.press("Escape");

    await page.context().clearCookies({ name: "bloqer-last-project-id" }).catch(() => undefined);
    await page.evaluate(() => {
      document.cookie = "bloqer-last-project-id=; Path=/; Max-Age=0";
    });
    await gotoSafe(page, "/dashboard");
    await page.getByTestId("field-plus-button").click();
    await page.getByRole("button", { name: /nuevo parte/i }).click();
    await expect(page.getByTestId("field-project-picker")).toBeVisible({ timeout: 15_000 });
    await capture(page, "05-project-selector-390.png", false);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await gotoSafe(page, "/pendientes");
    await expect(page.getByTestId("field-pending-inbox")).toBeVisible({ timeout: 20_000 });
    await capture(page, "06-pendientes-390.png");
    await page.getByRole("link", { name: /^compras$/i }).click();
    await page.waitForURL(/grupo=compras/, { timeout: 20_000, waitUntil: "domcontentloaded" });
    await settle(page);
    await capture(page, "07-pendientes-compras-390.png");

    if (pid) await gotoSafe(page, `/proyectos/${pid}`);
    await page.getByTestId("field-more-button").click();
    await expect(page.getByTestId("field-more-sheet")).toBeVisible();
    await capture(page, "08-mas-sheet-390.png", false);
    await page.keyboard.press("Escape");

    const viewer = env.fieldViewerEmail ?? docsIds.fieldViewerEmail;
    if (viewer) {
      await page.context().clearCookies();
      await login(page, { ...env, email: viewer });
      await gotoSafe(page, "/dashboard");
      await expect(page.getByTestId("field-home")).toBeVisible({ timeout: 40_000 });
      await capture(page, "09-field-home-viewer-390.png");
    }
  });

  test("430 / 768 / 1440", async ({ page }) => {
    await login(page, env);
    await page.setViewportSize({ width: 430, height: 932 });
    await gotoSafe(page, "/dashboard");
    await capture(page, "field-home-430.png");

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoSafe(page, "/dashboard");
    await capture(page, "10-dashboard-768.png");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoSafe(page, "/dashboard");
    await capture(page, "11-dashboard-1440.png");
  });
});
