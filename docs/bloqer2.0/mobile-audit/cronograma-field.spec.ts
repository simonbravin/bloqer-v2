import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};
const OUT_DIR = path.resolve(__dirname, "after-schedule-field");

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

async function gotoCronograma(page: Page, projectId: string, query = "field=today"): Promise<void> {
  const res = await page.goto(`/proyectos/${projectId}/cronograma?${query}`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await settle(page);
  expect(res?.status() ?? 200).toBeLessThan(400);
}

async function capture(page: Page, filename: string, fullPage = true): Promise<void> {
  await settle(page);
  await page.screenshot({ path: shotPath(filename), fullPage, animations: "disabled" });
}

test.describe.configure({ mode: "serial" });

test.describe("Cronograma Field", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("390 field list, filters, detail and optional start", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    expect(pid).toBeTruthy();

    await gotoCronograma(page, pid!);
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    await expect(page.getByRole("heading", { name: "Cronograma" })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("schedule-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("schedule-gantt-view")).toHaveCount(0);
    await expect(page.getByTestId("schedule-field-chip-today")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("schedule-field-card").first()).toBeVisible();
    await capture(page, "01-cronograma-hoy-390.png");
    await capture(page, "05-task-card-390.png");

    const queryMs = await page.getByTestId("schedule-field-view").getAttribute("data-query-ms");
    console.log(`cronograma field queryMs=${queryMs}`);

    await page.getByTestId("schedule-field-chip-week").click();
    await expect(page.getByTestId("schedule-field-chip-week")).toHaveAttribute("aria-pressed", "true");
    await settle(page);
    await expect(page.getByTestId("schedule-field-view")).toBeVisible();
    await capture(page, "02-cronograma-semana-390.png");

    await page.getByTestId("schedule-field-chip-delayed").click();
    await expect(page.getByTestId("schedule-field-chip-delayed")).toHaveAttribute("aria-pressed", "true");
    await settle(page);
    await capture(page, "03-cronograma-atrasadas-390.png");

    await page.getByTestId("schedule-field-chip-blocked").click();
    await expect(page.getByTestId("schedule-field-chip-blocked")).toHaveAttribute("aria-pressed", "true");
    await settle(page);
    await expect(page.getByText(/Campo: Instalación eléctrica|bloqueada/i).first()).toBeVisible();
    await capture(page, "04-cronograma-bloqueadas-390.png");

    await page.getByTestId("schedule-field-chip-in_progress").click();
    await expect(page.getByTestId("schedule-field-chip-in_progress")).toHaveAttribute("aria-pressed", "true");
    await settle(page);
    await expect(page.getByTestId("schedule-field-card").first()).toBeVisible();

    await page.getByTestId("schedule-field-search").fill("Hormigonado");
    await expect(page.getByTestId("schedule-field-card").filter({ hasText: "Hormigonado" })).toBeVisible();

    await page.getByTestId("schedule-field-card").filter({ hasText: "Hormigonado" }).click();
    const sheet = page.getByTestId("schedule-field-item-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/EDT|01/i).first()).toBeVisible();
    await expect(sheet.getByText(/Real/i).first()).toBeVisible();
    await capture(page, "06-task-detail-390.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 10_000 });
    await page.getByTestId("schedule-field-search").fill("");

    await page.getByTestId("schedule-field-chip-week").click();
    await expect(page.getByTestId("schedule-field-chip-week")).toHaveAttribute("aria-pressed", "true");
    await settle(page);
    const weekTask = page.getByTestId("schedule-field-card").filter({ hasText: "Impermeabilización" });
    if (await weekTask.isVisible().catch(() => false)) {
      await weekTask.click();
      await expect(sheet).toBeVisible();
      const startBtn = page.getByTestId("schedule-field-action-in_progress");
      if (await startBtn.isVisible().catch(() => false)) {
        await startBtn.click();
        await expect(page.getByText(/Tarea iniciada|En curso/i).first()).toBeVisible({ timeout: 20_000 });
      }
      await page.keyboard.press("Escape");
    }
  });

  test("VIEWER can read and has no field mutations", async ({ page }) => {
    test.skip(!env.fieldViewerEmail && !docsIds.fieldViewerEmail, "Requires viewer demo user");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, { ...env, email: env.fieldViewerEmail ?? docsIds.fieldViewerEmail! });
    const pid = env.projectId ?? docsIds.projectId;
    await gotoCronograma(page, pid!);
    await assertNotOnErrorPage(page);
    await expect(page.getByTestId("schedule-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("schedule-field-card").first()).toBeVisible();
    await page.getByTestId("schedule-field-card").first().click();
    await expect(page.getByTestId("schedule-field-item-sheet")).toBeVisible();
    await expect(page.getByTestId("schedule-field-action-in_progress")).toHaveCount(0);
    await expect(page.getByTestId("schedule-field-action-completed")).toHaveCount(0);
    await capture(page, "07-cronograma-viewer-390.png");
  });

  test("430 / 768 field list and 1440 desktop Gantt", async ({ page }) => {
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;

    await page.setViewportSize({ width: 430, height: 932 });
    await gotoCronograma(page, pid!);
    await expect(page.getByTestId("schedule-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("schedule-gantt-view")).toHaveCount(0);
    await capture(page, "08-cronograma-430.png");

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoCronograma(page, pid!);
    await expect(page.getByTestId("schedule-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("schedule-gantt-view")).toHaveCount(0);
    await capture(page, "09-cronograma-768.png");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoCronograma(page, pid!, "view=gantt");
    await expect(page.getByRole("button", { name: "Gantt" })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("button", { name: "Kanban" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tabla" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Calendario" })).toBeVisible();
    await expect(page.getByTestId("schedule-field-view")).toHaveCount(0);
    await expect(page.getByTestId("schedule-gantt-view")).toBeVisible();
    await capture(page, "10-gantt-1440.png");
  });
});
