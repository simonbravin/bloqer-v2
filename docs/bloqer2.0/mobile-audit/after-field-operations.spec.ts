import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const OUT_DIR = path.resolve(__dirname, "after-field-operations");
const FIXTURE_PNG = path.resolve(__dirname, "fixtures/jobsite-evidence.png");

function shotPath(filename: string): string {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, filename);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
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

async function dismissDevOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Field Operations after screenshots", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("390 field screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    await gotoSafe(page, "/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    const pid = env.projectId!;
    await gotoSafe(page, `/proyectos/${pid}/libro-obra`);
    await expect(page.getByRole("heading", { name: /libro de obra/i })).toBeVisible({ timeout: 40_000 });
    await capture(page, "01-libro-list-390.png");

    await gotoSafe(page, `/proyectos/${pid}/libro-obra/nuevo`);
    await expect(page.getByRole("heading", { name: /nuevo parte/i })).toBeVisible();
    await capture(page, "02-nuevo-parte-390.png");

    if (fs.existsSync(FIXTURE_PNG)) {
      await page.getByTestId("jobsite-log-evidence-file").setInputFiles(FIXTURE_PNG);
      await expect(page.getByText(/Foto 1/)).toBeVisible({ timeout: 8_000 });
      await page.getByText(/Foto 1/).scrollIntoViewIfNeeded();
    }
    await capture(page, "03-parte-foto-preview-390.png");

    const logId = env.jobsiteLogId;
    if (logId) {
      await gotoSafe(page, `/proyectos/${pid}/libro-obra/${logId}`);
      await capture(page, "04-parte-detalle-390.png");
      await capture(page, "05-parte-documentos-390.png");
    }

    await gotoSafe(page, `/proyectos/${pid}/consumos`);
    await capture(page, "06-consumos-390.png");

    const register = page.getByRole("button", { name: /registrar consumo/i }).first();
    if (await register.isVisible().catch(() => false)) {
      await register.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
      await capture(page, "07-nuevo-consumo-390.png", false);
      await page.keyboard.press("Escape");
    }

    await gotoSafe(page, `/proyectos/${pid}/documentos`);
    await dismissDevOverlays(page);
    const addBtn = page.getByTestId("document-upload-trigger");
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click({ force: true });
      await page.waitForTimeout(500);
      await dismissDevOverlays(page);
      await capture(page, "08-documentos-camera-390.png", false);
    }
  });

  test("1440 libro desktop table remains", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, env);
    const pid = env.projectId!;
    await gotoSafe(page, `/proyectos/${pid}/libro-obra`);
    await expect(page.getByRole("button", { name: /^tabla$/i })).toBeVisible();
    await capture(page, "09-libro-desktop-1440.png");

    await page.setViewportSize({ width: 430, height: 932 });
    await gotoSafe(page, `/proyectos/${pid}/libro-obra`);
    await capture(page, "10-libro-list-430.png");

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoSafe(page, `/proyectos/${pid}/libro-obra`);
    await capture(page, "11-libro-768.png");
  });
});
